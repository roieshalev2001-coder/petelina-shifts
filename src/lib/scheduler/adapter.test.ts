import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildSolverInput } from "./adapter";
import { solve } from "./solve";

/*
 * שבוע קטן: ראשון–שלישי משבצת מלצר אחת בכל יום, ובשישי שתי משבצות —
 * אחת תפוסה (מהסבב) ואחת ריקה.
 */
const WEEK = { closingTimes: "{}", weekStart: new Date("2026-10-17T21:00:00Z") };

function slot(id: string, dayOfWeek: number, sortOrder = 0) {
  return {
    id,
    dayOfWeek,
    date: new Date(WEEK.weekStart.getTime() + dayOfWeek * 86_400_000),
    role: "waiter",
    period: dayOfWeek === 5 ? "allday" : "morning",
    startTime: "08:00",
    endTime: "14:00",
    sortOrder,
    fixedStart: false,
    fixedEnd: false,
    standby: false,
  };
}

function employee(id: string, maxShifts = 6, active = true) {
  return {
    id,
    fullName: id,
    roles: "waiter",
    active,
    requiredShifts: 0,
    maxShifts,
    seniority: 3,
    preferredPeriod: null,
  };
}

const mark = (employeeId: string, slotId: string) => ({
  employeeId,
  slotId,
  state: "available",
  earliestStart: null,
  latestEnd: null,
});

const assigned = (slotId: string, employeeId: string, pinned: boolean) => ({
  slotId,
  employeeId,
  actualStart: "08:00",
  actualEnd: "14:00",
  shortened: false,
  pinned,
});

const SLOTS = [slot("sun", 0), slot("mon", 1), slot("tue", 2), slot("fri-a", 5, 0), slot("fri-b", 5, 1)];

describe("ימים שמחוץ לבנייה (שישי)", () => {
  const input = buildSolverInput({
    week: WEEK,
    slots: SLOTS,
    employees: [employee("dana"), employee("omer")],
    availabilities: [mark("dana", "fri-b"), mark("omer", "fri-b"), mark("omer", "sun")],
    constraints: [],
    // השיבוץ בשישי לא נעוץ — ובכל זאת נשאר, כי שישי מחוץ לבנייה
    existingAssignments: [assigned("fri-a", "dana", false)],
    fixedDays: [5],
  });

  it("משבצת ריקה בשישי לא נכנסת לפותר", () => {
    const ids = input.slots.map((s) => s.id);
    assert.ok(!ids.includes("fri-b"));
    assert.ok(ids.includes("fri-a"));
  });

  it("כל שיבוץ קיים בשישי נשמר כנעוץ", () => {
    assert.deepEqual(
      input.pinned.map((p) => [p.slotId, p.employeeId]),
      [["fri-a", "dana"]],
    );
  });

  it("סימוני זמינות בשישי לא נחשבים", () => {
    assert.ok(input.availabilities.every((a) => !a.slotId.startsWith("fri")));
  });

  it("מי שסימן רק שישי לא נכנס ל'מינימום משמרת אחת'", () => {
    const byId = new Map(input.employees.map((e) => [e.id, e]));
    assert.equal(byId.get("dana")!.atLeastOne, false);
    assert.equal(byId.get("omer")!.atLeastOne, true);
  });

  it("הפותר לא ממלא את שישי ולא מדווח עליו כחסר", () => {
    const { assignments, report } = solve({ ...input, options: { timeBudgetMs: 300 } });
    const friday = assignments.filter((a) => a.slotId.startsWith("fri"));
    assert.deepEqual(
      friday.map((a) => [a.slotId, a.employeeId, a.pinned]),
      [["fri-a", "dana", true]],
    );
    assert.ok(report.unfilled.every((u) => !u.slotId.startsWith("fri")));
  });

  it("שישי נספר במכסה השבועית", () => {
    /*
     * לדנה מקסימום 2 ושישי כבר שלה — נשארת לה משמרת אחת באמצע השבוע.
     * המקסימום הוא מחיר ולא איסור (WEIGHTS.overMax), ולכן צריך מישהו
     * אחר פנוי: בלעדיו דנה הייתה משובצת לכל המשבצות במקום שיישארו ריקות.
     */
    const capped = buildSolverInput({
      week: WEEK,
      slots: SLOTS,
      employees: [employee("dana", 2), employee("omer")],
      availabilities: ["sun", "mon", "tue"].flatMap((s) => [mark("dana", s), mark("omer", s)]),
      constraints: [],
      // לא נעוץ בכוונה: נספר רק בזכות fixedDays
      existingAssignments: [assigned("fri-a", "dana", false)],
      fixedDays: [5],
    });
    const { assignments } = solve({ ...capped, options: { timeBudgetMs: 300 } });
    const danaWeekdays = assignments.filter(
      (a) => a.employeeId === "dana" && !a.slotId.startsWith("fri"),
    );
    assert.ok(danaWeekdays.length <= 1, `דנה קיבלה ${danaWeekdays.length} משמרות באמצע השבוע`);
    // וכל המשבצות של אמצע השבוע מאוישות — עומר משלים
    assert.equal(assignments.filter((a) => !a.slotId.startsWith("fri")).length, 3);
  });

  it("שיבוץ של עובד לא פעיל בשישי: המשבצת לא נפתחת למילוי", () => {
    const withInactive = buildSolverInput({
      week: WEEK,
      slots: SLOTS,
      employees: [employee("dana"), employee("gone", 6, false)],
      availabilities: [],
      constraints: [],
      existingAssignments: [assigned("fri-a", "gone", true)],
      fixedDays: [5],
    });
    assert.ok(!withInactive.slots.some((s) => s.id.startsWith("fri")));
  });

  it("בלי fixedDays — בלי שינוי: שישי נכנס לפותר כמו כל יום", () => {
    const plain = buildSolverInput({
      week: WEEK,
      slots: SLOTS,
      employees: [employee("dana")],
      availabilities: [mark("dana", "fri-b")],
      constraints: [],
      existingAssignments: [assigned("fri-a", "dana", false)],
    });
    assert.ok(plain.slots.some((s) => s.id === "fri-b"));
    assert.equal(plain.pinned.length, 0);
    assert.equal(plain.availabilities.length, 1);
  });
});

describe("מתלמדים", () => {
  const bar = { ...slot("bar", 1), role: "bartender" };
  const input = buildSolverInput({
    week: WEEK,
    slots: [slot("sun", 0), bar],
    employees: [
      // מלצר שמתלמד בר, וסימן רק את הבר
      { ...employee("noa"), roles: "waiter,traineeBartender" },
      // מתלמד מלצר בלבד
      { ...employee("tal"), roles: "traineeWaiter" },
    ],
    availabilities: [mark("noa", "bar"), mark("tal", "sun")],
    constraints: [],
  });

  it("סימון על בלוק של תפקיד שהוא רק מתלמד בו לא נכנס לפותר", () => {
    assert.deepEqual(input.availabilities, []);
  });

  it("ולכן גם לא 'מינימום משמרת אחת' על משמרת מלצר שלא ביקש", () => {
    const noa = input.employees.find((e) => e.id === "noa")!;
    assert.equal(noa.atLeastOne, false);
  });

  it("הפותר לא משבץ מתלמד לבד", () => {
    const { assignments } = solve({ ...input, options: { timeBudgetMs: 200 } });
    assert.deepEqual(assignments, []);
  });
});
