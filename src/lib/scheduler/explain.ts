import { coverageDeficit } from "../coverage";
import { toHHMM } from "../time";
import {
  isFeasible,
  type CandidateIndex,
  type ScheduleState,
  type InfeasibleReason,
  type StaticRejectReason,
} from "./candidates";
import type { CostContext } from "./cost";
import type {
  EmployeeOverMax,
  EmployeeShortfall,
  PartialOption,
  SolverOptions,
  SolverPairConstraint,
  SolverReport,
  UnfilledReason,
  UnfilledSlotReport,
} from "./types";

const REASON_FROM_INFEASIBLE: Record<InfeasibleReason, UnfilledReason> = {
  "busy-same-day": "all-busy-same-day",
  "cross-round": "cross-round",
  "standby-repeat": "all-on-standby",
  "pair-conflict": "blocked-by-pair",
  "rest-violation": "blocked-by-rest",
};

const REASON_FROM_STATIC: Record<StaticRejectReason, UnfilledReason> = {
  "too-short": "window-mismatch",
  "no-overlap": "window-mismatch",
};

export const UNFILLED_REASON_LABEL: Record<UnfilledReason, string> = {
  "no-submissions": "אף עובד מתאים לא סימן את המשמרת הזו",
  "all-at-max": "כל מי שסימן כבר הגיע למקסימום המשמרות שלו",
  "all-busy-same-day": "כל מי שסימן כבר משובץ באותו יום",
  "cross-round": "כל מי שסימן כבר משובץ בסבב השני באותו יום",
  "all-on-standby": "כל מי שסימן כבר משובץ למשמרת כוננות אחרת השבוע",
  "blocked-by-pair": 'כל מי שסימן חסום ע"י אילוץ "לא עובדים יחד"',
  "blocked-by-rest": "כל מי שסימן לא עומד במנוחה המינימלית בין משמרות",
  "only-partial-available": "אף אחד לא מתאים למשמרת המלאה — יש מי שיכול לכסות חלק",
  "window-mismatch": "מי שסימן הגביל שעות שלא מתאימות למשמרת",
  "taken-by-better-fit": "מי שסימן שובץ למשמרת אחרת שנזקקה לו יותר",
};

/**
 * מרכיב את דוח ההסבר: למה כל משבצת ריקה נשארה ריקה, ומי לא קיבל את מכסתו.
 * הדוח הוא מה שמאפשר למנהל להבין ולתקן במקום לנחש.
 */
export function buildReport(args: {
  state: ScheduleState;
  index: CandidateIndex;
  ctx: CostContext;
  constraintsByEmployee: Map<string, SolverPairConstraint[]>;
  options: SolverOptions;
  cost: number;
  elapsedMs: number;
}): SolverReport {
  const { state, index, ctx, constraintsByEmployee, options } = args;

  const unfilled: UnfilledSlotReport[] = [];

  for (const slot of ctx.slots) {
    if (state.bySlot.has(slot.id)) continue;

    const candidates = index.bySlot.get(slot.id) ?? [];
    const windowRejected = index.windowRejects.get(slot.id) ?? [];
    const partialOptions = buildPartialOptions(slot, index);

    if (candidates.length === 0) {
      const mapped = windowRejected.map((r) => ({
        employeeId: r.employeeId,
        reason: REASON_FROM_STATIC[r.reason],
      }));
      unfilled.push({
        slotId: slot.id,
        reason:
          partialOptions.length > 0
            ? "only-partial-available"
            : mapped.length > 0
              ? dominantReason(mapped.map((r) => r.reason))
              : "no-submissions",
        submitted: windowRejected.length + partialOptions.length,
        rejected: mapped,
        partialOptions,
      });
      continue;
    }

    // המשבצת ריקה למרות שיש מועמדים — נבדוק מה חוסם כל אחד מהם
    const rejected = candidates.map((c) => {
      const emp = ctx.employeeById.get(c.employeeId)!;
      const why = isFeasible(emp, slot, state, constraintsByEmployee, options);
      return {
        employeeId: c.employeeId,
        reason: why ? REASON_FROM_INFEASIBLE[why] : ("taken-by-better-fit" as const),
      };
    });

    unfilled.push({
      slotId: slot.id,
      reason: dominantReason(rejected.map((r) => r.reason)),
      submitted: candidates.length + windowRejected.length + partialOptions.length,
      rejected,
      partialOptions,
    });
  }

  const shortfalls: EmployeeShortfall[] = ctx.employees
    .map((emp) => ({
      employeeId: emp.id,
      required: emp.requiredShifts,
      assigned: state.countFor(emp.id),
      marked: index.byEmployee.get(emp.id)?.length ?? 0,
    }))
    .filter((s) => s.assigned < s.required);

  const overMax: EmployeeOverMax[] = ctx.employees
    .map((emp) => ({
      employeeId: emp.id,
      max: emp.maxShifts,
      assigned: state.countFor(emp.id),
    }))
    .filter((o) => o.assigned > o.max);

  // מלצרים שהגישו ונשארו בלי כלום — ראה WEIGHTS.noShiftAfterSubmitting
  const noShift = ctx.employees
    .filter((emp) => emp.atLeastOne && state.countFor(emp.id) === 0)
    .map((emp) => emp.id);

  const shortenedAssignments = state
    .toArray()
    .filter((a) => a.shortened)
    .map((a) => a.slotId);

  return {
    filled: state.bySlot.size,
    total: ctx.slots.length,
    unfilled,
    shortfalls,
    overMax,
    noShift,
    shortenedAssignments,
    coverageGaps: collectCoverageGaps(state, ctx),
    softViolations: collectSoftViolations(state, ctx),
    cost: args.cost,
    elapsedMs: args.elapsedMs,
  };
}

/**
 * מי יכול לכסות חלק מהמשבצת, ממוין לפי כמה הוא מכסה.
 * זה מה שהמנהל רואה בתא הריק כשהוא בא להחליט.
 */
function buildPartialOptions(
  slot: { id: string; start: number; end: number },
  index: CandidateIndex,
): PartialOption[] {
  return (index.partialBySlot.get(slot.id) ?? [])
    .map((c) => ({
      employeeId: c.employeeId,
      start: toHHMM(c.fit.start),
      end: toHHMM(c.fit.end),
      coveredMinutes: c.fit.end - c.fit.start,
      slotMinutes: slot.end - slot.start,
      state: c.state,
      // האזהרה עוברת עד למנהל: כיסוי חלקי שמאחר לפתיחה או לא נשאר
      // לסגירה הוא לא אותו דבר ככיסוי חלקי באמצע המשמרת
      breaksOpening: c.fit.kind === "partial" && c.fit.breaksOpening,
      breaksClosing: c.fit.kind === "partial" && c.fit.breaksClosing,
    }))
    .sort(
      (a, b) =>
        // מי ששובר פתיחה או סגירה יורד לסוף — הוא האפשרות הפחות טובה
        Number(a.breaksOpening || a.breaksClosing) -
          Number(b.breaksOpening || b.breaksClosing) ||
        b.coveredMinutes - a.coveredMinutes ||
        (a.state === "preferred" ? -1 : 1) - (b.state === "preferred" ? -1 : 1),
    );
}

/** איפה הרצפה נשארת חשופה — הדבר שהמנהל הכי צריך לראות לפני שהוא מפרסם */
function collectCoverageGaps(state: ScheduleState, ctx: CostContext) {
  const out: SolverReport["coverageGaps"] = [];

  for (const [, day] of ctx.waiterSlotsByDay) {
    if (day.length === 0) continue;
    const dayOfWeek = day[0].dayOfWeek;

    const planned = day.map((s) => ({ start: s.start, end: s.end }));
    const actual = day
      .map((s) => state.bySlot.get(s.id))
      .filter((a) => a !== undefined)
      .map((a) => ({ start: a.actualStart, end: a.actualEnd }));

    for (const gap of coverageDeficit(planned, actual, ctx.minOnFloor)) {
      out.push({
        dayOfWeek,
        from: toHHMM(gap.start),
        to: toHHMM(gap.end),
        required: gap.required,
        actual: gap.actual,
      });
    }
  }

  return out;
}

/**
 * כששתי סיבות שקולות בכמות, מציגים את זו שהמנהל יכול לפעול לפיה.
 * "חסום ע"י אילוץ זוגי" הוא מידע שאפשר לעשות איתו משהו;
 * "כבר משובץ באותו יום" הוא כמעט תמיד רעש.
 */
const REASON_PRIORITY: UnfilledReason[] = [
  // ראשונה בכוונה: זו הסיבה היחידה שיש בצידה פעולה מיידית למנהל
  "only-partial-available",
  "cross-round",
  "blocked-by-pair",
  "blocked-by-rest",
  "window-mismatch",
  "all-at-max",
  "all-busy-same-day",
  "taken-by-better-fit",
  "no-submissions",
];

/** הסיבה הנפוצה ביותר בין הנפסלים — זו שהכי כדאי למנהל לטפל בה. */
function dominantReason(reasons: UnfilledReason[]): UnfilledReason {
  const counts = new Map<UnfilledReason, number>();
  for (const r of reasons) counts.set(r, (counts.get(r) ?? 0) + 1);

  let best: UnfilledReason = "no-submissions";
  let bestCount = -1;
  for (const [reason, count] of counts) {
    if (
      count > bestCount ||
      (count === bestCount &&
        REASON_PRIORITY.indexOf(reason) < REASON_PRIORITY.indexOf(best))
    ) {
      best = reason;
      bestCount = count;
    }
  }
  return best;
}

function collectSoftViolations(state: ScheduleState, ctx: CostContext) {
  const out: { kind: string; detail: string }[] = [];
  const nameOf = (id: string) => ctx.employeeById.get(id)?.fullName ?? id;

  for (const c of ctx.constraints) {
    if (c.hard) continue;
    for (const a of state.assignmentsFor(c.aId)) {
      const slotA = ctx.slotById.get(a.slotId)!;
      for (const b of state.assignmentsFor(c.bId)) {
        const slotB = ctx.slotById.get(b.slotId)!;
        if (slotA.dayIndex !== slotB.dayIndex) continue;
        const clash =
          c.scope === "sameDay" ||
          (a.actualStart < b.actualEnd && b.actualStart < a.actualEnd);
        if (clash) {
          out.push({
            kind: "soft-pair",
            detail: `${nameOf(c.aId)} ו${nameOf(c.bId)} משובצים יחד (העדפה, לא אילוץ קשיח)`,
          });
        }
      }
    }
  }

  return out;
}
