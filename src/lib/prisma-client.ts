import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";

/**
 * יצירת לקוח Prisma. ב-Prisma 7 החיבור נעשה דרך adapter ולא דרך url בסכימה,
 * ולכן ההרכבה הזו מרוכזת כאן במקום להישכפל בכל נקודת כניסה.
 */
export function createPrismaClient() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL חסר — ראה .env");
  /*
   * idleTimeoutMillis: ברירת המחדל של node-postgres היא 10 שניות, ואז
   * הבריכה סוגרת את כל החיבורים. באתר בתנועה דלילה זה אומר שכמעט כל
   * ניווט משלם מחדש לחיצת יד של TCP+TLS+אימות מול הפוּלר — נמדד: 0.57
   * שניות אחרי 15 שניות שקט מול 0.25 בבקשה צמודה.
   *
   * חמש דקות מחזיקות את החיבור פתוח לאורך ביקור שלם.
   */
  return new PrismaClient({
    adapter: new PrismaPg({
      connectionString: url,
      idleTimeoutMillis: 300_000,
    }),
    /*
     * גיבוב קוד הכניסה מושמט מכל שאילתה כברירת מחדל.
     *
     * זו לא הידוק לשם הידוק: מסך העובדים עושה findMany בלי select ומעביר
     * את השורות המלאות לרכיב לקוח, כלומר בלי ההשמטה הזו 29 גיבובים היו
     * נשלחים לדפדפן בתוך ה-RSC payload. ההשמטה הופכת את הדליפה לבלתי
     * אפשרית גם אם מישהו יוסיף שאילתה רחבה בעתיד.
     *
     * מי שבאמת צריך את הגיבוב — מסלול הכניסה — מבקש אותו במפורש עם
     * `omit: { passcodeHash: false }`.
     */
    omit: { employee: { passcodeHash: true } },
  });
}
