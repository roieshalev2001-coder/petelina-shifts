import {
  buildCandidateIndex,
  candidateKey,
  indexConstraints,
  isFeasible,
  ScheduleState,
  type Candidate,
  type CandidateIndex,
} from "./candidates";
import {
  groupWaiterSlotsByDay,
  marginalCost,
  totalCost,
  type CostContext,
} from "./cost";
import { buildReport } from "./explain";
import {
  DEFAULT_OPTIONS,
  type PinnedAssignment,
  type SolvedAssignment,
  type SolverInput,
  type SolverOptions,
  type SolverResult,
  type SolverSlot,
} from "./types";

/** מחולל מספרים פסאודו-אקראי דטרמיניסטי (mulberry32) — אותו seed, אותה תוצאה. */
function makeRng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * בונה סידור שבועי.
 *
 * שלב 1 — בנייה חמדנית: משבצות לפי נדירות (הכי פחות מועמדים קודם),
 *          ולכל משבצת נבחר המועמד עם העלות השולית הנמוכה ביותר.
 * שלב 2 — חיפוש מקומי: מהלכי move ו-swap עד שאין שיפור או שנגמר תקציב הזמן.
 *
 * שיבוצים נעוצים (pinned) נשארים קבועים לאורך כל התהליך.
 */
export function solve(input: SolverInput): SolverResult {
  const startedAt = Date.now();
  const options: SolverOptions = { ...DEFAULT_OPTIONS, ...input.options };

  const slotById = new Map(input.slots.map((s) => [s.id, s]));
  const employeeById = new Map(input.employees.map((e) => [e.id, e]));
  const constraintsByEmployee = indexConstraints(input.constraints);

  const preferred = new Set(
    input.availabilities
      .filter((a) => a.state === "preferred")
      .map((a) => candidateKey(a.employeeId, a.slotId)),
  );

  const ctx: CostContext = {
    slots: input.slots,
    slotById,
    employees: input.employees,
    employeeById,
    constraints: input.constraints,
    preferred,
    waiterSlotsByDay: groupWaiterSlotsByDay(input.slots),
    minOnFloor: options.minOnFloor,
  };

  const index = buildCandidateIndex(
    input.slots,
    input.employees,
    input.availabilities,
    options,
  );

  const pinnedSlotIds = new Set(input.pinned.map((p) => p.slotId));
  const state = new ScheduleState(slotById, input.pinned.map(toAssignment));

  greedyFill(state, index, ctx, constraintsByEmployee, options, pinnedSlotIds);
  localSearch(
    state,
    index,
    ctx,
    constraintsByEmployee,
    options,
    pinnedSlotIds,
    startedAt,
  );

  const assignments = state.toArray();
  const report = buildReport({
    state,
    index,
    ctx,
    constraintsByEmployee,
    options,
    cost: totalCost(state, ctx),
    elapsedMs: Date.now() - startedAt,
  });

  return { assignments, report };
}

function toAssignment(p: PinnedAssignment): SolvedAssignment {
  return { ...p, pinned: true };
}

// ---------------------------------------------------------------------------
// שלב 1: בנייה חמדנית
// ---------------------------------------------------------------------------

function greedyFill(
  state: ScheduleState,
  index: CandidateIndex,
  ctx: CostContext,
  constraintsByEmployee: ReturnType<typeof indexConstraints>,
  options: SolverOptions,
  pinnedSlotIds: ReadonlySet<string>,
) {
  // הכי פחות מועמדים קודם: משבצות "צרות" נסגרות לפני שהמועמדים שלהן נחטפים.
  // שובר שוויון: אחמ"ש לפני ברמן לפני מלצר, ואז לפי הסדר בגיליון.
  const rolePriority = { manager: 0, bartender: 1, waiter: 2 } as const;
  const open = ctx.slots
    .filter((s) => !pinnedSlotIds.has(s.id))
    .sort((a, b) => {
      const na = index.bySlot.get(a.id)?.length ?? 0;
      const nb = index.bySlot.get(b.id)?.length ?? 0;
      if (na !== nb) return na - nb;
      if (rolePriority[a.role] !== rolePriority[b.role]) {
        return rolePriority[a.role] - rolePriority[b.role];
      }
      if (a.dayIndex !== b.dayIndex) return a.dayIndex - b.dayIndex;
      return a.sortOrder - b.sortOrder;
    });

  for (const slot of open) {
    const best = bestCandidateFor(
      slot,
      index,
      ctx,
      state,
      constraintsByEmployee,
      options,
    );
    if (best) state.add(best);
  }
}

function bestCandidateFor(
  slot: SolverSlot,
  index: CandidateIndex,
  ctx: CostContext,
  state: ScheduleState,
  constraintsByEmployee: ReturnType<typeof indexConstraints>,
  options: SolverOptions,
  exclude?: string,
): SolvedAssignment | null {
  const candidates = index.bySlot.get(slot.id) ?? [];
  let best: SolvedAssignment | null = null;
  let bestCost = Infinity;

  for (const c of candidates) {
    if (c.employeeId === exclude) continue;
    const emp = ctx.employeeById.get(c.employeeId);
    if (!emp) continue;
    if (isFeasible(emp, slot, state, constraintsByEmployee, options)) continue;

    const cost = marginalCost(c.employeeId, slot, state, ctx);

    if (cost < bestCost) {
      bestCost = cost;
      best = toSolved(c, slot);
    }
  }

  return best;
}

function toSolved(c: Candidate, slot: SolverSlot): SolvedAssignment {
  return {
    slotId: slot.id,
    employeeId: c.employeeId,
    actualStart: c.fit.start,
    actualEnd: c.fit.end,
    // הפותר מקבל רק התאמות מלאות, ולכן שיבוץ אוטומטי לעולם אינו חלקי
    shortened: false,
    pinned: false,
  };
}

// ---------------------------------------------------------------------------
// שלב 2: חיפוש מקומי
// ---------------------------------------------------------------------------

function localSearch(
  state: ScheduleState,
  index: CandidateIndex,
  ctx: CostContext,
  constraintsByEmployee: ReturnType<typeof indexConstraints>,
  options: SolverOptions,
  pinnedSlotIds: ReadonlySet<string>,
  startedAt: number,
) {
  const rng = makeRng(options.seed);
  const movable = ctx.slots.filter((s) => !pinnedSlotIds.has(s.id));
  let current = totalCost(state, ctx);
  let improved = true;

  while (improved && Date.now() - startedAt < options.timeBudgetMs) {
    improved = false;

    // --- מהלך move: להחליף את מי שמאייש משבצת, או לאייש משבצת ריקה ---
    for (const slot of shuffled(movable, rng)) {
      if (Date.now() - startedAt > options.timeBudgetMs) break;

      const before = state.bySlot.get(slot.id);
      if (before) state.remove(slot.id);

      const replacement = bestCandidateFor(
        slot,
        index,
        ctx,
        state,
        constraintsByEmployee,
        options,
      );
      if (replacement) state.add(replacement);

      const after = totalCost(state, ctx);
      if (after < current) {
        current = after;
        improved = true;
      } else {
        // החזרה למצב הקודם
        if (replacement) state.remove(slot.id);
        if (before) state.add(before);
      }
    }

    // --- מהלך transfer: העברת עובד ממשבצת שהוא מאייש למשבצת ריקה ---
    // בלי המהלך הזה עובד שנתפס במשבצת הראשונה שנבדקה נשאר בה, גם אם משבצת
    // ריקה אחרת מתאימה לו יותר (למשל כזו שסימן "מעדיף") והוא כבר במקסימום.
    for (const empty of shuffled(movable, rng)) {
      if (Date.now() - startedAt > options.timeBudgetMs) break;
      if (state.bySlot.has(empty.id)) continue;

      for (const cand of index.bySlot.get(empty.id) ?? []) {
        const emp = ctx.employeeById.get(cand.employeeId);
        if (!emp) continue;

        const held = state
          .assignmentsFor(cand.employeeId)
          .filter((a) => !pinnedSlotIds.has(a.slotId));

        for (const from of held) {
          const fromSlot = ctx.slotById.get(from.slotId)!;
          state.remove(from.slotId);

          if (isFeasible(emp, empty, state, constraintsByEmployee, options)) {
            state.add(from);
            continue;
          }

          state.add(toSolved(cand, empty));
          // המשבצת שהתפנתה עשויה להתאים למישהו אחר
          const backfill = bestCandidateFor(
            fromSlot,
            index,
            ctx,
            state,
            constraintsByEmployee,
            options,
          );
          if (backfill) state.add(backfill);

          const after = totalCost(state, ctx);
          if (after < current) {
            current = after;
            improved = true;
            break;
          }

          if (backfill) state.remove(fromSlot.id);
          state.remove(empty.id);
          state.add(from);
        }

        if (state.bySlot.has(empty.id)) break;
      }
    }

    // --- מהלך swap: החלפת שני עובדים בין שתי משבצות ---
    for (const a of shuffled(movable, rng)) {
      if (Date.now() - startedAt > options.timeBudgetMs) break;
      const asg1 = state.bySlot.get(a.id);
      if (!asg1) continue;

      for (const b of movable) {
        if (b.id === a.id) continue;
        const asg2 = state.bySlot.get(b.id);
        if (!asg2 || asg2.employeeId === asg1.employeeId) continue;

        const c1 = index.byKey.get(candidateKey(asg2.employeeId, a.id));
        const c2 = index.byKey.get(candidateKey(asg1.employeeId, b.id));
        if (!c1 || !c2) continue;

        state.remove(a.id);
        state.remove(b.id);

        const emp1 = ctx.employeeById.get(asg2.employeeId)!;
        const emp2 = ctx.employeeById.get(asg1.employeeId)!;

        // הבדיקות סדרתיות ולא במקביל: emp2 נבדק כשemp1 כבר במקומו, אחרת
        // אילוץ "לא יחד" בין השניים היה חומק מבעד לבדיקה.
        let accepted = false;
        if (!isFeasible(emp1, a, state, constraintsByEmployee, options)) {
          state.add(toSolved(c1, a));
          if (!isFeasible(emp2, b, state, constraintsByEmployee, options)) {
            state.add(toSolved(c2, b));
            if (totalCost(state, ctx) < current) {
              current = totalCost(state, ctx);
              improved = true;
              accepted = true;
            } else {
              state.remove(b.id);
            }
          }
          if (!accepted) state.remove(a.id);
        }

        if (accepted) {
          // asg1 כבר לא משקף את המצב — יוצאים ונותנים לסבב הבא לקרוא מחדש
          break;
        }

        state.add(asg1);
        state.add(asg2);
      }
    }
  }
}

function shuffled<T>(items: T[], rng: () => number): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}
