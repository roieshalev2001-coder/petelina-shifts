import { parseRoles, type Role } from "../domain";
import { toMinutes, zonedMidnight } from "../time";
import { closingTimeFor } from "../week";
import type {
  PinnedAssignment,
  SolverAvailability,
  SolverEmployee,
  SolverInput,
  SolverPairConstraint,
  SolverSlot,
} from "./types";

/** הצורות המינימליות שהאדפטר צריך — תואמות לרשומות Prisma. */
type DbWeek = { closingTimes: string; weekStart: Date };
type DbSlot = {
  id: string;
  dayOfWeek: number;
  date: Date;
  role: string;
  period: string;
  startTime: string;
  endTime: string;
  sortOrder: number;
  fixedStart: boolean;
  fixedEnd: boolean;
  standby: boolean;
};
type DbEmployee = {
  id: string;
  fullName: string;
  roles: string;
  active: boolean;
  requiredShifts: number;
  maxShifts: number;
  seniority: number;
  preferredPeriod: string | null;
};
type DbAvailability = {
  employeeId: string;
  slotId: string;
  state: string;
  earliestStart: string | null;
  latestEnd: string | null;
};
type DbConstraint = { aId: string; bId: string; scope: string; hard: boolean };
type DbAssignment = {
  slotId: string;
  employeeId: string;
  actualStart: string;
  actualEnd: string;
  shortened: boolean;
  pinned: boolean;
};

/** ממיר משבצת שבוע לצורת הפותר: שעות בדקות ו-"CLOSING" שנפתר. */
export function toSolverSlot(slot: DbSlot, week: DbWeek): SolverSlot {
  const closing = closingTimeFor(week, slot.dayOfWeek);
  const isClosing = slot.endTime === "CLOSING";
  return {
    id: slot.id,
    dayOfWeek: slot.dayOfWeek,
    // dayIndex הוא המרחק בימים מתחילת השבוע — כך חישוב המנוחה בין ימים נכון
    dayIndex: Math.round(
      (zonedMidnight(slot.date).getTime() - zonedMidnight(week.weekStart).getTime()) /
        86_400_000,
    ),
    role: slot.role as Role,
    period: slot.period as SolverSlot["period"],
    start: toMinutes(slot.startTime),
    end: toMinutes(isClosing ? closing : slot.endTime),
    isClosing,
    fixedStart: slot.fixedStart,
    fixedEnd: slot.fixedEnd,
    standby: slot.standby,
    sortOrder: slot.sortOrder,
  };
}

export function toSolverEmployee(e: DbEmployee): SolverEmployee {
  return {
    id: e.id,
    fullName: e.fullName,
    roles: parseRoles(e.roles),
    requiredShifts: e.requiredShifts,
    maxShifts: e.maxShifts,
    seniority: e.seniority,
    preferredPeriod:
      e.preferredPeriod === "morning" || e.preferredPeriod === "evening"
        ? e.preferredPeriod
        : null,
  };
}

export function buildSolverInput(args: {
  week: DbWeek;
  slots: DbSlot[];
  employees: DbEmployee[];
  availabilities: DbAvailability[];
  constraints: DbConstraint[];
  existingAssignments?: DbAssignment[];
  /**
   * ימים שהבנייה לא ממלאת — היום שישי, שהסידור שלו נקבע בנפרד (סבב שישי
   * או שיבוץ ידני; החלטה של רואי). בימים האלה:
   * - כל שיבוץ קיים נחשב נעוץ: הוא נשאר, ונספר במכסה השבועית ובכללי
   *   היום והזוגות — כדי שאף אחד לא יחרוג מהמקסימום בגלל שישי.
   * - משבצת ריקה לא נכנסת לפותר: לא תמולא, וגם לא תדווח כחסר.
   * - סימוני זמינות לא נחשבים, ולכן גם לא "מינימום משמרת אחת".
   */
  fixedDays?: number[];
  options?: SolverInput["options"];
}): SolverInput {
  const active = args.employees.filter((e) => e.active).map(toSolverEmployee);
  const employeeIds = new Set(active.map((e) => e.id));

  const fixedDays = new Set(args.fixedDays ?? []);
  const fixedSlotIds = new Set(
    args.slots.filter((s) => fixedDays.has(s.dayOfWeek)).map((s) => s.id),
  );
  /*
   * משבצת ביום שמחוץ לבנייה נכנסת לפותר רק כשיש בה שיבוץ שייספר. שיבוץ של
   * עובד לא פעיל לא נספר — ואילו המשבצת שלו הייתה נכנסת, הפותר היה רואה
   * אותה ריקה וממלא אותה, ושני שיבוצים לאותה משבצת מפילים את השמירה.
   */
  const counted = new Set(
    (args.existingAssignments ?? [])
      .filter((a) => fixedSlotIds.has(a.slotId) && employeeIds.has(a.employeeId))
      .map((a) => a.slotId),
  );

  const slots = args.slots
    .filter((s) => !fixedSlotIds.has(s.id) || counted.has(s.id))
    .map((s) => toSolverSlot(s, args.week));
  const slotIds = new Set(slots.map((s) => s.id));

  /*
   * רק סימונים על בלוקים מהתפקיד של העובד. מתלמד מגיש גם על הבלוקים של
   * התפקיד שהוא לומד (ראה submitRolesOf), והפותר לא משבץ אותו שם ממילא —
   * אבל סימון כזה היה נחשב "סימן משהו", ומלצר שמתלמד בר וסימן רק בר היה
   * מקבל "לפחות משמרת אחת" על משמרת מלצר שלא ביקש.
   */
  const rolesById = new Map(active.map((e) => [e.id, e.roles as string[]]));
  const roleBySlot = new Map(args.slots.map((s) => [s.id, s.role]));

  const availabilities: SolverAvailability[] = args.availabilities
    .filter(
      (a) =>
        slotIds.has(a.slotId) &&
        !fixedSlotIds.has(a.slotId) &&
        employeeIds.has(a.employeeId) &&
        (rolesById.get(a.employeeId) ?? []).includes(roleBySlot.get(a.slotId) ?? "") &&
        (a.state === "available" || a.state === "preferred"),
    )
    .map((a) => ({
      employeeId: a.employeeId,
      slotId: a.slotId,
      state: a.state as "available" | "preferred",
      earliestStart: a.earliestStart,
      latestEnd: a.latestEnd,
    }));

  /*
   * מלצר שהגיש וסימן משהו — זכאי למשמרת אחת לפחות. מי שהגיש בלי לסמן אף
   * משבצת אמר בעצם "לא השבוע", ואינו נכלל.
   */
  const marked = new Set(availabilities.map((a) => a.employeeId));
  const employees = active.map((e) => ({
    ...e,
    atLeastOne: e.roles.includes("waiter") && marked.has(e.id),
  }));

  const constraints: SolverPairConstraint[] = args.constraints
    .filter((c) => employeeIds.has(c.aId) && employeeIds.has(c.bId))
    .map((c) => ({
      aId: c.aId,
      bId: c.bId,
      scope: c.scope === "sameDay" ? "sameDay" : "overlapping",
      hard: c.hard,
    }));

  // רק שיבוצים שהמנהל נעץ במפורש שורדים הרצה מחדש — ובימים שמחוץ לבנייה, כולם
  const pinned: PinnedAssignment[] = (args.existingAssignments ?? [])
    .filter(
      (a) =>
        (a.pinned || fixedSlotIds.has(a.slotId)) &&
        slotIds.has(a.slotId) &&
        employeeIds.has(a.employeeId),
    )
    .map((a) => ({
      slotId: a.slotId,
      employeeId: a.employeeId,
      actualStart: toMinutes(a.actualStart),
      actualEnd: toMinutes(a.actualEnd),
      shortened: a.shortened,
    }));

  return {
    slots,
    employees,
    availabilities,
    constraints,
    pinned,
    options: args.options,
  };
}
