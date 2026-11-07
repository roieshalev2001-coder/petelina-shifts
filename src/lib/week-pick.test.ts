import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { pickSubmitWeek } from "./week";

describe("בחירת השבוע בטופס ההגשה", () => {
  it("שבוע פתוח אחד נפתח ישר, בלי לשאול", () => {
    assert.equal(pickSubmitWeek(undefined, ["w1"]), "w1");
  });

  it("בלי שבוע פתוח אין מה לפתוח", () => {
    assert.equal(pickSubmitWeek(undefined, []), null);
  });

  it("שני שבועות פתוחים בלי בקשה — בחירה, לא ניחוש", () => {
    assert.equal(pickSubmitWeek(undefined, ["w1", "w2"]), null);
  });

  /*
   * הבדיקה שבגללה הפונקציה הזו קיימת: המימוש הקודם היה לוקח את השבוע
   * המוקדם מביניהם, וכל ההגשות היו נוחתות בשבוע הלא נכון בשקט.
   */
  it("בקשה מפורשת גוברת על הסדר הכרונולוגי", () => {
    assert.equal(pickSubmitWeek("w2", ["w1", "w2"]), "w2");
  });

  it("מזהה ריק נחשב כאילו לא התבקש דבר", () => {
    assert.equal(pickSubmitWeek("", ["w1", "w2"]), null);
  });

  it("פרמטר כפול בכתובת אינו נבחר כמזהה", () => {
    assert.equal(pickSubmitWeek(["w1", "w2"], ["w1", "w2"]), null);
  });
});
