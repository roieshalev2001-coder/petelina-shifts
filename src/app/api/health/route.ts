import { prisma } from "@/lib/db";
import { hashPasscode, verifyPasscode } from "@/lib/passcode";

/**
 * בדיקת חיים, ובעיקר **מדידה של מסלול הכניסה**.
 *
 * למה זה קיים: אף דף ציבורי באתר אינו נוגע במסד — הכל מאחורי כניסה —
 * ולכן כשהכניסה לקחה דקה וחצי לא הייתה שום דרך לדעת אם זה השרת, המסד,
 * או הגיבוב. כל המדידות היו על GET של דפים, והמסלול האיטי הוא POST.
 *
 * המסלול משוחזר כאן **בלי שום סיסמה ובלי לחשוף נתון**: אותה שאילתה
 * בדיוק עם טלפון שאינו קיים (אפס שורות), ואותו גיבוב עם קוד קבוע.
 * התשובה היא מספרים בלבד.
 *
 * ?deep=1 — כולל את הגיבוב. בלעדיו רק המסד, כדי שבדיקת חיים רגילה לא
 * תשרוף מעבד על scrypt בכל קריאה.
 */

/** טלפון שלא יכול להתאים לאיש — 15 ספרות, מעבר לאורך מספר ישראלי */
const NOBODY = "972000000000000";

export async function GET(request: Request) {
  const deep = new URL(request.url).searchParams.get("deep") === "1";
  const out: Record<string, unknown> = { region: process.env.VERCEL_REGION ?? null };

  // 1. הלוך-חזור נקי, בלי לגעת בטבלה
  let t = Date.now();
  try {
    await prisma.$queryRaw`SELECT 1`;
    out.pingMs = Date.now() - t;
  } catch {
    // הסיבה אינה מוחזרת: הודעת שגיאה של מסד עלולה לכלול מארח ושם סכימה
    out.pingMs = Date.now() - t;
    out.ok = false;
    return Response.json(out, { headers: { "Cache-Control": "no-store" } });
  }

  /*
   * 2. שאילתת הכניסה עצמה, על טלפון שאינו קיים.
   *
   * זהה לזו שב-src/lib/login.ts, כולל `omit` שפותח את הגיבוב — כי זה
   * בדיוק מה שנמדד. מחזירה אפס שורות, ולכן אין כאן מה לדלוף.
   */
  t = Date.now();
  const rows = await prisma.employee.findMany({
    where: { phone: NOBODY, active: true },
    omit: { passcodeHash: false },
  });
  out.lookupMs = Date.now() - t;
  out.rows = rows.length;

  /*
   * 3. עלות scrypt **על המעבד של הפלטפורמה**.
   *
   * זה החשד המוביל: scrypt קשה-זיכרון בכוונה, ומה שעולה 24ms על מאק
   * יכול לעלות סדר גודל יותר על פונקציה מוגבלת. הכניסה מריצה אותו בכל
   * ניסיון, ולכן אם הוא יקר — כל אחד מחכה, בכל פעם.
   */
  if (deep) {
    t = Date.now();
    const h = hashPasscode("000000");
    out.hashMs = Date.now() - t;

    t = Date.now();
    verifyPasscode("000000", h);
    out.verifyMs = Date.now() - t;
  }

  out.ok = true;
  return Response.json(out, { headers: { "Cache-Control": "no-store" } });
}
