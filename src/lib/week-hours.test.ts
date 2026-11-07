import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { findTemplateSlot, formatHours, insertionSortOrder, shiftHours, shiftedActual } from "./week";

const t = (sortOrder: number, startTime: string, endTime: string, role = "waiter", dayOfWeek = 0) => ({
  id: `t${sortOrder}`,
  dayOfWeek,
  role,
  startTime,
  endTime,
  sortOrder,
});

describe("בלוק התבנית של משבצת", () => {
  const template = [
    t(0, "07:15", "13:00"),
    t(11, "16:00", "22:15"),
    t(12, "16:00", "22:15"),
    t(1, "07:15", "14:00", "bartender"),
  ];

  it("לפי יום, תפקיד ושעות", () => {
    assert.equal(findTemplateSlot(template, t(0, "07:15", "13:00"))?.id, "t0");
  });

  it("שני בלוקים זהים — זה עם אותו sortOrder", () => {
    assert.equal(findTemplateSlot(template, t(12, "16:00", "22:15"))?.id, "t12");
  });

  it("לא מתבלבל בין תפקידים באותן שעות", () => {
    assert.equal(findTemplateSlot(template, t(1, "07:15", "14:00"))?.id, undefined);
  });

  it("תבנית שהשתנתה מאז — אין התאמה", () => {
    assert.equal(findTemplateSlot(template, t(0, "07:00", "13:00")), null);
  });
});

describe("שעות השיבוץ אחרי שינוי שעות הבלוק", () => {
  const base = { oldStart: "07:15", oldEnd: "15:00" };

  it("שיבוץ מלא זז עם הבלוק", () => {
    assert.deepEqual(
      shiftedActual({ ...base, newStart: "08:00", newEnd: "16:00", actualStart: "07:15", actualEnd: "15:00" }),
      { actualStart: "08:00", actualEnd: "16:00", shortened: false },
    );
  });

  it("קיצור אישי נשמר", () => {
    // דנה מגיעה ב-09:00 בגלל אילוץ — נשארת 09:00, ויורדת עם הבלוק
    assert.deepEqual(
      shiftedActual({ ...base, newStart: "08:00", newEnd: "16:00", actualStart: "09:00", actualEnd: "15:00" }),
      { actualStart: "09:00", actualEnd: "16:00", shortened: true },
    );
  });

  it("קיצור שיוצא מהגבולות החדשים נחתך אליהם", () => {
    assert.deepEqual(
      shiftedActual({ ...base, newStart: "10:00", newEnd: "15:00", actualStart: "09:00", actualEnd: "15:00" }),
      { actualStart: "10:00", actualEnd: "15:00", shortened: false },
    );
  });

  it("קיצור שכבר לא נכנס בכלל — מקבל את הבלוק כמו שהוא", () => {
    assert.deepEqual(
      shiftedActual({ ...base, newStart: "13:00", newEnd: "18:00", actualStart: "07:15", actualEnd: "12:00" }),
      { actualStart: "13:00", actualEnd: "18:00", shortened: false },
    );
  });
});

describe("מקום של בלוק חדש לפי שעת ההתחלה", () => {
  const s = (sortOrder: number, role: string, period: string, startTime: string) => ({
    sortOrder,
    role,
    period,
    startTime,
  });
  const MONDAY = [
    s(0, "manager", "morning", "07:00"),
    s(1, "waiter", "morning", "07:15"),
    s(2, "waiter", "morning", "08:15"),
    s(3, "waiter", "morning", "09:00"),
    s(4, "manager", "evening", "16:00"),
    s(5, "waiter", "evening", "16:00"),
    s(6, "waiter", "evening", "18:30"),
  ];

  it("08:30 נכנס בין 08:15 ל-09:00", () => {
    assert.equal(insertionSortOrder(MONDAY, { role: "waiter", period: "morning", startTime: "08:30" }), 3);
  });

  it("המוקדם מכולם נכנס בראש הקבוצה, לפני הבלוקים המקוריים", () => {
    assert.equal(insertionSortOrder(MONDAY, { role: "waiter", period: "morning", startTime: "07:00" }), 1);
  });

  it("המאוחר מכולם — בסוף הקבוצה, לפני הערב", () => {
    assert.equal(insertionSortOrder(MONDAY, { role: "waiter", period: "morning", startTime: "11:00" }), 4);
  });

  it("שעה זהה — אחרי מי שכבר בשעה הזו", () => {
    assert.equal(insertionSortOrder(MONDAY, { role: "waiter", period: "morning", startTime: "08:15" }), 3);
  });

  it("ערב נשאר בערב", () => {
    assert.equal(insertionSortOrder(MONDAY, { role: "waiter", period: "evening", startTime: "17:00" }), 6);
  });

  it("אין קבוצה כזו — אחרי האחרון מאותו תפקיד", () => {
    assert.equal(insertionSortOrder(MONDAY, { role: "manager", period: "allday", startTime: "10:00" }), 5);
    assert.equal(insertionSortOrder(MONDAY, { role: "bartender", period: "morning", startTime: "10:00" }), 7);
  });
});

describe("תצוגת השעות של בלוק", () => {
  it("טווח, רק הגעה, רק סיום", () => {
    assert.equal(formatHours("07:15", "15:00"), "07:15–15:00");
    assert.equal(formatHours("07:15", "15:00", "start"), "07:15");
    assert.equal(formatHours("07:15", "15:00", "end"), "עד 15:00");
  });

  it("עד סגירה", () => {
    assert.equal(formatHours("16:30", "CLOSING"), "16:30–סגירה");
    assert.equal(formatHours("16:30", "CLOSING", "end"), "עד סגירה");
  });

  it("המשמרות שלי: לפי הבלוק, ובשישי תמיד רק הגעה", () => {
    const sunday = { dayOfWeek: 0, actualStart: "07:15", actualEnd: "15:00" };
    assert.equal(shiftHours(sunday), "07:15–15:00");
    assert.equal(shiftHours({ ...sunday, timeDisplay: "end" }), "עד 15:00");
    assert.equal(shiftHours({ ...sunday, dayOfWeek: 5, timeDisplay: "end" }), "07:15");
  });
});
