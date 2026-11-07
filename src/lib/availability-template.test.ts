import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { applyTemplate, parseTemplate, templateFromForm } from "./availability-template";

const slot = (id: string, dayOfWeek: number, startTime: string, endTime: string, sortOrder: number, isClosing = false) => ({
  id,
  dayOfWeek,
  role: "waiter",
  startTime,
  endTime,
  isClosing,
  sortOrder,
});

// השבוע שבו נשמרה התבנית
const before = [
  slot("a1", 0, "07:15", "13:00", 4),
  slot("a2", 0, "16:00", "22:15", 11),
  slot("a3", 0, "16:00", "22:15", 12),
  slot("a4", 2, "16:30", "23:00", 13, true),
  slot("a5", 3, "08:15", "15:00", 5),
];

const saved = templateFromForm(
  before,
  [
    { slotId: "a1", state: "preferred" },
    { slotId: "a3", state: "available" },
    { slotId: "a4", state: "available" },
    { slotId: "a5", state: "available" },
  ],
  [
    { dayOfWeek: 0, earliestStart: "07:00", latestEnd: "" },
    { dayOfWeek: 6, earliestStart: "10:00", latestEnd: "" },
    { dayOfWeek: 2, earliestStart: "", latestEnd: "" },
  ],
);

describe("\"השבוע הרגיל שלי\"", () => {
  // השבוע החדש: מזהים חדשים, ובשלישי הבלוק של 08:15 כבר לא קיים
  const after = [
    slot("b1", 0, "07:15", "13:00", 4),
    slot("b2", 0, "16:00", "22:15", 11),
    slot("b3", 0, "16:00", "22:15", 12),
    slot("b4", 2, "16:30", "22:45", 13, true),
    slot("b5", 3, "09:00", "15:00", 5),
  ];
  const applied = applyTemplate(saved, after);

  it("נשמר לפי יום, תפקיד ושעות — לא לפי מזהה", () => {
    assert.deepEqual(saved.marks[2], {
      dayOfWeek: 2, role: "waiter", startTime: "16:30", endTime: "CLOSING", sortOrder: 13, state: "available",
    });
  });

  it("מתאים לשבוע חדש, גם כששעת הסגירה השתנתה", () => {
    assert.deepEqual(applied.marks, { b1: "preferred", b3: "available", b4: "available" });
  });

  it("משמרת שכבר לא קיימת — מדלגים ומספרים", () => {
    assert.equal(applied.skipped.length, 1);
    assert.equal(applied.skipped[0].startTime, "08:15");
  });

  it("שני בלוקים זהים: אותו מקום בסדר", () => {
    assert.equal(applied.marks.b3, "available");
    assert.equal(applied.marks.b2, undefined);
  });

  it("שעות פנויות נשמרות רק ליום שקיים, וחלון ריק לא נשמר", () => {
    assert.deepEqual(saved.windows.map((w) => w.dayOfWeek), [0, 6]);
    assert.deepEqual(applied.windows, { 0: { earliestStart: "07:00", latestEnd: "" } });
  });

  it("נתונים פגומים במסד — אין תבנית, בלי לקרוס", () => {
    assert.equal(parseTemplate("not json"), null);
    assert.equal(parseTemplate("{}"), null);
    assert.deepEqual(parseTemplate(JSON.stringify(saved)), saved);
  });
});
