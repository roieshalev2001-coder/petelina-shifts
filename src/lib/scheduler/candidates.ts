import { fitSlot, type SlotFit } from "../time";
import type {
  SolverAvailability,
  SolverEmployee,
  SolverOptions,
  SolverPairConstraint,
  SolverSlot,
  SolvedAssignment,
} from "./types";

/** עובד שסימן שהוא זמין למשבצת, יחד עם ההתאמה שנמצאה לחלון הזמינות שלו. */
export type Candidate = {
  employeeId: string;
  slotId: string;
  state: "available" | "preferred";
  fit: Extract<SlotFit, { kind: "full" } | { kind: "partial" }>;
};

/**
 * המועמדים מופרדים לשתי רשימות בכוונה.
 *
 * `bySlot` הוא המקור היחיד שהפותר קורא ממנו, והוא מכיל אך ורק התאמות מלאות —
 * ולכן אין שום מסלול שבו הפותר ישבץ מישהו לחלק ממשמרת. כיסוי חלקי הוא החלטה
 * של המנהל: הוא רואה את המשבצת ריקה, פותח אותה, ובוחר מתוך `partialBySlot`.
 */
export type CandidateIndex = {
  /** slotId → מי מתאים למשמרת המלאה. זה מה שהפותר משבץ. */
  bySlot: Map<string, Candidate[]>;
  /** slotId → מי יכול לכסות רק חלק. לתצוגה למנהל בלבד. */
  partialBySlot: Map<string, Candidate[]>;
  /** employeeId → כל ההתאמות המלאות שלו */
  byEmployee: Map<string, Candidate[]>;
  /** "employeeId|slotId" → התאמה מלאה */
  byKey: Map<string, Candidate>;
  /** מי נפסל בשלב הסינון הסטטי ומאיזו סיבה, לצורך דוח ההסבר */
  windowRejects: Map<string, { employeeId: string; reason: StaticRejectReason }[]>;
};

/*
 * איחור לפתיחה וירידה מוקדמת מסגירה אינם כאן: הם אינם פסילה יותר אלא
 * כיסוי חלקי מסומן, ולכן הם נכנסים ל-partialBySlot עם האזהרה ולא לרשימת
 * הדחויים. ראה fitSlot ב-src/lib/time.ts.
 */
export type StaticRejectReason =
  | "too-short"
  | "no-overlap";

export function candidateKey(employeeId: string, slotId: string) {
  return `${employeeId}|${slotId}`;
}

/**
 * סינון סטטי: תפקיד תואם, סימון קיים, והתאמת חלון הזמינות למשבצת.
 * אילוצים שתלויים בשיבוצים אחרים (חפיפה, זוגות, מקסימום) נבדקים ב-isFeasible.
 */
export function buildCandidateIndex(
  slots: SolverSlot[],
  employees: SolverEmployee[],
  availabilities: SolverAvailability[],
  options: SolverOptions,
): CandidateIndex {
  const slotById = new Map(slots.map((s) => [s.id, s]));
  const employeeById = new Map(employees.map((e) => [e.id, e]));

  const bySlot = new Map<string, Candidate[]>();
  const partialBySlot = new Map<string, Candidate[]>();
  const byEmployee = new Map<string, Candidate[]>();
  const byKey = new Map<string, Candidate>();
  const windowRejects: CandidateIndex["windowRejects"] = new Map();

  for (const slot of slots) {
    bySlot.set(slot.id, []);
    partialBySlot.set(slot.id, []);
  }

  for (const av of availabilities) {
    const slot = slotById.get(av.slotId);
    const employee = employeeById.get(av.employeeId);
    if (!slot || !employee) continue;

    // תפקיד תואם
    if (!employee.roles.includes(slot.role)) continue;

    const fit = fitSlot(
      { start: slot.start, end: slot.end },
      { earliestStart: av.earliestStart, latestEnd: av.latestEnd },
      {
        minShiftMinutes: options.minShortenedMinutes,
        fixedStart: slot.fixedStart,
        fixedEnd: slot.fixedEnd,
      },
    );

    if (fit.kind === "none") {
      pushReject(windowRejects, slot.id, av.employeeId, fit.reason);
      continue;
    }

    const candidate: Candidate = {
      employeeId: av.employeeId,
      slotId: av.slotId,
      state: av.state,
      fit,
    };

    // כיסוי חלקי לא נכנס לרשימה שהפותר קורא ממנה — הוא מוצע למנהל בלבד
    if (fit.kind === "partial") {
      partialBySlot.get(slot.id)!.push(candidate);
      continue;
    }

    bySlot.get(slot.id)!.push(candidate);
    if (!byEmployee.has(av.employeeId)) byEmployee.set(av.employeeId, []);
    byEmployee.get(av.employeeId)!.push(candidate);
    byKey.set(candidateKey(av.employeeId, av.slotId), candidate);
  }

  return { bySlot, partialBySlot, byEmployee, byKey, windowRejects };
}

function pushReject(
  map: CandidateIndex["windowRejects"],
  slotId: string,
  employeeId: string,
  reason: StaticRejectReason,
) {
  if (!map.has(slotId)) map.set(slotId, []);
  map.get(slotId)!.push({ employeeId, reason });
}

// ---------------------------------------------------------------------------
// מצב השיבוץ ובדיקות היתכנות
// ---------------------------------------------------------------------------

/** תצוגת עבודה של השיבוץ הנוכחי, לשאילתות מהירות במהלך החיפוש. */
export class ScheduleState {
  /** slotId → שיבוץ */
  readonly bySlot = new Map<string, SolvedAssignment>();
  /** employeeId → רשימת שיבוצים */
  readonly byEmployee = new Map<string, SolvedAssignment[]>();

  constructor(
    private readonly slotById: Map<string, SolverSlot>,
    initial: SolvedAssignment[] = [],
  ) {
    for (const a of initial) this.add(a);
  }

  add(a: SolvedAssignment) {
    // הוספה מעל שיבוץ קיים הייתה משאירה רשומה יתומה ב-byEmployee ומייצרת
    // כפל-שיבוץ שקט. עדיף להיכשל ברעש מאשר להוציא סידור לא תקין.
    if (this.bySlot.has(a.slotId)) {
      throw new Error(
        `ניסיון לשבץ למשבצת ${a.slotId} שכבר מאוישת — יש לקרוא ל-remove תחילה`,
      );
    }
    this.bySlot.set(a.slotId, a);
    if (!this.byEmployee.has(a.employeeId)) this.byEmployee.set(a.employeeId, []);
    this.byEmployee.get(a.employeeId)!.push(a);
  }

  remove(slotId: string) {
    const a = this.bySlot.get(slotId);
    if (!a) return;
    this.bySlot.delete(slotId);
    const list = this.byEmployee.get(a.employeeId);
    if (list) {
      const i = list.findIndex((x) => x.slotId === slotId);
      if (i >= 0) list.splice(i, 1);
    }
  }

  countFor(employeeId: string): number {
    return this.byEmployee.get(employeeId)?.length ?? 0;
  }

  assignmentsFor(employeeId: string): SolvedAssignment[] {
    return this.byEmployee.get(employeeId) ?? [];
  }

  slotOf(a: SolvedAssignment): SolverSlot {
    return this.slotById.get(a.slotId)!;
  }

  clone(): ScheduleState {
    return new ScheduleState(this.slotById, [...this.bySlot.values()]);
  }

  toArray(): SolvedAssignment[] {
    return [...this.bySlot.values()];
  }
}

/*
 * "at-max" הוסר: מקסימום המשמרות אינו פסילה יותר אלא מחיר כבד בפונקציית
 * העלות (ראה WEIGHTS.overMax). משבצת שרק עובד שהגיע למקסימום יכול לכסות
 * תאויש על ידו ותסומן למנהל, במקום להישאר ריקה.
 */
export type InfeasibleReason =
  | "busy-same-day"
  | "cross-round"
  | "standby-repeat"
  | "pair-conflict"
  | "rest-violation";

/**
 * האם ניתן לשבץ את העובד למשבצת בהינתן השיבוצים הקיימים.
 * מחזיר null אם אפשר, או את סיבת הפסילה.
 *
 * `ignoreSlotId` מאפשר לבדוק החלפה: מתעלמים מהשיבוץ הנוכחי של המשבצת הזו.
 */
export function isFeasible(
  employee: SolverEmployee,
  slot: SolverSlot,
  state: ScheduleState,
  constraintsByEmployee: Map<string, SolverPairConstraint[]>,
  options: SolverOptions,
  ignoreSlotIds: ReadonlySet<string> = new Set(),
): InfeasibleReason | null {
  const own = state
    .assignmentsFor(employee.id)
    .filter((a) => !ignoreSlotIds.has(a.slotId) && a.slotId !== slot.id);

  /*
   * המקסימום אינו נבדק כאן בכוונה — הוא רך. מה שנשאר למטה הם האילוצים
   * שאי אפשר לקנות בשום מחיר: משמרת אחת ביום, מנוחה, מעבר סבבים, כוננות
   * וזוגות קשיחים. בפועל כלל המשמרת-ביום הוא גם התקרה האמיתית — שישה
   * ימי עבודה בשבוע, ולכן איש לא יגיע לשבע ויהיה המקסימום שלו אשר יהיה.
   */
  for (const a of own) {
    const other = state.slotOf(a);

    /*
     * משמרת כוננות פעם אחת בשבוע.
     *
     * לא תמיד קוראים לה להגיע בפועל, ולכן שתיים לאותו אדם באותו שבוע הן
     * שתי הבטחות שאולי לא ישולמו — ומי שספר עליהן נשאר בלי שעות. הבדיקה
     * חוצה ימים בכוונה, בניגוד לכללי אותו יום שמתחתיה.
     */
    if (slot.standby && other.standby) return "standby-repeat";

    if (other.dayIndex === slot.dayIndex) {
      // מלצר לא עובר בין סבב הבוקר לסבב הערב באותו יום. הבדיקה קודמת
      // ל-onePerDay בכוונה, כדי שתחזיק גם אם אי פעם יאפשרו שתי משמרות ביום.
      // ברמנים ואחמ"שים פטורים — משבצות כמו ברמן צהריים 12:30-17:30
      // מגשרות בין הסבבים במכוון.
      if (slot.role === "waiter" && other.period !== slot.period) {
        return "cross-round";
      }
      if (options.onePerDay) return "busy-same-day";
      // גם ללא onePerDay, שתי משמרות חופפות באותו יום אסורות
      if (a.actualStart < slot.end && slot.start < a.actualEnd) {
        return "busy-same-day";
      }
    }

    // מנוחה בין ימים סמוכים: סגירה מאוחרת ואז פתיחה מוקדמת למחרת
    const restMinutes = options.minRestHours * 60;
    const gapForward =
      (slot.dayIndex - other.dayIndex) * 24 * 60 + slot.start - a.actualEnd;
    if (gapForward >= 0 && gapForward < restMinutes) return "rest-violation";
    const gapBackward =
      (other.dayIndex - slot.dayIndex) * 24 * 60 + other.start - slot.end;
    if (gapBackward >= 0 && gapBackward < restMinutes) return "rest-violation";
  }

  // אילוצי "לא עובדים יחד"
  for (const c of constraintsByEmployee.get(employee.id) ?? []) {
    if (!c.hard) continue;
    const otherId = c.aId === employee.id ? c.bId : c.aId;
    for (const a of state.assignmentsFor(otherId)) {
      if (ignoreSlotIds.has(a.slotId) || a.slotId === slot.id) continue;
      const otherSlot = state.slotOf(a);
      if (otherSlot.dayIndex !== slot.dayIndex) continue;
      if (c.scope === "sameDay") return "pair-conflict";
      if (a.actualStart < slot.end && slot.start < a.actualEnd) {
        return "pair-conflict";
      }
    }
  }

  return null;
}

export function indexConstraints(
  constraints: SolverPairConstraint[],
): Map<string, SolverPairConstraint[]> {
  const map = new Map<string, SolverPairConstraint[]>();
  for (const c of constraints) {
    if (!map.has(c.aId)) map.set(c.aId, []);
    if (!map.has(c.bId)) map.set(c.bId, []);
    map.get(c.aId)!.push(c);
    map.get(c.bId)!.push(c);
  }
  return map;
}
