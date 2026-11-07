import { redirect } from "next/navigation";
import { BandHero } from "@/components/Band";
import { LegalLinks } from "@/components/ui";
import { currentUser, signIn } from "@/lib/auth";
import { attemptLogin } from "@/lib/login";
import { LoginForm } from "./LoginForm";

export const metadata = { title: "כניסה · פטלינה" };

/*
 * לאן נוחתים אחרי כניסה.
 *
 * מנהל נוחת באזור הניהול ולא באזור האישי: הוא נכנס כדי לסדר, ונחיתה
 * במסך "המשמרות שלי" נראית כאילו ההרשאה לא נתפסה. שני האזורים מקושרים
 * זה לזה בכותרת, ולכן זו ברירת מחדל ולא מחסום.
 *
 * **חייבת לשבת ברמת המודול.** כשהיא הייתה בגוף הרכיב, ה-server action
 * שמתחתיה סגר עליה — ו-Next מסריאל את מה שפעולה סוגרת עליו. פונקציה
 * אינה ניתנת לסריאליזציה, ולכן הבנייה עברה והכניסה נפלה בשגיאת שרת רק
 * בהרצה בפועל.
 */
function landing(u: { mustChangePasscode: boolean; canManage: boolean }): string {
  if (u.mustChangePasscode) return "/me/passcode";
  return u.canManage ? "/manager" : "/me";
}

export default async function LoginPage() {
  // מי שכבר מחובר לא רואה מסך כניסה
  const user = await currentUser();
  if (user) redirect(landing(user));

  async function login(phone: string, passcode: string) {
    "use server";
    const result = await attemptLogin(phone, passcode);
    if (!result.ok) return { ok: false as const, error: result.error };

    await signIn(result.employeeId);
    /*
     * ההפניה יוצאת מהפעולה ולא מהלקוח, כדי שהעוגייה והניווט יקרו באותה
     * תשובה. redirect זורק, ולכן הוא מחוץ לכל try.
     */
    redirect(
      landing({
        mustChangePasscode: result.mustChange,
        canManage: result.canManage,
      }),
    );
  }

  return (
    <div className="flex min-h-full flex-1 flex-col">
      <BandHero>
        <p className="mt-5 text-lg text-on-band-muted">סידור המשמרות של הצוות</p>
      </BandHero>

      <main className="rise mx-auto -mt-8 w-full max-w-md flex-1 px-4 pb-10">
        <LoginForm action={login} />

        <p className="mt-6 text-center text-sm leading-relaxed text-muted">
          אין לך קוד, או ששכחת אותו? בקש מהמנהל קישור כניסה.
          <br />
          אם פתחת את ההודעה בוואטסאפ, כדאי לפתוח את הכתובת בדפדפן (Safari או
          Chrome) — כך תישאר מחובר.
        </p>

        <LegalLinks className="mt-8" />
      </main>
    </div>
  );
}
