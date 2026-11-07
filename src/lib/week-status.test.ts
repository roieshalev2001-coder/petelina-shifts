import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  acceptingSubmissionsWhere,
  effectiveWeekStatus,
  scheduleBuilt,
  waitersWithoutShift,
  weekStatusBadge,
} from "./week";

describe("המצב האפקטיבי של שבוע", () => {
  it("פתוח שהמועד שלו עבר נחשב סגור — הטופס כבר נעול לעובד", () => {
    assert.equal(effectiveWeekStatus("open", true), "closed");
  });

  it("פתוח שהמועד שלו לא עבר נשאר פתוח", () => {
    assert.equal(effectiveWeekStatus("open", false), "open");
  });

  it("שאר המצבים לא מושפעים מהמועד", () => {
    assert.equal(effectiveWeekStatus("closed", false), "closed");
    assert.equal(effectiveWeekStatus("published", true), "published");
    assert.equal(effectiveWeekStatus("draft", true), "draft");
  });
});

describe("תנאי השאילתה לשבוע שמקבל הגשות", () => {
  it("פתוח, לא מאורכב, והמועד אחרי הרגע הנתון", () => {
    const now = new Date("2026-10-05T14:30:00.000Z");
    assert.deepEqual(acceptingSubmissionsWhere(now), {
      status: "open",
      deletedAt: null,
      deadline: { gt: now },
    });
  });
});

describe("תג הסטטוס של שבוע", () => {
  it("פתוח והמועד לא עבר — ירוק, אפשר להגיש", () => {
    assert.deepEqual(weekStatusBadge("open", false), { label: "פתוח להגשה", tone: "green" });
  });

  it("פתוח אבל המועד עבר — אדום, כי הטופס כבר נעול לעובדים", () => {
    assert.deepEqual(weekStatusBadge("open", true), { label: "ההגשה סגורה", tone: "red" });
  });

  it("נסגר ידנית — אותו תג אדום בדיוק, בלי קשר למועד", () => {
    assert.deepEqual(weekStatusBadge("closed", false), { label: "ההגשה סגורה", tone: "red" });
    assert.deepEqual(weekStatusBadge("closed", true), { label: "ההגשה סגורה", tone: "red" });
  });

  it("פורסם — כחול, גם אחרי המועד", () => {
    assert.deepEqual(weekStatusBadge("published", true), { label: "פורסם", tone: "blue" });
  });

  it("טיוטה — ניטרלי", () => {
    assert.deepEqual(weekStatusBadge("draft", false), { label: "טיוטה", tone: "neutral" });
  });
});

describe("מלצר שהגיש ולא קיבל משמרת", () => {
  const employees = [
    { id: "w", roles: "waiter" },
    { id: "wb", roles: "waiter,bartender" },
    { id: "b", roles: "bartender" },
    { id: "got", roles: "waiter" },
    { id: "silent", roles: "waiter" },
  ];
  const markedIds = new Set(["w", "wb", "b", "got"]);
  const shiftCounts = new Map([["got", 1]]);

  it("רק מלצרים שסימנו משהו ונשארו באפס", () => {
    const ids = waitersWithoutShift({ employees, markedIds, shiftCounts }).map((e) => e.id);
    // הברמן אינו מלצר, מי שקיבל — קיבל, ומי שלא סימן כלום אמר "לא השבוע"
    assert.deepEqual(ids, ["w", "wb"]);
  });

  it("לפני שהסידור נבנה אין מה לסמן", () => {
    assert.equal(scheduleBuilt({ lastReport: null, status: "open" }), false);
    assert.equal(scheduleBuilt({ lastReport: "{}", status: "open" }), true);
    assert.equal(scheduleBuilt({ lastReport: null, status: "published" }), true);
  });
});
