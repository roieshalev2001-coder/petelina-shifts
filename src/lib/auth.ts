import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "./db";

const COOKIE = "petelina_session";

/*
 * שלושים יום.
 *
 * ארוך בכוונה: העובדים מקבלים את פרטי הכניסה בוואטסאפ, ורבים יפתחו את
 * הקישור בדפדפן הפנימי של וואטסאפ. הסשן נשמר שם ולא בספארי, ולכן כל
 * תפוגה קצרה הייתה מתורגמת להקלדת קוד חוזרת — ומשם לפניות אליך.
 */
const MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

/**
 * המפתח שחותם על הסשן.
 *
 * זורק בהיעדרו, ולא נופל לברירת מחדל. קודם הייתה כאן `?? "dev-secret"`,
 * כלומר אם המשתנה היה נעלם בפריסה כל אחד היה יכול לחתום לעצמו עוגיית
 * מנהל — בשקט, בלי שום סימן במערכת. כשל רועש עדיף על דלת פתוחה שקטה.
 */
function secret(): string {
  const value = process.env.AUTH_SECRET;
  if (!value) {
    throw new Error(
      "AUTH_SECRET אינו מוגדר. בלעדיו אי אפשר לחתום על הסשן, וכל אחד היה יכול לזייף כניסה.",
    );
  }
  return value;
}

function sign(value: string): string {
  return createHmac("sha256", secret()).update(value).digest("base64url");
}

function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

// ---------------------------------------------------------------------------
// העוגייה
// ---------------------------------------------------------------------------

/** `<employeeId>.<expiresAt>.<signature>` — המזהה הוא cuid ואין בו נקודות */
function createSession(employeeId: string): string {
  const payload = `${employeeId}.${Date.now() + MAX_AGE_SECONDS * 1000}`;
  return `${payload}.${sign(payload)}`;
}

/**
 * מזהה העובד מתוך העוגייה, או null.
 *
 * מאמת חתימה ותפוגה בלבד — **לא** קורא למסד. מי שהעובד הזה ומה מותר לו
 * נקבע ב-currentUser, כי הרשאות משתנות והעוגייה חיה 30 יום.
 */
async function sessionEmployeeId(): Promise<string | null> {
  const raw = (await cookies()).get(COOKIE)?.value;
  if (!raw) return null;

  const parts = raw.split(".");
  if (parts.length !== 3) return null;
  const [employeeId, expiresAt, signature] = parts;
  if (!safeEqual(signature, sign(`${employeeId}.${expiresAt}`))) return null;
  if (!(Number(expiresAt) > Date.now())) return null;
  return employeeId;
}

export async function signIn(employeeId: string) {
  (await cookies()).set(COOKIE, createSession(employeeId), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: MAX_AGE_SECONDS,
    path: "/",
  });
}

export async function signOut() {
  (await cookies()).delete(COOKIE);
}

// ---------------------------------------------------------------------------
// מי מחובר
// ---------------------------------------------------------------------------

/**
 * העובד המחובר, או null.
 *
 * ההרשאה ו-active נקראים **מהמסד בכל בקשה** ולא מהעוגייה. אם היו יושבים
 * בעוגייה, שלילת הרשאת ניהול או הוצאת עובד היו נכנסות לתוקף רק בעוד 30
 * יום — ומי שהוצא היה ממשיך להיכנס כאילו כלום.
 *
 * עטוף ב-cache של React: ה-layout, הדף שמתחתיו והפעולות שבו קוראים לו
 * באותו רינדור. ה-cache מאחד אותם לשאילתה אחת לבקשה ומתאפס מעצמו בין בקשות.
 *
 * השדות מצומצמים לְמה שהממשק צריך — הערות פרטיות, ותק ומכסות אינם נחשפים
 * כאן לעולם, גם לא למנהל, כי הערך הזה זורם גם למסכי העובד.
 */
export const currentUser = cache(async () => {
  const id = await sessionEmployeeId();
  if (!id) return null;

  const employee = await prisma.employee.findUnique({
    where: { id },
    select: {
      id: true,
      fullName: true,
      phone: true,
      roles: true,
      active: true,
      canManage: true,
      mustChangePasscode: true,
    },
  });
  if (!employee || !employee.active) return null;
  return employee;
});

export type CurrentUser = NonNullable<Awaited<ReturnType<typeof currentUser>>>;

/**
 * לכל מסך שדורש התחברות.
 *
 * מפנה למסך הכניסה אם אין סשן תקף, ולבחירת קוד אם העובד עדיין מחזיק בקוד
 * הזמני שהמנהל נתן לו. מסך בחירת הקוד עצמו אינו קורא לכאן — הוא משתמש
 * ב-currentUser ישירות, אחרת ההפניה הייתה מפנה אליו את עצמו בלולאה.
 */
export async function requireUser(): Promise<CurrentUser> {
  const user = await currentUser();
  if (!user) redirect("/login");
  if (user.mustChangePasscode) redirect("/me/passcode");
  return user;
}

/**
 * לכל מסך ופעולה באזור הניהול — מחזיר את המנהל שפעל.
 *
 * הבדיקה נשארת בכל דף ובכל פעולה ולא עוברת ל-layout: בניווט צד-לקוח Next
 * מרנדר מחדש רק את המקטע שהשתנה, ובדיקה שיושבת ב-layout עלולה לא לרוץ.
 * ה-layout הוא כרום, לא גבול אבטחה.
 */
export async function requireManager(): Promise<CurrentUser> {
  const user = await requireUser();
  // מי שמחובר אך אינו מנהל מוחזר לאזור שלו, לא למסך כניסה שכבר עבר
  if (!user.canManage) redirect("/me");
  return user;
}

/**
 * שריד מתקופת הקישורים האישיים: עמודת `token` עדיין קיימת ו-`@unique`,
 * ולכן יצירת עובד חייבת למלא אותה. תיעלם כשהעמודה תרד.
 */
export function newEmployeeToken(): string {
  return randomBytes(16).toString("base64url");
}
