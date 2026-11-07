import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  coverageDeficit,
  deficitMinutes,
  describeGap,
  requiredFloor,
} from "./coverage";
import { toMinutes } from "./time";

const iv = (start: string, end: string) => ({
  start: toMinutes(start),
  end: toMinutes(end),
});

/** משבצות המלצרים של יום רגיל, בדיוק כמו בגיליון */
const WAITER_SLOTS = [
  iv("07:15", "15:00"),
  iv("08:15", "15:00"),
  iv("09:00", "16:00"),
  iv("10:00", "17:00"),
  iv("11:15", "17:00"),
  iv("11:30", "17:00"),
  iv("16:00", "22:15"),
  iv("16:00", "22:15"),
  iv("16:30", "23:00"),
  iv("17:30", "23:00"),
  iv("18:30", "22:00"),
];

describe("רצפת האיוש", () => {
  const floor = requiredFloor(WAITER_SLOTS);

  const requiredAt = (time: string) => {
    const t = toMinutes(time);
    return floor.find((f) => f.start <= t && f.end > t)?.required;
  };

  it("בעליית הבוקר הרצפה עולה עם התבנית ולא קופצת ל-4", () => {
    assert.equal(requiredAt("07:30"), 1);
    assert.equal(requiredAt("08:30"), 2);
    assert.equal(requiredAt("09:30"), 3);
  });

  it("בשעות העומס הרצפה היא 4 גם כשהתבנית מתכננת 6", () => {
    assert.equal(requiredAt("10:30"), 4);
    assert.equal(requiredAt("12:00"), 4);
    assert.equal(requiredAt("15:30"), 4);
    assert.equal(requiredAt("16:45"), 4);
    assert.equal(requiredAt("20:00"), 4);
  });

  it("בשקע שבין הסבבים ובזנב הלילה הרצפה יורדת עם התבנית", () => {
    assert.equal(requiredAt("17:15"), 3);
    assert.equal(requiredAt("22:30"), 2);
  });

  it("קטעים סמוכים בעלי אותה דרישה מאוחדים", () => {
    const merged = requiredFloor([iv("08:00", "12:00"), iv("09:00", "12:00")]);
    // 08:00-09:00 דורש 1, 09:00-12:00 דורש 2 — שני קטעים, לא ארבעה
    assert.equal(merged.length, 2);
    assert.deepEqual(
      merged.map((s) => s.required),
      [1, 2],
    );
  });
});

describe("זיהוי חורי איוש", () => {
  it("איוש מלא לפי התבנית אינו מייצר גירעון", () => {
    assert.deepEqual(coverageDeficit(WAITER_SLOTS, WAITER_SLOTS), []);
  });

  it("ירידה מוקדמת בודדת שנשארת מעל הרצפה אינה גירעון", () => {
    // 11:30-17:00 יורד ב-15:00. בין 15:00 ל-16:00 נשארים 3 במקום 4 — כן גירעון.
    // לכן נבדוק ירידה בשעה שבה יש עודף: 12:00-13:00 יש 6 מתוכננים.
    const actual = WAITER_SLOTS.map((s, i) =>
      i === 5 ? iv("11:30", "15:00") : s,
    );
    const gaps = coverageDeficit(WAITER_SLOTS, actual);
    // הגירעון מתחיל רק ב-15:00 כשהתבנית יורדת ל-4
    assert.ok(gaps.every((g) => g.start >= toMinutes("15:00")));
  });

  it("כמה יורדים מוקדם באותו חלון מייצרים גירעון עם השעות הנכונות", () => {
    // שלושת מלצרי הבוקר האחרונים יורדים ב-14:00 במקום 17:00
    const actual = WAITER_SLOTS.map((s, i) =>
      i >= 3 && i <= 5 ? { start: s.start, end: toMinutes("14:00") } : s,
    );
    const gaps = coverageDeficit(WAITER_SLOTS, actual);
    assert.ok(gaps.length > 0, "היה צריך להתגלות גירעון");

    const first = gaps[0];
    assert.equal(first.start, toMinutes("14:00"));
    assert.equal(first.required, 4);
    // נשארים 07:15-15:00, 08:15-15:00 ו-09:00-16:00
    assert.equal(first.actual, 3);
  });

  it("הגירעון מחמיר ככל שיותר אנשים יורדים", () => {
    // גם 09:00-16:00 יורד מוקדם — עכשיו נשארים שניים בלבד
    const actual = WAITER_SLOTS.map((s, i) =>
      i >= 2 && i <= 5 ? { start: s.start, end: toMinutes("14:00") } : s,
    );
    const gaps = coverageDeficit(WAITER_SLOTS, actual);
    const at1430 = gaps.find(
      (g) => g.start <= toMinutes("14:30") && g.end > toMinutes("14:30"),
    );
    assert.equal(at1430?.actual, 2);
    assert.equal(at1430?.required, 4);
  });

  it("משבצת שלא אוישה כלל נספרת כחסרה", () => {
    const actual = WAITER_SLOTS.slice(1); // הפותחת לא אוישה
    const gaps = coverageDeficit(WAITER_SLOTS, actual);
    assert.ok(gaps.some((g) => g.start === toMinutes("07:15")));
  });

  it("deficitMinutes משקלל גם זמן וגם מספר אנשים", () => {
    const gaps = [
      { start: 600, end: 660, required: 4, actual: 3 }, // שעה × 1 חסר
      { start: 660, end: 720, required: 4, actual: 2 }, // שעה × 2 חסרים
    ];
    assert.equal(deficitMinutes(gaps), 60 + 120);
  });

  it("describeGap מנוסח בשפה של המנהל", () => {
    assert.equal(
      describeGap({ start: toMinutes("14:00"), end: toMinutes("15:00"), required: 4, actual: 3 }),
      "בין 14:00 ל-15:00 יהיו 3 מלצרים במקום 4",
    );
  });
});
