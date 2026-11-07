import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { RECENT_WEEKS, splitWeeks } from "./week";
import { zonedTime } from "./time";

const week = (
  day: number,
  status = "published",
  deleted = false,
) => ({
  label: `${day}/8`,
  status,
  weekStart: zonedTime(2026, 8, day),
  deletedAt: deleted ? new Date() : null,
});

const labels = (rows: { label: string }[]) => rows.map((r) => r.label);

describe("חלוקה בין המסך הראשי לסידורי עבר", () => {
  it("עד ארבעה סידורי עבר נשארים במסך הראשי", () => {
    const weeks = [2, 9, 16, 23].map((d) => week(d));
    const { recent, archive } = splitWeeks(weeks);
    assert.equal(recent.length, 4);
    assert.equal(archive.length, 0);
  });

  it("החמישי והלאה עוברים לארכיון, מהחדש לישן", () => {
    const weeks = [2, 9, 16, 23, 30].map((d) => week(d));
    const { recent, archive } = splitWeeks(weeks);
    assert.deepEqual(labels(recent), ["30/8", "23/8", "16/8", "9/8"]);
    assert.deepEqual(labels(archive), ["2/8"]);
  });

  it("שבוע פתוח נשאר במסך הראשי גם כשהוא ישן", () => {
    const weeks = [week(2, "open"), ...[9, 16, 23, 30].map((d) => week(d))];
    const { recent, archive } = splitWeeks(weeks);
    assert.ok(labels(recent).includes("2/8"), "הפתוח נשאר למעלה");
    assert.equal(archive.length, 0, "ארבעת האחרונים הם סידורי העבר");
  });

  it("טיוטה נשארת במסך הראשי", () => {
    const { recent } = splitWeeks([week(2, "draft"), ...[9, 16, 23, 30].map((d) => week(d))]);
    assert.ok(labels(recent).includes("2/8"));
  });

  it("מאורכב תמיד בארכיון, גם אם הוא האחרון", () => {
    const { recent, archive } = splitWeeks([week(30, "published", true), week(23)]);
    assert.deepEqual(labels(archive), ["30/8"]);
    assert.deepEqual(labels(recent), ["23/8"]);
  });

  it("מאורכב אינו תופס מקום מבין הארבעה", () => {
    const weeks = [week(30, "published", true), ...[2, 9, 16, 23].map((d) => week(d))];
    const { recent } = splitWeeks(weeks);
    assert.deepEqual(labels(recent), ["23/8", "16/8", "9/8", "2/8"]);
  });

  it("סדר הקלט אינו משנה", () => {
    const weeks = [9, 30, 2, 23, 16].map((d) => week(d));
    const { recent, archive } = splitWeeks(weeks);
    assert.deepEqual(labels(recent), ["30/8", "23/8", "16/8", "9/8"]);
    assert.deepEqual(labels(archive), ["2/8"]);
  });

  it("ברירת המחדל היא ארבעה", () => {
    assert.equal(RECENT_WEEKS, 4);
  });
});
