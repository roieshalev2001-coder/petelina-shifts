/**
 * שער לסקריפטים שמוחקים נתונים.
 *
 * שני סקריפטים ברפו הזה הם הרסניים: `simulate-week` מוחק את השבוע הבא
 * ואת כל אילוצי הזוגות, ו-`db:seed` מוחק את כל התבנית השבועית. שניהם
 * בנו את הלקוח שלהם מ-`DATABASE_URL` — שמצביע על מסד הייצור. הרצה אחת
 * בהיסח הדעת מוחקת הגשות ושיבוצים אמיתיים.
 *
 * הפונקציה כאן דורשת משתנה סביבה נפרד ומפורש, ומסרבת אם הוא זהה
 * ל-DATABASE_URL. אותו דפוס שכבר קיים ב-scripts/swap-race.ts.
 */
export function requireDevDatabase(envName: string, command: string): string {
  const url = process.env[envName];

  if (!url) {
    throw new Error(
      `הסקריפט הזה מוחק נתונים, ולכן הוא לא רץ מול המסד שבסביבה.\n` +
        `הרץ אותו רק מול מסד פיתוח:\n\n` +
        `  ${envName}="postgres://…" ${command}\n`,
    );
  }

  if (url === process.env.DATABASE_URL) {
    throw new Error(
      `${envName} זהה ל-DATABASE_URL — סירוב להריץ מול מסד הייצור.\n` +
        `צור מסד פיתוח נפרד והצבע עליו.\n`,
    );
  }

  return url;
}
