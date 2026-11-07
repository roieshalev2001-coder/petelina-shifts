/** קבועים ומונחים משותפים לכל האפליקציה. */

export const ROLES = ["manager", "bartender", "waiter"] as const;
export type Role = (typeof ROLES)[number];

export const ROLE_LABEL: Record<Role, string> = {
  manager: 'אחמ"ש',
  bartender: "ברמן",
  waiter: "מלצר",
};

export const ROLE_LABEL_PLURAL: Record<Role, string> = {
  manager: 'אחמ"שים',
  bartender: "ברמנים",
  waiter: "מלצרים",
};

export const PERIODS = ["morning", "evening", "allday"] as const;
export type Period = (typeof PERIODS)[number];

export const PERIOD_LABEL: Record<Period, string> = {
  morning: "בוקר",
  evening: "ערב",
  allday: "כל היום",
};

/** מצב הסימון של עובד למשבצת. היעדר רשומה = unavailable. */
export type AvailabilityState = "unavailable" | "available" | "preferred";

export const WEEK_STATUSES = ["draft", "open", "closed", "published"] as const;
export type WeekStatus = (typeof WEEK_STATUSES)[number];

export const WEEK_STATUS_LABEL: Record<WeekStatus, string> = {
  draft: "טיוטה",
  open: "פתוח להגשה",
  closed: "ההגשה נסגרה",
  published: "פורסם",
};

/** 0 = ראשון ... 6 = שבת */
export const DAY_NAMES = [
  "ראשון",
  "שני",
  "שלישי",
  "רביעי",
  "חמישי",
  "שישי",
  "שבת",
] as const;

/** אות אחת ליום — לניווט מהיר במסכים צרים */
export const DAY_SHORT = ["א", "ב", "ג", "ד", "ה", "ו", "ש"] as const;

/** ערך endTime מיוחד: המשבצת נמשכת עד שעת הסגירה של אותו שבוע. */
export const CLOSING = "CLOSING";

export function parseRoles(csv: string): Role[] {
  return csv
    .split(",")
    .map((r) => r.trim())
    .filter((r): r is Role => (ROLES as readonly string[]).includes(r));
}

export function serializeRoles(roles: Role[]): string {
  return roles.join(",");
}

/**
 * מתלמדים. נשמרים באותו CSV של התפקידים, אבל הם **לא תפקיד במשמרת**:
 * מתלמד לא ממלא בלוק לבד, אלא מצטרף לבלוק של מלצר או ברמן רגיל, והמנהל
 * בוחר לאיזה (רואי). לכן parseRoles מתעלם מהם — הבנייה, סבב שישי ומסירת
 * משמרות לא רואים אותם בכלל.
 *
 * האות הגדולה בכוונה: "traineeWaiter".includes("waiter") הוא false, כך
 * שבדיקה על המחרוזת הגולמית לא תטעה ותחשוב שמתלמד הוא מלצר.
 */
export const TRAINEE_ROLES = ["traineeWaiter", "traineeBartender"] as const;
export type TraineeRole = (typeof TRAINEE_ROLES)[number];

/** התפקיד שמתלמדים אליו — ממנו נגזרים הבלוקים שהמתלמד מגיש ומצטרף אליהם */
export const TRAINEE_BASE: Record<TraineeRole, Role> = {
  traineeWaiter: "waiter",
  traineeBartender: "bartender",
};

export const TRAINEE_LABEL: Record<TraineeRole, string> = {
  traineeWaiter: "מתלמד מלצר",
  traineeBartender: "מתלמד בר",
};

export function parseTraineeRoles(csv: string): TraineeRole[] {
  return csv
    .split(",")
    .map((r) => r.trim())
    .filter((r): r is TraineeRole => (TRAINEE_ROLES as readonly string[]).includes(r));
}

/** התפקידים שהעובד מתלמד בהם: "traineeBartender" → ["bartender"] */
export function traineeFor(csv: string): Role[] {
  return parseTraineeRoles(csv).map((t) => TRAINEE_BASE[t]);
}

/**
 * הבלוקים שהעובד מגיש עליהם זמינות: התפקידים שלו, ועוד אלה שהוא מתלמד
 * בהם — מתלמד מגיש כמו כולם, והמנהל משבץ אותו ליד עובד רגיל.
 */
export function submitRolesOf(csv: string): Role[] {
  return [...new Set([...parseRoles(csv), ...traineeFor(csv)])];
}

/** כל התוויות של העובד, לתגיות: "מלצר", "מתלמד בר" */
export function roleLabelsOf(csv: string): string[] {
  return [
    ...parseRoles(csv).map((r) => ROLE_LABEL[r]),
    ...parseTraineeRoles(csv).map((t) => TRAINEE_LABEL[t]),
  ];
}
