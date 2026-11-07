import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { dayLabel, firstNameOf, greetingFor, timeLeftParts } from "./hero";

const H = 60 * 60 * 1000;

describe("הגיבור בבית העובד", () => {
  it("ברכה לפי השעה, כולל הגבולות", () => {
    assert.equal(greetingFor(5), "בוקר טוב");
    assert.equal(greetingFor(11), "בוקר טוב");
    assert.equal(greetingFor(12), "צהריים טובים");
    assert.equal(greetingFor(17), "ערב טוב");
    assert.equal(greetingFor(22), "לילה טוב");
    assert.equal(greetingFor(3), "לילה טוב");
  });

  it("שם פרטי — מילה ראשונה, בלי התוספת שבסוגריים", () => {
    assert.equal(firstNameOf("נעמה גבאי"), "נעמה");
    assert.equal(firstNameOf("נועם (ברמן)"), "נועם");
    assert.equal(firstNameOf("  ניר "), "ניר");
    assert.equal(firstNameOf("אלכסנדרה ויסנייבסקה-קובלצ'יק"), "אלכסנדרה");
  });

  it("הזמן שנשאר — מעוגל כלפי מטה, ובעברית תקינה ליחיד", () => {
    assert.deepEqual(timeLeftParts(30 * 60 * 1000), { amount: "פחות", unit: "משעה" });
    assert.deepEqual(timeLeftParts(1.5 * H), { amount: "שעה", unit: "אחת" });
    assert.deepEqual(timeLeftParts(9 * H), { amount: "9", unit: "שעות" });
    assert.deepEqual(timeLeftParts(25 * H), { amount: "יום", unit: "אחד" });
    assert.deepEqual(timeLeftParts(47 * H), { amount: "יום", unit: "אחד" });
    assert.deepEqual(timeLeftParts(49 * H), { amount: "2", unit: "ימים" });
  });

  it("היום, מחר, ואחר כך שם היום", () => {
    assert.equal(dayLabel(0, "שלישי"), "היום");
    assert.equal(dayLabel(1, "רביעי"), "מחר");
    assert.equal(dayLabel(3, "שישי"), "שישי");
  });
});
