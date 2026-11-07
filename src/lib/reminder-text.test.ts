import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { submitReminderText } from "./week";

describe("נוסח התראת \"טרם הגשת\"", () => {
  const text = submitReminderText({
    weekLabel: "11/10–16/10",
    deadline: "5.10.2026, 17:00",
  });

  it("הכותרת נושאת את השבוע, מבודד כדי שהטווח לא יתהפך", () => {
    assert.equal(text.title, "טרם הגשת זמינות לשבוע \u206811/10–16/10\u2069");
  });

  it("הגוף נושא את המועד האחרון", () => {
    assert.ok(text.body.includes("5.10.2026, 17:00"), text.body);
  });

  /*
   * מקבע את הנוסח, כדי ששינוי שלו יהיה החלטה ולא תוצאת לוואי. ההבדל
   * היחיד מהנוסח שנשלח עד 6.10 הוא תווי הבידוד סביב הטווח.
   */
  it("הנוסח המלא", () => {
    assert.deepEqual(text, {
      title: "טרם הגשת זמינות לשבוע \u206811/10–16/10\u2069",
      body: "המועד האחרון: 5.10.2026, 17:00. מי שלא מגיש עלול לא לקבל משמרות השבוע.",
    });
  });

  it("\"כמה שעות לפני\" — נוסח אחר, כדי שלא תיראה כמו הקודמת", () => {
    const urgent = submitReminderText({
      weekLabel: "11/10–16/10",
      deadline: "16.10.2026, 20:00",
      lastHours: true,
    });
    assert.equal(urgent.title, "נשארו כמה שעות להגשה לשבוע \u206811/10–16/10\u2069");
    assert.ok(urgent.body.includes("16.10.2026, 20:00"), urgent.body);
    assert.notEqual(urgent.title, text.title);
  });
});
