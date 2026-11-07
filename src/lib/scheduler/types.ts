import type { AvailabilityState, Role } from "../domain";
import { MIN_ON_FLOOR } from "../coverage";
import { MIN_SHIFT_MINUTES } from "../time";

/** משבצת בשבוע ספציפי, עם שעות שכבר נפתרו (ללא "CLOSING"). */
export type SolverSlot = {
  id: string;
  dayOfWeek: number;
  /** אינדקס היום בשבוע, 0..6 — משמש למניעת חפיפות ולחישוב מנוחה */
  dayIndex: number;
  role: Role;
  period: "morning" | "evening" | "allday";
  /** דקות מחצות */
  start: number;
  end: number;
  /** המשבצת מסתיימת בסגירת בית הקפה */
  isClosing: boolean;
  /** פותחת את הסבב — חובה להגיע בשעה המדויקת */
  fixedStart: boolean;
  /** סוגרת את הסבב — חובה להישאר עד הסוף */
  fixedEnd: boolean;
  /** משמרת כוננות — אותו עובד לא ישובץ אליה פעמיים באותו שבוע */
  standby: boolean;
  sortOrder: number;
};

export type SolverEmployee = {
  id: string;
  fullName: string;
  roles: Role[];
  requiredShifts: number;
  maxShifts: number;
  seniority: number;
  preferredPeriod: "morning" | "evening" | null;
  /**
   * מלצר שהגיש וסימן לפחות משבצת אחת — המינימום המקובל הוא שיקבל לפחות
   * משמרת אחת. ראה WEIGHTS.noShiftAfterSubmitting. מחושב ב-buildSolverInput,
   * כי הוא תלוי בהגשות של השבוע ולא בפרופיל.
   */
  atLeastOne?: boolean;
};

export type SolverAvailability = {
  employeeId: string;
  slotId: string;
  state: Exclude<AvailabilityState, "unavailable">;
  earliestStart: string | null;
  latestEnd: string | null;
};

export type SolverPairConstraint = {
  aId: string;
  bId: string;
  scope: "overlapping" | "sameDay";
  hard: boolean;
};

/** שיבוץ שהמנהל נעץ — האלגוריתם לא יזיז אותו. */
export type PinnedAssignment = {
  slotId: string;
  employeeId: string;
  actualStart: number;
  actualEnd: number;
  shortened: boolean;
};

export type SolverOptions = {
  /** אורך המינימום למשמרת אחרי קיצור בגלל אילוץ של העובד */
  minShortenedMinutes: number;
  /** כמה מלצרים חייבים להיות ברצפה בשעות העומס */
  minOnFloor: number;
  /** מספר שעות המנוחה המינימלי בין סוף משמרת לתחילת המשמרת הבאה */
  minRestHours: number;
  /** האם לאסור על עובד שתי משמרות באותו יום */
  onePerDay: boolean;
  /** תקציב זמן לחיפוש המקומי במילישניות */
  timeBudgetMs: number;
  /** seed לרנדומיזציה — קבוע כדי שאותה קלט תיתן אותה תוצאה */
  seed: number;
};

export const DEFAULT_OPTIONS: SolverOptions = {
  // חייב להישאר זהה לרצפה שהטופס מציג לעובד, אחרת סימון שהעובד הגיש
  // ייעלם בשקט בשלב השיבוץ
  minShortenedMinutes: MIN_SHIFT_MINUTES,
  minOnFloor: MIN_ON_FLOOR,
  minRestHours: 8,
  onePerDay: true,
  timeBudgetMs: 2000,
  seed: 12345,
};

export type SolverInput = {
  slots: SolverSlot[];
  employees: SolverEmployee[];
  availabilities: SolverAvailability[];
  constraints: SolverPairConstraint[];
  pinned: PinnedAssignment[];
  options?: Partial<SolverOptions>;
};

export type SolvedAssignment = {
  slotId: string;
  employeeId: string;
  actualStart: number;
  actualEnd: number;
  shortened: boolean;
  pinned: boolean;
};

/** מדוע משבצת נשארה ריקה */
export type UnfilledReason =
  | "no-submissions"
  | "all-at-max"
  | "all-busy-same-day"
  | "blocked-by-pair"
  | "blocked-by-rest"
  | "window-mismatch"
  | "only-partial-available"
  | "cross-round"
  | "all-on-standby"
  | "taken-by-better-fit";
/*
 * "must-open-on-time" ו-"must-close" הוסרו: איחור לפתיחה וירידה מוקדמת
 * מסגירה אינם פסילה יותר אלא כיסוי חלקי מסומן (ראה fitSlot ב-src/lib/time.ts),
 * ולכן משבצת כזו מדווחת כ-"only-partial-available" עם האזהרה על ה-PartialOption.
 *
 * "all-at-max" **אינו מיוצר עוד** — המקסימום הפך לרך, ומשבצת כזו מאוישת
 * בחריגה מסומנת. הוא נשאר בטיפוס ובטבלת התוויות בכוונה: דוחות שנשמרו
 * ב-Week.lastReport לפני השינוי עדיין מכילים אותו, ומחיקתו הייתה מרנדרת
 * תווית ריקה בשבועות ישנים.
 */

export type UnfilledSlotReport = {
  slotId: string;
  reason: UnfilledReason;
  /** כמה עובדים סימנו את המשבצת בכלל */
  submitted: number;
  /** פירוט: מי נפסל ולמה */
  rejected: { employeeId: string; reason: UnfilledReason }[];
  /**
   * מי יכול לכסות חלק מהמשמרת. הפותר לעולם לא בוחר מתוך הרשימה הזו —
   * היא קיימת כדי שהמנהל יראה מה האפשרויות שלו בתא הריק ויחליט בעצמו.
   */
  partialOptions: PartialOption[];
};

export type PartialOption = {
  employeeId: string;
  /** "09:00" */
  start: string;
  /** "15:00" */
  end: string;
  coveredMinutes: number;
  slotMinutes: number;
  state: "available" | "preferred";
  /** יגיע אחרי שעת הפתיחה — המקום ייפתח באיחור */
  breaksOpening: boolean;
  /** יירד לפני הסגירה — לא יישאר מי שיסגור */
  breaksClosing: boolean;
};

export type EmployeeShortfall = {
  employeeId: string;
  required: number;
  assigned: number;
  /** כמה משבצות סימן שהוא זמין אליהן */
  marked: number;
};

/**
 * עובד שקיבל יותר משמרות מהמקסימום שנקבע לו.
 *
 * זה קורה רק כשהחלופה היחידה הייתה משבצת ריקה, ודורש את אישור המנהל
 * לכל שיבוץ חורג — ראה `Assignment.overMaxApproved`.
 */
export type EmployeeOverMax = {
  employeeId: string;
  max: number;
  assigned: number;
};

export type SolverReport = {
  filled: number;
  total: number;
  unfilled: UnfilledSlotReport[];
  shortfalls: EmployeeShortfall[];
  /** אופציונלי: דוחות שנשמרו לפני שהמקסימום הפך לרך אינם מכילים אותו */
  overMax?: EmployeeOverMax[];
  /** מלצרים שהגישו ולא קיבלו אף משמרת. אופציונלי מאותה סיבה */
  noShift?: string[];
  shortenedAssignments: string[];
  /** חורים ברצפת האיוש, לפי יום */
  coverageGaps: { dayOfWeek: number; from: string; to: string; required: number; actual: number }[];
  softViolations: { kind: string; detail: string }[];
  cost: number;
  elapsedMs: number;
};

export type SolverResult = {
  assignments: SolvedAssignment[];
  report: SolverReport;
};
