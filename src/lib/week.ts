import { DAY_NAMES, ROLE_LABEL, WEEK_STATUS_LABEL, parseRoles, type Role, type WeekStatus } from "./domain";
import { toHHMM, toMinutes, zonedDayOfWeek, zonedMidnight, zonedParts } from "./time";

/** ברירות המחדל לשעות הסגירה. שישי נסגר מוקדם לקראת שבת. */
export const DEFAULT_CLOSING_TIMES: Record<number, string> = {
  0: "23:00",
  1: "23:00",
  2: "23:00",
  3: "23:00",
  4: "23:00",
  5: "17:30",
  6: "23:00",
};

export function parseClosingTimes(json: string): Record<number, string> {
  let stored: Record<string, string> = {};
  try {
    stored = JSON.parse(json || "{}");
  } catch {
    stored = {};
  }
  const out: Record<number, string> = { ...DEFAULT_CLOSING_TIMES };
  for (const [day, time] of Object.entries(stored)) {
    const d = Number(day);
    if (Number.isInteger(d) && d >= 0 && d <= 6) out[d] = time;
  }
  return out;
}

/**
 * האם מציגים שעת סיום למשמרת ביום הזה.
 *
 * בשישי לא: הסבב קובע רק מי מגיע ומתי, וכל אחד נשאר כמה שצריך עד
 * שהמקום נסגר לקראת שבת. שעת סיום שמוצגת שם היא מספר שאיש לא עובד לפיו,
 * ולכן מוצגת רק שעת ההגעה (החלטה של רואי). שעת הסיום עדיין קיימת בנתונים
 * — לחישובי שעות ולקובץ היומן, שאירוע בו חייב סוף.
 */
export function showsEndTime(dayOfWeek: number): boolean {
  return dayOfWeek !== 5;
}

/**
 * איך השעות של בלוק מוצגות — לפי בחירת המנהל לכל בלוק (רואי):
 * range = "07:15–15:00" | start = "07:15" | end = "עד 15:00".
 * תצוגה בלבד: שתי השעות נשמרות תמיד, לחישובים וליומן.
 */
export type TimeDisplay = "range" | "start" | "end";

export const TIME_DISPLAYS: { key: TimeDisplay; label: string }[] = [
  { key: "range", label: "הגעה וסיום" },
  { key: "start", label: "רק הגעה" },
  { key: "end", label: "רק סיום" },
];

export function isTimeDisplay(value: string): value is TimeDisplay {
  return value === "range" || value === "start" || value === "end";
}

/** "07:15–15:00" / "07:15" / "עד 15:00". "CLOSING" נכתב "סגירה" */
export function formatHours(start: string, end: string, display: string = "range"): string {
  const endLabel = end === "CLOSING" ? "סגירה" : end;
  if (display === "start") return start;
  if (display === "end") return `עד ${endLabel}`;
  return `${start}–${endLabel}`;
}

/** "07:15–15:00", ובשישי "07:45" בלבד — ובשאר הימים לפי התצוגה של הבלוק */
export function shiftHours(shift: {
  dayOfWeek: number;
  actualStart: string;
  actualEnd: string;
  timeDisplay?: string;
}): string {
  return showsEndTime(shift.dayOfWeek)
    ? formatHours(shift.actualStart, shift.actualEnd, shift.timeDisplay)
    : shift.actualStart;
}

/** לאיזו שעה נפתר "עד סגירה" ביום מסוים בשבוע נתון. */
export function closingTimeFor(
  week: { closingTimes: string },
  dayOfWeek: number,
): string {
  return parseClosingTimes(week.closingTimes)[dayOfWeek] ?? "23:00";
}

/**
 * האם המועד האחרון להגשה חלף.
 *
 * קריאת שעון היא שאילתת נתונים ולא חלק מהרינדור, ולכן היא יושבת כאן ולא
 * בתוך רכיב — אותו דפוס כמו `isOpen` ב-loadSubmissionForm.
 */
export function isDeadlinePassed(week: { deadline: Date }): boolean {
  return week.deadline.getTime() < Date.now();
}

/**
 * האם היום של המשבצת כבר עבר (בשעון ישראל). היום עצמו אינו "עבר" —
 * משמרת ערב של היום עדיין יכולה להתמלא.
 */
export function isPastDay(date: Date, now: Date = new Date()): boolean {
  return zonedMidnight(date).getTime() < zonedMidnight(now).getTime();
}

/** כותרת עמודה בגיליון: "ראשון 16/8" */
export function dayHeading(date: Date): string {
  const p = zonedParts(date);
  return `${DAY_NAMES[zonedDayOfWeek(date)]} ${p.day}/${p.month}`;
}

/**
 * לאיזה שבוע טופס ההגשה נפתח.
 *
 * `null` אומר "להציג בחירה", ולא "אין שבוע".
 *
 * כאן ישבה התקלה המסוכנת ביותר במסך הזה: כשהדף שלף את השבוע הפתוח
 * ב-`findFirst` ממוין לפי תאריך, שני שבועות פתוחים גרמו לכך שכל ההגשות
 * נכנסו למוקדם מביניהם — בלי שום סימן, ועד שבונים סידור ורואים שבוע
 * ריק. לכן מה שהעובד ביקש במפורש גובר תמיד, וכשאין בקשה ויש יותר
 * משבוע אחד — שואלים אותו ולא מנחשים.
 *
 * תקינות המזהה אינה נבדקת כאן: `loadSubmissionForm` ממילא מחזיר null
 * לשבוע שאינו קיים, ומסמן `isOpen` לשבוע שמועדו חלף.
 */
export function pickSubmitWeek(
  requested: string | string[] | undefined,
  openWeekIds: string[],
): string | null {
  if (typeof requested === "string" && requested) return requested;
  if (openWeekIds.length === 1) return openWeekIds[0];
  return null;
}

/** כמה סידורי עבר נשארים במסך הראשי. השאר עוברים ל"סידורי עבר". */
export const RECENT_WEEKS = 4;

type WeekLike = {
  status: string;
  weekStart: Date;
  deletedAt: Date | null;
};

/**
 * מה נשאר במסך הראשי ומה עובר לארכיון.
 *
 * **כלל תצוגה בלבד** — שום דבר כאן אינו מוחק ואינו משנה נתון. המסך הראשי
 * הפך לרשימה ארוכה שבה הסידור הפעיל נבלע בין ישנים, וזו כל הבעיה שזה פותר.
 *
 * שבוע פתוח או טיוטה נשאר תמיד למעלה, גם אם הוא ישן: הוא עדיין מחכה
 * לפעולה. שבוע מאורכב יורד תמיד לארכיון, שם יש לו כפתור החזרה.
 *
 * לא תלוי בסדר הקלט, ומחזיר מהחדש לישן — אותו סדר שהמסך מציג היום.
 */
export function splitWeeks<T extends WeekLike>(
  weeks: T[],
  keep: number = RECENT_WEEKS,
): { recent: T[]; archive: T[] } {
  const byNewest = [...weeks].sort(
    (a, b) => b.weekStart.getTime() - a.weekStart.getTime(),
  );

  const recent: T[] = [];
  const archive: T[] = [];
  let past = 0;

  for (const week of byNewest) {
    if (week.deletedAt) {
      archive.push(week);
    } else if (week.status === "open" || week.status === "draft") {
      recent.push(week);
    } else if (past < keep) {
      past++;
      recent.push(week);
    } else {
      archive.push(week);
    }
  }

  return { recent, archive };
}

/** "יום לפני": יוצאת בריצה הראשונה של השעון בתוך 36 השעות שלפני המועד */
export const REMINDER_WINDOW_HOURS = 36;

/** "כמה שעות לפני": יוצאת כשנשארו פחות מ-8 שעות למועד */
export const LAST_HOURS_WINDOW = 8;

/**
 * השעות שבהן השעון רץ, ב-UTC — חייב להתאים ל-vercel.json. בחבילה החינמית
 * של Vercel כל ריצה יכולה לזוז עד שעה, ולכן המסך אומר "בסביבות".
 *
 * עם המועד הרגיל (שישי 20:00): הריצה של 09:00 בחמישי נופלת בחלון של
 * "יום לפני", והריצה של 15:00 בשישי — שעתיים-שלוש לפני — ב"כמה שעות לפני".
 */
export const REMINDER_RUNS_UTC = [9, 15] as const;

/**
 * איזו תזכורת שייכת לרגע הזה: "כמה שעות לפני" כשהמועד קרוב מאוד, "יום
 * לפני" כשהוא בתוך 36 השעות, ואף אחת כשהוא רחוק או שכבר עבר. כשהמועד קרוב
 * מספיק לשתיהן יוצאת רק הדחופה — שתי התראות ברצף הן בדיוק הכפילות שרצינו
 * להעלים.
 */
export function reminderStageFor(deadline: Date, now: Date): "day-before" | "last-hours" | null {
  const left = deadline.getTime() - now.getTime();
  if (left <= 0) return null;
  if (left <= LAST_HOURS_WINDOW * 60 * 60 * 1000) return "last-hours";
  if (left <= REMINDER_WINDOW_HOURS * 60 * 60 * 1000) return "day-before";
  return null;
}

/**
 * הריצה של השעון שבה תצא תזכורת מהסוג הזה — בשביל "תצא בחמישי בסביבות
 * 11:00" במסך השבוע. null כשהיא לא תצא בכלל: המועד קרוב מדי, או שעבר.
 */
export function nextReminderRun(
  stage: "day-before" | "last-hours",
  deadline: Date,
  now: Date,
): Date | null {
  const day = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  for (let d = 0; d < 60; d++) {
    for (const hour of REMINDER_RUNS_UTC) {
      const run = new Date(day + d * 86_400_000 + hour * 3_600_000);
      if (run.getTime() < now.getTime()) continue;
      if (run.getTime() >= deadline.getTime()) return null;
      const at = reminderStageFor(deadline, run);
      if (at === stage) return run;
      // הגענו כבר לחלון הדחוף — "יום לפני" כבר לא תצא
      if (at === "last-hours") return null;
    }
  }
  return null;
}

type ReminderWeek = {
  id: string;
  status: string;
  deadline: Date;
  deletedAt: Date | null;
  /** מי כבר הגיש לשבוע הזה */
  submittedIds: readonly string[];
  /** התזכורות שכבר יצאו לשבוע הזה (ReminderLog) */
  reminded: readonly { employeeId: string; stage: string }[];
};

/**
 * מי צריך לקבל תזכורת להגיש, לאיזה שבוע, ואיזו.
 *
 * רץ פעמיים ביום, ולכן הוא חייב להיות אדיש להרצות חוזרות: מי שכבר קיבל
 * את התזכורת מהסוג הזה לא מקבל אותה שוב. הבדיקה הסופית נעשית שוב בתוך
 * נעילה בזמן השליחה — ראה sendSubmitReminders.
 *
 * שבוע נכנס רק אם הוא פתוח, אינו מאורכב, והמועד האחרון שלו **לפנינו**
 * ובתוך החלון. מועד שחלף אינו תזכורת אלא רעש: כבר אי אפשר להגיש.
 */
export function whoNeedsReminder(args: {
  weeks: readonly ReminderWeek[];
  /** כל העובדים הפעילים */
  employeeIds: readonly string[];
  now: Date;
}): { weekId: string; stage: "day-before" | "last-hours"; employeeIds: string[] }[] {
  const { weeks, employeeIds, now } = args;
  const out: { weekId: string; stage: "day-before" | "last-hours"; employeeIds: string[] }[] = [];

  for (const week of weeks) {
    if (week.status !== "open" || week.deletedAt) continue;

    const stage = reminderStageFor(week.deadline, now);
    if (!stage) continue;

    const reminded = week.reminded.filter((r) => r.stage === stage).map((r) => r.employeeId);
    const done = new Set([...week.submittedIds, ...reminded]);
    const missing = employeeIds.filter((id) => !done.has(id));
    if (missing.length > 0) out.push({ weekId: week.id, stage, employeeIds: missing });
  }

  return out;
}

/**
 * סוגי התזכורת להגשה — ראה ReminderLog בסכימה. `manual` הוא הכפתור במסך
 * השבוע, והשניים האחרים יוצאים לבד מהשעון (src/app/api/cron/remind).
 */
export type ReminderStage = "manual" | "day-before" | "last-hours";

/** אחרי כמה שעות מותר לשלוח שוב התראה ידנית לאותו עובד (רואי: "אחרי יום") */
export const MANUAL_REPEAT_HOURS = 24;

/**
 * האם התזכורת הזו כבר יצאה לעובד הזה בשבוע הזה — ואז לא שולחים שוב.
 *
 * תזכורת אוטומטית יוצאת פעם אחת בשבוע מכל סוג, גם אם השעון רץ פעמיים.
 * ידנית אפשר לשלוח שוב, אבל רק אחרי יממה: ב-11/10 הכפתור נלחץ פעמיים
 * בהפרש של שעה, וכל מי שלא הגיש קיבל שתי התראות זהות.
 *
 * כל סוג נבדק לעצמו — תזכורת ידנית לא מבטלת את האוטומטית שלפני המועד.
 */
export function reminderBlocked(args: {
  stage: ReminderStage;
  /** מה שכבר נשלח לעובד הזה בשבוע הזה */
  previous: readonly { stage: string; createdAt: Date }[];
  now: Date;
}): boolean {
  const same = args.previous.filter((p) => p.stage === args.stage);
  if (args.stage !== "manual") return same.length > 0;
  const since = args.now.getTime() - MANUAL_REPEAT_HOURS * 60 * 60 * 1000;
  return same.some((p) => p.createdAt.getTime() > since);
}

// ---------------------------------------------------------------------------
// חריגה ממקסימום המשמרות
// ---------------------------------------------------------------------------

export type OverMaxAssignment = {
  slotId: string;
  employeeId: string;
  /** סבב שישי נעוץ — המנהל אינו יכול לפעול עליו מהלוח */
  pinned: boolean;
  dayOfWeek: number;
  sortOrder: number;
};

/**
 * אילו שיבוצים הם ה"עודפים" של עובד שחרג ממקסימום המשמרות שלו.
 *
 * החריגה היא תכונה של סך השבוע ולא של משמרת מסוימת, ולכן צריך כלל שיבחר
 * **אילו** תאים ייצבעו. הכלל: הנעוצים ראשונים בתור ולכן לעולם אינם
 * נבחרים כעודפים — סבב שישי נעוץ ומחייב, והמנהל לא יכול להסיר אותו מהלוח,
 * כך שאדום עליו היה דורש פעולה שאי אפשר לבצע. מה שנשאר ממוין לפי יום
 * וסדר בתוך היום, והאחרונים הם העודפים.
 *
 * הכלל יציב לבנייה נתונה — אותם שיבוצים נותנים תמיד אותה תוצאה — וזה כל
 * מה שנדרש: `buildSchedule` מוחק ובונה מחדש, והאישור מת איתו.
 */
export function overMaxSlotIds(
  assignments: OverMaxAssignment[],
  maxShiftsByEmployee: Map<string, number>,
): Set<string> {
  const byEmployee = new Map<string, OverMaxAssignment[]>();
  for (const a of assignments) {
    if (!byEmployee.has(a.employeeId)) byEmployee.set(a.employeeId, []);
    byEmployee.get(a.employeeId)!.push(a);
  }

  const out = new Set<string>();

  for (const [employeeId, list] of byEmployee) {
    const max = maxShiftsByEmployee.get(employeeId);
    if (max === undefined || list.length <= max) continue;

    const ordered = [...list].sort((a, b) => {
      if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
      if (a.dayOfWeek !== b.dayOfWeek) return a.dayOfWeek - b.dayOfWeek;
      if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
      return a.slotId.localeCompare(b.slotId);
    });

    for (const a of ordered.slice(max)) out.add(a.slotId);
  }

  return out;
}

// ---------------------------------------------------------------------------
// נוסח התזכורת להגשה
// ---------------------------------------------------------------------------

/**
 * הכותרת והגוף של התראת "טרם הגשת".
 *
 * משותף לתזכורת היומית האוטומטית (src/app/api/cron/remind) ולכפתור הידני
 * במסך השבוע, כדי שעובד לא יקבל שני ניסוחים שונים לאותה בקשה.
 */
export function submitReminderText(args: {
  /** "11/10–16/10" */
  weekLabel: string;
  /** המועד האחרון, כבר מעוצב לתצוגה */
  deadline: string;
  /** "כמה שעות לפני" — נוסח דחוף יותר, כדי שלא תיראה כמו הקודמת שוב */
  lastHours?: boolean;
}): { title: string; body: string } {
  /*
   * הטווח מבודד בתווי יוניקוד — ההתראה היא טקסט שטוח, ובלי בידוד הטווח
   * התהפך ל-"16/10–11/10". FSI/PDI ולא LRI: טווח של ספרות אין בו תו
   * "חזק", ולכן FSI נפתר ל-LTR, כמו dateList ב-src/lib/time.ts.
   */
  if (args.lastHours) {
    return {
      title: `נשארו כמה שעות להגשה לשבוע \u2068${args.weekLabel}\u2069`,
      body: `ההגשה נסגרת ב-${args.deadline}. מי שלא מגיש עלול לא לקבל משמרות השבוע.`,
    };
  }
  return {
    title: `טרם הגשת זמינות לשבוע \u2068${args.weekLabel}\u2069`,
    body: `המועד האחרון: ${args.deadline}. מי שלא מגיש עלול לא לקבל משמרות השבוע.`,
  };
}

// ---------------------------------------------------------------------------
// הודעה אישית לעובד אחרי הפרסום
// ---------------------------------------------------------------------------

export type PersonalShift = {
  dayOfWeek: number;
  /** השעות בפועל של העובד */
  actualStart: string;
  actualEnd: string;
  timeDisplay?: string;
  role: string;
  /** הערת המנהל לבלוק ("פותח קופה") */
  note?: string | null;
  /** משמרת כמתלמד: עם מי (null = עוד אין עובד בבלוק). חסר במשמרת רגילה */
  traineeWith?: string | null;
};

/**
 * "המשמרות שלך השבוע" — ההודעה שהמנהל שולח לכל עובד בוואטסאפ אחרי
 * הפרסום, ליד התמונה של כל הסידור. רק המשמרות שלו: יום, שעות ותפקיד.
 *
 * השעות כמו בסידור (shiftHours): בשישי רק הגעה, ותצוגת השעות של הבלוק.
 * הן מבודדות ב-FSI/PDI, כמו בהתראות (submitReminderText) — וואטסאפ הוא
 * טקסט שטוח, ובלי הבידוד "07:15–15:00" מתהפך.
 */
export function personalShiftsText(args: {
  fullName: string;
  /** "25/10–30/10" */
  weekLabel: string;
  shifts: readonly PersonalShift[];
  /** לאן לחזור לסידור המלא */
  link: string;
}): string {
  const lines = [...args.shifts]
    .sort((a, b) => a.dayOfWeek - b.dayOfWeek || a.actualStart.localeCompare(b.actualStart))
    .map((shift) => {
      const role = ROLE_LABEL[shift.role as Role] ?? shift.role;
      const what =
        shift.traineeWith === undefined
          ? role
          : `מתלמד ${role}${shift.traineeWith ? ` עם ${shift.traineeWith}` : ""}`;
      const note = shift.note ? ` · ${shift.note}` : "";
      return `${DAY_NAMES[shift.dayOfWeek]} \u2068${shiftHours(shift)}\u2069 · ${what}${note}`;
    });
  return (
    `היי ${args.fullName}, המשמרות שלך בשבוע \u2068${args.weekLabel}\u2069:\n\n` +
    `${lines.join("\n")}\n\n` +
    `הסידור המלא באתר: ${args.link}`
  );
}

// ---------------------------------------------------------------------------
// תג הסטטוס של שבוע
// ---------------------------------------------------------------------------

/**
 * המצב של השבוע כפי שהעובד חווה אותו — זה מה שמסכי המנהל מציגים.
 *
 * שבוע שהמועד שלו עבר נשאר `open` במסד עד שהמנהל לוחץ "סגירת ההגשה",
 * אבל הטופס כבר נעול (src/lib/submissions.ts). מבחינת כל מי שמסתכל זה
 * שבוע סגור, ולכן הוא מוחזר כ-`closed`: התג אדום, "סגירת ההגשה" מתחלף
 * ב"פתיחה מחדש", ו"פרסום" זמין בלי לסגור קודם פעולה שכבר קרתה.
 *
 * המסד לא משתנה ואין תהליך רקע — המצב מחושב בכל טעינה.
 */
export function effectiveWeekStatus(
  status: WeekStatus,
  deadlinePassed: boolean,
): WeekStatus {
  return status === "open" && deadlinePassed ? "closed" : status;
}

/**
 * תנאי השאילתה לשבוע שעובדים יכולים להגיש אליו עכשיו.
 *
 * אותו כלל כמו `isOpen` ב-src/lib/submissions.ts, בצורה של `where`. משמש
 * את השער של "לפתוח שבוע נוסף במקביל?" בשרת: שבוע שהמועד שלו עבר אינו
 * אפשרות לבחירה בשביל העובד, ולכן אינו "פתוח במקביל".
 */
export function acceptingSubmissionsWhere(now: Date = new Date()) {
  return { status: "open", deletedAt: null, deadline: { gt: now } };
}

/**
 * התג שמוצג ליד שבוע — ברשימת השבועות ובכותרת מסך השבוע.
 *
 * נגזר מ-effectiveWeekStatus. שבוע שנסגר ידנית ושבוע שהמועד שלו עבר מקבלים
 * את אותו תג — זה אותו מצב מבחינת כולם, ושני תגים שונים לו גרמו למנהל
 * לחפש הבדל שאין.
 *
 * שלושה צבעים: ירוק אפשר להגיש, אדום סגור, כחול פורסם.
 */
export function weekStatusBadge(
  status: WeekStatus,
  deadlinePassed: boolean,
): { label: string; tone: "green" | "red" | "blue" | "neutral" } {
  switch (effectiveWeekStatus(status, deadlinePassed)) {
    case "open":
      return { label: WEEK_STATUS_LABEL.open, tone: "green" };
    case "closed":
      return { label: "ההגשה סגורה", tone: "red" };
    case "published":
      return { label: WEEK_STATUS_LABEL.published, tone: "blue" };
    case "draft":
      return { label: WEEK_STATUS_LABEL.draft, tone: "neutral" };
  }
}

/**
 * האם לסידור של השבוע כבר יש משמעות — נבנה, או פורסם.
 *
 * לפני הבנייה לכולם יש אפס משמרות (חוץ מסבב שישי), ו"לא קיבל משמרת"
 * היה צובע את כל המסך באדום על משהו שעוד לא קרה.
 */
export function scheduleBuilt(week: { lastReport: string | null; status: string }): boolean {
  return week.lastReport !== null || week.status === "published";
}

/**
 * מלצרים שהגישו, סימנו לפחות משבצת אחת, ולא קיבלו אף משמרת.
 *
 * המינימום המקובל (רואי) הוא משמרת אחת לכל מלצר שהגיש. האלגוריתם מנסה
 * לעמוד בזה (WEIGHTS.noShiftAfterSubmitting); מי שבכל זאת נשאר בלי כלום
 * מסומן באדום, כדי שהמנהל יראה ויחליט.
 *
 * נספר מהשיבוצים בפועל ולא מדוח ההרצה — כך זה נשאר נכון גם אחרי עריכה
 * ידנית. מי שהגיש בלי לסמן אף משבצת אמר "לא השבוע", ואינו נכלל.
 */
export function waitersWithoutShift<E extends { id: string; roles: string }>(args: {
  employees: E[];
  /** מי שסימן לפחות משבצת אחת בשבוע הזה */
  markedIds: Set<string>;
  shiftCounts: Map<string, number>;
}): E[] {
  return args.employees.filter(
    (e) =>
      parseRoles(e.roles).includes("waiter") &&
      args.markedIds.has(e.id) &&
      (args.shiftCounts.get(e.id) ?? 0) === 0,
  );
}

/**
 * בלוק התבנית שממנו נוצרה משבצת של שבוע — כדי ש"שינוי תמידי" יגיע גם
 * לתבנית.
 *
 * ל-WeekSlot אין הפניה לתבנית: הוא העתק מוקפא שלה. ההתאמה היא לפי יום,
 * תפקיד והשעות שהיו לו, וכשיש כמה זהים (שני מלצרים 16:00–22:15) — זה עם
 * אותו `sortOrder`. אם התבנית השתנתה מאז שהשבוע נפתח, אין התאמה (null),
 * והמסך אומר שהשינוי חל רק על השבוע.
 */
export function findTemplateSlot<
  T extends { dayOfWeek: number; role: string; startTime: string; endTime: string; sortOrder: number },
>(
  template: T[],
  slot: { dayOfWeek: number; role: string; startTime: string; endTime: string; sortOrder: number },
): T | null {
  const same = template.filter(
    (t) =>
      t.dayOfWeek === slot.dayOfWeek &&
      t.role === slot.role &&
      t.startTime === slot.startTime &&
      t.endTime === slot.endTime,
  );
  return same.find((t) => t.sortOrder === slot.sortOrder) ?? same[0] ?? null;
}

/**
 * השעות של שיבוץ אחרי ששעות המשבצת שלו השתנו.
 *
 * מה שהיה צמוד לשעות המשבצת זז איתן. קיצור אישי (העובד מגיע מאוחר יותר
 * או יורד מוקדם בגלל אילוץ) נשמר, ורק נחתך לגבולות החדשים. כל השעות כאן
 * כבר פתורות ל-"HH:MM" — "עד סגירה" נפתר לפני הקריאה.
 */
export function shiftedActual(args: {
  oldStart: string;
  oldEnd: string;
  newStart: string;
  newEnd: string;
  actualStart: string;
  actualEnd: string;
}): { actualStart: string; actualEnd: string; shortened: boolean } {
  const m = toMinutes;
  const start =
    args.actualStart === args.oldStart
      ? m(args.newStart)
      : Math.max(m(args.actualStart), m(args.newStart));
  const end =
    args.actualEnd === args.oldEnd ? m(args.newEnd) : Math.min(m(args.actualEnd), m(args.newEnd));

  // הקיצור לא נכנס בגבולות החדשים — העובד מקבל את המשבצת כמו שהיא
  if (start >= end) {
    return { actualStart: args.newStart, actualEnd: args.newEnd, shortened: false };
  }
  const actualStart = toHHMM(start);
  const actualEnd = toHHMM(end);
  return {
    actualStart,
    actualEnd,
    shortened: actualStart !== args.newStart || actualEnd !== args.newEnd,
  };
}

/**
 * איפה נכנס בלוק חדש ביום ("+ מלצר", "+ בלוק") — ה-`sortOrder` שלו.
 *
 * **לפי שעת ההתחלה, בתוך הקבוצה שלו** (אותו תפקיד ואותו חלק של היום):
 * אחרי האחרון שמתחיל עד השעה החדשה, ולכן מלצר של 08:30 נכנס בין 08:15
 * ל-09:00, וכל מי שאחריו יורד מקום אחד (רואי). המוקדם מכולם נכנס בראש
 * הקבוצה. אין קבוצה כזו — אחרי האחרון מאותו תפקיד, ואם גם אין — בסוף.
 *
 * הקורא מזיז את כל מה שמ-`sortOrder` הזה והלאה מקום אחד קדימה.
 */
export function insertionSortOrder(
  day: { role: string; period: string; startTime: string; sortOrder: number }[],
  slot: { role: string; period: string; startTime: string },
): number {
  const sorted = [...day].sort((a, b) => a.sortOrder - b.sortOrder);
  const group = sorted.filter((s) => s.role === slot.role && s.period === slot.period);
  if (group.length > 0) {
    const before = group.filter((s) => toMinutes(s.startTime) <= toMinutes(slot.startTime));
    return before.length > 0 ? before.at(-1)!.sortOrder + 1 : group[0].sortOrder;
  }
  const sameRole = sorted.filter((s) => s.role === slot.role);
  const after = sameRole.at(-1) ?? sorted.at(-1);
  return after ? after.sortOrder + 1 : 0;
}
