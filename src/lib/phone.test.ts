import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { formatPhone, normalizePhone } from "./phone";

/** כל הצורות שמספר יכול להיכתב בהן במסד או בטופס */
const INPUTS = [
  "0501234567",
  "050-1234567",
  "050 123 4567",
  "+972501234567",
  "+972-50-123-4567",
  "+972 050-1234567",
  "972501234567",
  "00972501234567",
  "501234567",
  "03-1234567",
  "031234567",
  "0580000003",
  "",
  "   ",
  "abc",
  "12",
  null,
  undefined,
];

describe("נרמול טלפון", () => {
  it("מקומי לבינלאומי", () => {
    assert.equal(normalizePhone("0501234567"), "972501234567");
  });

  it("מתעלם ממקפים ורווחים", () => {
    assert.equal(normalizePhone("050-123 4567"), "972501234567");
  });

  it("כבר בינלאומי — נשאר", () => {
    assert.equal(normalizePhone("+972501234567"), "972501234567");
  });

  /*
   * שלושת אלה החזירו null עד עכשיו. כל אחד מהם היה עובד שלא מצליח להיכנס,
   * בזמן שהמסד נראה תקין.
   */
  it("קידומת מדינה ואחריה אפס מקומי", () => {
    assert.equal(normalizePhone("+972 050-1234567"), "972501234567");
  });

  it("קידומת יציאה 00", () => {
    assert.equal(normalizePhone("00972501234567"), "972501234567");
  });

  it("ישראלי בלי האפס המוביל", () => {
    assert.equal(normalizePhone("501234567"), "972501234567");
  });

  it("קווי", () => {
    assert.equal(normalizePhone("03-1234567"), "97231234567");
  });

  it("קלט ריק או לא תקין מחזיר null", () => {
    assert.equal(normalizePhone(null), null);
    assert.equal(normalizePhone(undefined), null);
    assert.equal(normalizePhone(""), null);
    assert.equal(normalizePhone("   "), null);
    assert.equal(normalizePhone("abc"), null);
    assert.equal(normalizePhone("12"), null);
  });

  it("מספר זר סביר מועבר כמו שהוא", () => {
    assert.equal(normalizePhone("+1 415 555 0123"), "14155550123");
  });
});

/*
 * זו הבדיקה שהמיגרציה נשענת עליה. המילוי כותב f(x) לעמודה, והכניסה מחפשת
 * לפי f(מה שהמשתמש הקליד). אם f אינה אידמפוטנטית, ערך שנשמר לא יימצא —
 * והאינדקס הייחודי ייראה בריא לחלוטין בזמן שאנשים נעולים בחוץ.
 */
describe("אידמפוטנטיות — התכונה שהמיגרציה תלויה בה", () => {
  for (const input of INPUTS) {
    const once = normalizePhone(input);
    it(`f(f(${JSON.stringify(input)})) === f(...)`, () => {
      assert.equal(normalizePhone(once), once);
    });
  }

  it("כל הצורות של אותו מספר מתכנסות לערך אחד", () => {
    const forms = [
      "0501234567",
      "050-1234567",
      "+972501234567",
      "+972 050-1234567",
      "00972501234567",
      "501234567",
      "972501234567",
    ];
    const results = new Set(forms.map((f) => normalizePhone(f)));
    assert.equal(results.size, 1, [...results].join(" | "));
    assert.equal([...results][0], "972501234567");
  });
});

describe("תצוגה", () => {
  it("חוזר לפורמט מקומי קריא", () => {
    assert.equal(formatPhone("972501234567"), "050-1234567");
  });

  it("מספר לא תקין מוצג כמו שהוא", () => {
    assert.equal(formatPhone("abc"), "abc");
  });
});
