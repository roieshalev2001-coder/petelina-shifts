/**
 * הכתובת שנכנסת להודעות לעובדים.
 *
 * עד עכשיו היא נגזרה מהדף שהמנהל גלש בו. זה עבד כל עוד הוא היה בכתובת
 * הראשית — אבל Vercel נותן לכל פריסה גם כתובת קבועה משלה
 * (`shifts-<hash>-….vercel.app`), שמציגה לנצח את הגרסה של אותו יום ונעולה
 * מאחורי כניסה ל-Vercel. מנהל ששולח קודים מלשונית כזו היה שולח לעובדים
 * קישור שלא נפתח להם בכלל.
 *
 * לכן בייצור הכתובת נלקחת מ-`VERCEL_PROJECT_PRODUCTION_URL`: לפי התיעוד של
 * Vercel זה הדומיין הקצר ביותר של הייצור — הדומיין הפרטי ברגע שיחובר, ועד
 * אז כתובת ה-vercel.app. כך ההודעות יעברו לדומיין החדש בלי שינוי קוד.
 *
 * מחוץ לייצור (פיתוח מקומי) נשארת ההתנהגות הקודמת: הכתובת שבבקשה.
 *
 * הקובץ טהור — בלי `headers()` — כדי שאפשר יהיה לבדוק אותו בלי שרת.
 */

/** בצורה של process.env, כדי שהבדיקות יוכלו להעביר סביבה מדומה */
type Env = Record<string, string | undefined>;

/** כתובת הייצור הקבועה, או null כשלא רצים בייצור של Vercel */
export function productionBaseUrl(env: Env = process.env): string | null {
  if (env.VERCEL_ENV !== "production") return null;
  const host = env.VERCEL_PROJECT_PRODUCTION_URL?.trim();
  return host ? `https://${host}` : null;
}

/** הבסיס לקישורים בהודעות: ייצור אם אפשר, אחרת הכתובת שהבקשה הגיעה אליה */
export function resolveBaseUrl(
  requestHost: string | null,
  env: Env = process.env,
): string {
  const production = productionBaseUrl(env);
  if (production) return production;

  const host = requestHost ?? "localhost:3000";
  return `${host.startsWith("localhost") ? "http" : "https"}://${host}`;
}
