import type { ScheduleState } from "./candidates";
import type {
  SolverEmployee,
  SolverPairConstraint,
  SolverSlot,
} from "./types";

/**
 * משקלי פונקציית העלות, מהחמור לקל. עלות נמוכה = סידור טוב יותר.
 * הסדר כאן הוא ההיררכיה שהמנהל מצפה לה: קודם כל שלא יהיו חורים,
 * אחר כך שכל עובד יקבל את מכסת המשמרות שלו, ורק אז נוחות והעדפות.
 */
export const WEIGHTS = {
  /** משבצת ריקה — לפי תפקיד. אחמ"ש חסר משמעו שאי אפשר לפתוח את המשמרת. */
  unfilledManager: 10_000,
  unfilledBartender: 6_000,
  unfilledWaiter: 3_000,
  /**
   * משמרת מעל המקסימום שהמנהל קבע לעובד.
   *
   * המספר תחום משני צדדים, וזה כל מה שהוא:
   * **מתחת ל-3,000** (משבצת מלצר ריקה) — אחרת חריגה לעולם לא תשתלם
   * והמשבצת תישאר ריקה, כלומר ההתנהגות הישנה.
   * **הרבה מעל כל שיקול רך אחר** — כל שאר המשקלים יחד מגיעים לכ-1,000
   * במקרה קיצון, ולכן מועמד שאינו במקסימום מנצח תמיד.
   *
   * התוצאה היא בדיוק הכלל שנקבע: לשבץ את מי שבמקסימום רק כשאין אף אחד
   * אחר. השיבוץ מסומן למנהל ודורש את אישורו — ראה overMaxApproved.
   */
  overMax: 2_000,
  /**
   * מלצר שהגיש ולא קיבל אף משמרת. המינימום המקובל (רואי) הוא משמרת אחת
   * לכל מי שהגיש, ולכן זה קודם למכסות ולכל שיקול רך:
   * **מעל 800** (משמרת חסרה ליעד) — משמרת ראשונה למי שאין לו כלום קודמת
   * לשנייה של מי שכבר יש לו. **מתחת ל-2,000** (חריגה) ול-3,000 (משבצת
   * ריקה) — לא דוחפים אף אחד מעל המקסימום ולא משאירים חור בשביל זה.
   * אם בכל זאת לא הסתדר, הוא מסומן באדום במסך ההגשות.
   */
  noShiftAfterSubmitting: 1_500,
  /** משמרת חסרה לעובד מול היעד שהמנהל קבע לו */
  shortfallPerShift: 800,
  /** חריגה מעל היעד — קלה, רק כדי לפזר בין העובדים */
  surplusPerShift: 60,
  /** שובץ למשבצת שסימן "יכול" במקום כזו שסימן "מעדיף" */
  notPreferred: 40,
  /** הפרת אילוץ "לא יחד" רך */
  softPairViolation: 700,
  /** חוסר איזון בעומס משמרות הסגירה בין העובדים */
  closingImbalance: 120,
  /**
   * ריכוז ותק — משמרת שכולה ותיקים לצד משמרת שכולה חדשים.
   * מוכפל בשונות של ממוצע הותק בין המשמרות.
   *
   * המשקל נמדד: סריקה מ-150 עד 10,000 נתנה תוצאה זהה לחלוטין — אותה שונות,
   * אותו אחוז איוש, אותו מספר שיבוצים ל"מעדיף". כלומר האילוצים הקשיחים
   * ממילא תוחמים את מרחב הפתרונות, והמשקל פועל רק כשובר-שוויון בין
   * פתרונות שקולים. לכן נבחר הערך הנמוך: הוא משיג את מלוא השיפור בלי
   * להסתכן בעיוות יעדים אחרים על נתונים שונים.
   */
  seniorityImbalance: 150,
  /** שיבוץ לחלק היום שהעובד לא מעדיף */
  periodMismatch: 25,
} as const;

export type CostContext = {
  slots: SolverSlot[];
  slotById: Map<string, SolverSlot>;
  employees: SolverEmployee[];
  employeeById: Map<string, SolverEmployee>;
  constraints: SolverPairConstraint[];
  /** "employeeId|slotId" → האם סומן כמועדף */
  preferred: Set<string>;
  /** משבצות המלצרים מקובצות ליום — לדיווח רצפת האיוש בלבד */
  waiterSlotsByDay: Map<number, SolverSlot[]>;
  minOnFloor: number;
};

/** מקבץ את משבצות המלצרים לפי יום — רצפת האיוש נבדקת ליום שלם */
export function groupWaiterSlotsByDay(
  slots: SolverSlot[],
): Map<number, SolverSlot[]> {
  const map = new Map<number, SolverSlot[]>();
  for (const slot of slots) {
    if (slot.role !== "waiter") continue;
    if (!map.has(slot.dayIndex)) map.set(slot.dayIndex, []);
    map.get(slot.dayIndex)!.push(slot);
  }
  return map;
}

/** עלות מלאה של סידור. משמשת להשוואה בין פתרונות בחיפוש המקומי. */
export function totalCost(state: ScheduleState, ctx: CostContext): number {
  let cost = 0;

  for (const slot of ctx.slots) {
    const a = state.bySlot.get(slot.id);

    if (!a) {
      cost +=
        slot.role === "manager"
          ? WEIGHTS.unfilledManager
          : slot.role === "bartender"
            ? WEIGHTS.unfilledBartender
            : WEIGHTS.unfilledWaiter;
      continue;
    }

    if (!ctx.preferred.has(`${a.employeeId}|${slot.id}`)) {
      cost += WEIGHTS.notPreferred;
    }

    const emp = ctx.employeeById.get(a.employeeId);
    if (emp?.preferredPeriod && slot.period !== "allday") {
      if (emp.preferredPeriod !== slot.period) cost += WEIGHTS.periodMismatch;
    }
  }

  // מכסת המשמרות של כל עובד
  for (const emp of ctx.employees) {
    const n = state.countFor(emp.id);
    if (n < emp.requiredShifts) {
      cost += (emp.requiredShifts - n) * WEIGHTS.shortfallPerShift;
    } else if (n > emp.requiredShifts) {
      cost += (n - emp.requiredShifts) * WEIGHTS.surplusPerShift;
    }
    if (n > emp.maxShifts) {
      cost += (n - emp.maxShifts) * WEIGHTS.overMax;
    }
    if (emp.atLeastOne && n === 0) cost += WEIGHTS.noShiftAfterSubmitting;
  }

  cost += softPairCost(state, ctx);
  cost += closingImbalanceCost(state, ctx);
  cost += seniorityImbalanceCost(state, ctx);

  return cost;
}

/**
 * פיזור ותק בין המשמרות.
 *
 * המדד הוא השונות של ממוצע הותק בין המשמרות (יום + סבב). משמרת שכולה
 * חדשים מושכת את הממוצע שלה למטה ומייצרת שונות, ולכן החיפוש המקומי יעדיף
 * להחליף מישהו ולפזר. משמרת מעורבת — [5,5,1,1] מול [3,3,3,3] — מקבלת אותו
 * ממוצע ואינה נענשת, וזה נכון: הוותיקים אכן פזורים בה.
 *
 * מלצרים בלבד. אחמ"שים וברמנים הם 1-3 במשמרת ובדרך כלל אותם אנשים, ופיזור
 * שלהם היה רק מייצר רעש מול המכסות שלהם.
 */
function seniorityImbalanceCost(state: ScheduleState, ctx: CostContext): number {
  const perShift = new Map<string, { total: number; count: number }>();

  for (const a of state.bySlot.values()) {
    const slot = ctx.slotById.get(a.slotId);
    if (!slot || slot.role !== "waiter") continue;
    const emp = ctx.employeeById.get(a.employeeId);
    if (!emp) continue;

    const key = `${slot.dayIndex}|${slot.period}`;
    const acc = perShift.get(key) ?? { total: 0, count: 0 };
    acc.total += emp.seniority;
    acc.count += 1;
    perShift.set(key, acc);
  }

  const means = [...perShift.values()].map((s) => s.total / s.count);
  if (means.length < 2) return 0;

  const mean = means.reduce((s, n) => s + n, 0) / means.length;
  const variance =
    means.reduce((s, n) => s + (n - mean) ** 2, 0) / means.length;

  return variance * WEIGHTS.seniorityImbalance;
}

function softPairCost(state: ScheduleState, ctx: CostContext): number {
  let cost = 0;
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
        if (clash) cost += WEIGHTS.softPairViolation;
      }
    }
  }
  return cost;
}

/**
 * משמרות סגירה הן הנטל הכי גדול. מענישים על שונות בחלוקתן, כדי שלא ייפול
 * על אותו אחד כל שבוע.
 *
 * הבריכה היא כל העובדים: הרשאת הסגירה בוטלה — כולם יכולים לסגור — ולכן
 * מה שנשאר הוא לא מי *רשאי* אלא על מי זה *נופל*, וזה בדיוק מה שנמדד כאן.
 */
function closingImbalanceCost(state: ScheduleState, ctx: CostContext): number {
  const closers = ctx.employees;
  if (closers.length < 2) return 0;

  const counts = closers.map((e) =>
    state
      .assignmentsFor(e.id)
      .filter((a) => ctx.slotById.get(a.slotId)!.isClosing).length,
  );

  const mean = counts.reduce((s, n) => s + n, 0) / counts.length;
  const variance =
    counts.reduce((s, n) => s + (n - mean) ** 2, 0) / counts.length;

  return variance * WEIGHTS.closingImbalance;
}

/**
 * העלות השולית של שיבוץ עובד למשבצת — משמשת לבנייה החמדנית.
 * נמוך יותר = מועמד טוב יותר.
 */
export function marginalCost(
  employeeId: string,
  slot: SolverSlot,
  state: ScheduleState,
  ctx: CostContext,
): number {
  const emp = ctx.employeeById.get(employeeId)!;
  const current = state.countFor(employeeId);

  let cost = 0;

  // כמה העובד "צריך" עוד משמרות — מי שרחוק מהיעד שלו מקבל עדיפות
  cost +=
    current < emp.requiredShifts
      ? -WEIGHTS.shortfallPerShift
      : WEIGHTS.surplusPerShift * (current - emp.requiredShifts + 1);

  // כבר במקסימום — המשמרת הזו תהיה חריגה. יקר מספיק כדי שכל מועמד אחר
  // יועדף, וזול מספיק כדי שעדיף לחרוג מאשר להשאיר את המשבצת ריקה.
  if (current >= emp.maxShifts) cost += WEIGHTS.overMax;

  // המשמרת הראשונה של מלצר שהגיש — ראה noShiftAfterSubmitting
  if (emp.atLeastOne && current === 0) cost -= WEIGHTS.noShiftAfterSubmitting;

  if (!ctx.preferred.has(`${employeeId}|${slot.id}`)) cost += WEIGHTS.notPreferred;
  if (emp.preferredPeriod && slot.period !== "allday" && emp.preferredPeriod !== slot.period) {
    cost += WEIGHTS.periodMismatch;
  }

  if (slot.isClosing) {
    const closings = state
      .assignmentsFor(employeeId)
      .filter((a) => ctx.slotById.get(a.slotId)!.isClosing).length;
    cost += closings * WEIGHTS.closingImbalance;
  }

  return cost;
}
