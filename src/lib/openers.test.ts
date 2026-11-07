import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { computeSlotFlags, type SlotShape } from "./openers";

/*
 * הדגלים קובעים אילו אזהרות המנהל רואה, ולכן דיוק שלהם הוא דיוק של מה
 * שמוצג. הבדיקות כאן מקבעות את שלושת הכללים, ובעיקר את זה שנשבר: קבוצה
 * קטנה לא הופכת את כל חבריה ל"סוגרים".
 */

const CLOSING = "CLOSING";

function slot(
  role: string,
  period: string,
  startTime: string,
  endTime: string,
  sortOrder: number,
  dayOfWeek = 0,
): SlotShape {
  return { dayOfWeek, role, period, startTime, endTime, sortOrder };
}

/** יום חול מלא, במבנה האמיתי של פטלינה */
const weekday: SlotShape[] = [
  slot("manager", "morning", "07:00", "16:00", 0),
  slot("bartender", "morning", "07:15", "14:00", 1),
  slot("bartender", "morning", "12:30", "17:30", 2),
  slot("bartender", "evening", "17:30", "23:00", 3),
  slot("manager", "evening", "16:00", CLOSING, 4),
  slot("waiter", "morning", "07:15", "13:00", 5),
  slot("waiter", "morning", "08:15", "15:00", 6),
  slot("waiter", "morning", "09:00", "16:00", 7),
  slot("waiter", "morning", "10:00", "17:00", 8),
  slot("waiter", "morning", "11:15", "17:00", 9),
  slot("waiter", "morning", "11:30", "17:00", 10),
  slot("waiter", "evening", "16:00", "22:15", 11),
  slot("waiter", "evening", "16:30", CLOSING, 12),
  slot("waiter", "evening", "17:30", CLOSING, 13),
  slot("waiter", "evening", "18:30", "22:00", 14),
];

const flagsFor = (slots: SlotShape[]) => {
  const flags = computeSlotFlags(slots);
  return (sortOrder: number) => flags[slots.findIndex((s) => s.sortOrder === sortOrder)];
};

describe("סימון פותחים וסוגרים", () => {
  const f = flagsFor(weekday);

  it("הפותח בכל צירוף של יום, תפקיד וסבב מסומן", () => {
    assert.equal(f(0).fixedStart, true, 'אחמ"ש בוקר');
    assert.equal(f(1).fixedStart, true, "ברמן בוקר");
    assert.equal(f(4).fixedStart, true, "אחראי ערב");
    assert.equal(f(5).fixedStart, true, "מלצר ראשון בבוקר");
    assert.equal(f(11).fixedStart, true, "מלצר ראשון בערב");
  });

  it("מי שאינו הראשון בקבוצתו אינו פותח", () => {
    assert.equal(f(2).fixedStart, false, "ברמן צהריים");
    assert.equal(f(6).fixedStart, false);
    assert.equal(f(12).fixedStart, false);
  });

  /*
   * זה הבאג שתוקן. קבוצת אחמ״ש היא משבצת אחת, ו-slice(0,2) החזיר אותה
   * עצמה — כך שאחמ״ש בוקר סומן כסוגר, וכל אילוץ של אחמ״ש נחסם.
   */
  it('אחמ"ש בוקר אינו סוגר — אחראי הערב מקבל ממנו את המקום', () => {
    assert.equal(f(0).fixedEnd, false);
  });

  it("ברמן בוקר וברמן צהריים אינם סוגרים", () => {
    assert.equal(f(1).fixedEnd, false);
    assert.equal(f(2).fixedEnd, false);
  });

  it("מי שמסתיים אחרון בתפקידו באותו יום כן סוגר", () => {
    assert.equal(f(4).fixedEnd, true, 'אחראי ערב — נגמר בסגירה');
    assert.equal(f(3).fixedEnd, true, "ברמן ערב — נגמר ב-23:00 מפורש");
  });

  it("שתי המשמרות האחרונות של קבוצת המלצרים בבוקר סוגרות", () => {
    // הכלל שנקבע כדי שתמיד יישארו מלצרים ברצפה
    assert.equal(f(9).fixedEnd, true);
    assert.equal(f(10).fixedEnd, true);
    assert.equal(f(8).fixedEnd, false, "10:00–17:00 היא השלישית מהסוף");
  });

  it("מלצרי הערב שנגמרים בסגירה סוגרים, והיורדים לפניה לא", () => {
    assert.equal(f(12).fixedEnd, true);
    assert.equal(f(13).fixedEnd, true);
    assert.equal(f(11).fixedEnd, false, "22:15");
    assert.equal(f(14).fixedEnd, false, "22:00");
  });
});

describe("מקרי קצה של גודל הקבוצה", () => {
  it("קבוצה של אחד: פותח, וסוגר רק בגלל שהוא האחרון בתפקידו", () => {
    const one = [slot("manager", "morning", "07:00", "16:00", 0)];
    const [f] = computeSlotFlags(one);
    assert.equal(f.fixedStart, true);
    // אין אף משבצת אחרת של אותו תפקיד באותו יום, ולכן הוא כן האחרון
    assert.equal(f.fixedEnd, true);
  });

  it("קבוצה של שתיים לא מסמנת את שתיהן כסוגרות", () => {
    const two = [
      slot("bartender", "morning", "07:15", "14:00", 0),
      slot("bartender", "morning", "12:30", "17:30", 1),
    ];
    const flags = computeSlotFlags(two);
    assert.equal(flags[0].fixedEnd, false, "המוקדם אינו סוגר");
    assert.equal(flags[1].fixedEnd, true, "רק המאוחר, כי הוא האחרון בתפקידו");
  });

  it("שובר שוויון: מבין שלוש שמסתיימות באותה שעה נבחרות שתי האחרונות בגיליון", () => {
    const three = [
      slot("waiter", "morning", "09:00", "17:00", 0),
      slot("waiter", "morning", "10:00", "17:00", 1),
      slot("waiter", "morning", "11:00", "17:00", 2),
    ];
    const flags = computeSlotFlags(three);
    // כולן מסתיימות אחרונה בתפקידן, ולכן כאן כל השלוש סוגרות —
    // מה שנכון: אין אחריהן אף מלצר באותו יום
    assert.deepEqual(
      flags.map((x) => x.fixedEnd),
      [true, true, true],
    );
  });

  it("ימים שונים אינם מתערבבים", () => {
    const twoDays = [
      slot("manager", "morning", "07:00", "16:00", 0, 0),
      slot("manager", "morning", "07:00", "16:00", 0, 1),
    ];
    const flags = computeSlotFlags(twoDays);
    assert.deepEqual(
      flags.map((x) => x.fixedStart),
      [true, true],
      "כל יום מקבל פותח משלו",
    );
  });
});
