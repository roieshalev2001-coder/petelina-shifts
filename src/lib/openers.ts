import { CLOSING } from "./domain";
import { toMinutes } from "./time";

/**
 * מי פותח ומי סוגר.
 *
 * הדגלים האלה קובעים איזו סטייה מהשעות מקבלת אזהרה: איחור למשבצת פותחת
 * ("המקום ייפתח באיחור") וירידה מוקדמת ממשבצת סוגרת ("לא יישאר מי שיסגור").
 * הם **לא** פוסלים — ראה fitSlot ב-./time.ts. לכן דיוק שלהם הוא דיוק של
 * מה שמוצג למנהל, ולא של מה שמותר.
 *
 * הפונקציה יושבת כאן ולא ב-prisma/seed.ts כדי שגם סקריפט תיקון של שבוע
 * שכבר נפתח יוכל להשתמש באותה לוגיקה בדיוק, ושתהיה לה בדיקה.
 */

/** המינימום שהפונקציה צריכה לדעת על משבצת */
export type SlotShape = {
  dayOfWeek: number;
  role: string;
  period: string;
  startTime: string;
  endTime: string;
  sortOrder: number;
};

export type SlotFlags = { fixedStart: boolean; fixedEnd: boolean };

/** "עד סגירה" מדורג אחרי כל שעה מפורשת */
function endRank(slot: SlotShape): number {
  return slot.endTime === CLOSING ? 24 * 60 + 1 : toMinutes(slot.endTime);
}

function groupBy<T>(items: T[], key: (item: T) => string): Map<string, T[]> {
  const out = new Map<string, T[]>();
  for (const item of items) {
    const k = key(item);
    if (!out.has(k)) out.set(k, []);
    out.get(k)!.push(item);
  }
  return out;
}

/**
 * מחשב את הדגלים לכל משבצת, לפי אינדקס במערך שהתקבל.
 *
 * שלושה כללים:
 *
 * 1. **פותחת** — המשבצת שמתחילה הכי מוקדם בכל צירוף (יום, תפקיד, סבב).
 *
 * 2. **שתי האחרונות בקבוצה גדולה** — הכלל שנקבע כדי שתמיד יישארו מלצרים
 *    ברצפה. חל רק בקבוצה של יותר משתי משבצות: בקבוצה של אחת או שתיים
 *    (אחמ״ש, ברמן) הוא סימן את כולן, וכך ברמן בוקר שמסיים ב-14:00 קיבל
 *    תווית "סוגרת" על משמרת שלא סוגרת שום דבר.
 *
 * 3. **מי שסוגר בפועל** — המשבצת המסתיימת אחרונה מבין אותו תפקיד באותו יום.
 *    לא מסתמכים על הסימן CLOSING לבדו, כי הגיליון כותב לפעמים שעה מפורשת:
 *    ברמן ערב של יום חול נגמר ב-"23:00" ולא ב-CLOSING, ובדיקה לפי הסימן
 *    בלבד הייתה מפספסת בדיוק את מי שסוגר את הבר.
 */
export function computeSlotFlags(slots: SlotShape[]): SlotFlags[] {
  const flags: SlotFlags[] = slots.map(() => ({
    fixedStart: false,
    fixedEnd: false,
  }));
  const indexed = slots.map((slot, i) => ({ slot, i }));

  for (const group of groupBy(
    indexed,
    ({ slot }) => `${slot.dayOfWeek}|${slot.role}|${slot.period}`,
  ).values()) {
    const opener = [...group].sort(
      (a, b) =>
        toMinutes(a.slot.startTime) - toMinutes(b.slot.startTime) ||
        a.slot.sortOrder - b.slot.sortOrder,
    )[0];
    flags[opener.i].fixedStart = true;

    if (group.length > 2) {
      const byLatest = [...group].sort(
        (a, b) =>
          endRank(b.slot) - endRank(a.slot) ||
          b.slot.sortOrder - a.slot.sortOrder,
      );
      for (const c of byLatest.slice(0, 2)) flags[c.i].fixedEnd = true;
    }
  }

  for (const group of groupBy(
    indexed,
    ({ slot }) => `${slot.dayOfWeek}|${slot.role}`,
  ).values()) {
    const latest = Math.max(...group.map(({ slot }) => endRank(slot)));
    for (const { slot, i } of group) {
      if (endRank(slot) === latest) flags[i].fixedEnd = true;
    }
  }

  return flags;
}
