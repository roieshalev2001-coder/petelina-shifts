import { CLOSING } from "./domain";

/** דקות מחצות. "07:15" → 435 */
export function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

/** 435 → "07:15" */
export function toHHMM(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/**
 * פותר endTime של משבצת לשעה קונקרטית.
 * "CLOSING" נפתר לשעת הסגירה של השבוע.
 */
export function resolveEnd(endTime: string, closingTime: string): string {
  return endTime === CLOSING ? closingTime : endTime;
}

export type Interval = { start: number; end: number };

export function slotInterval(
  slot: { startTime: string; endTime: string },
  closingTime: string,
): Interval {
  return {
    start: toMinutes(slot.startTime),
    end: toMinutes(resolveEnd(slot.endTime, closingTime)),
  };
}

/** האם שני טווחים חופפים (נגיעה בקצה אינה חפיפה: 15:00-סיום ו-15:00-התחלה בסדר) */
export function overlaps(a: Interval, b: Interval): boolean {
  return a.start < b.end && b.start < a.end;
}

/** אורך החפיפה בדקות, 0 אם אין */
export function overlapMinutes(a: Interval, b: Interval): number {
  return Math.max(0, Math.min(a.end, b.end) - Math.max(a.start, b.start));
}

export function duration(i: Interval): number {
  return i.end - i.start;
}

/** תצוגה: "07:15 - 15:00" (RTL — שעת ההתחלה מימין) */
export function formatRange(
  startTime: string,
  endTime: string,
  closingTime?: string,
): string {
  if (endTime === CLOSING && !closingTime) return `עד סגירה - ${startTime}`;
  return `${resolveEnd(endTime, closingTime ?? "")} - ${startTime}`;
}

/**
 * חלון הזמינות שהעובד הצהיר עליו. שדה חסר = ללא הגבלה בכיוון הזה.
 */
export type AvailabilityWindow = {
  earliestStart?: string | null;
  latestEnd?: string | null;
};

export function windowInterval(w: AvailabilityWindow): Interval {
  return {
    start: w.earliestStart ? toMinutes(w.earliestStart) : 0,
    end: w.latestEnd ? toMinutes(w.latestEnd) : 24 * 60,
  };
}

/** אורך המינימום למשמרת. מתחת לזה לא שווה לשבץ אף אחד. */
export const MIN_SHIFT_MINUTES = 240;

export type FitOptions = {
  minShiftMinutes?: number;
  /** המשבצת פותחת את הסבב — חייבים להגיע בשעה המדויקת */
  fixedStart?: boolean;
  /** המשבצת סוגרת את הסבב — חייבים להישאר עד הסוף */
  fixedEnd?: boolean;
};

export type SlotFit =
  /** המשבצת כולה בתוך חלון הזמינות */
  | { kind: "full"; start: number; end: number }
  /** חלק מהמשבצת — מגיע מאוחר ו/או יורד מוקדם */
  | {
      kind: "partial";
      start: number;
      end: number;
      startsLate: boolean;
      endsEarly: boolean;
      missingMinutes: number;
      /** מאחר למשבצת שאמורה לפתוח — המקום ייפתח באיחור */
      breaksOpening: boolean;
      /** יורד ממשבצת שאמורה לסגור — לא יישאר מי שיסגור */
      breaksClosing: boolean;
    }
  /** אין התאמה */
  | { kind: "none"; reason: "too-short" | "no-overlap" };

/**
 * הלב של הטיפול באילוצי שעות של עובד.
 *
 * הכללים אינם סימטריים, כי המשמרת בבית קפה אינה סימטרית: משבצת פותחת
 * אמורה להתחיל בשעה המדויקת, ומשבצת סוגרת אמורה להסתיים בשעה שלה.
 *
 * אבל סטייה מהן **אינה פסילה** — היא כיסוי חלקי עם אזהרה. הסיבה: הפותר
 * ממילא לא נוגע בכיסוי חלקי (הוא משבץ אוטומטית רק התאמות מלאות, ראה
 * candidates.ts), ולכן ההבטחה "אף אחד לא ישובץ לבד לפתיחה באיחור" נשמרת
 * גם בלי לפסול. מה שכן משתנה: אחמ״ש שיכול להגיע ב-08:00 במקום ב-07:00
 * יכול עכשיו לרשום את זה, והמנהל רואה את האפשרות ומחליט — במקום שהמשבצת
 * תיחסם לו ותיעלם בשקט.
 *
 * `breaksOpening` / `breaksClosing` הם מה שמעביר את האזהרה למעלה, כדי
 * שהמנהל יראה *למה* הכיסוי החלקי הזה בעייתי ולא רק שהוא חלקי.
 *
 * שמירה על רצפת האיוש הכוללת אינה נבדקת כאן — היא תלויה בכל השיבוצים
 * של אותו יום ביחד, ולכן נבדקת ב-src/lib/coverage.ts.
 */
export function fitSlot(
  slot: Interval,
  window: AvailabilityWindow,
  options: FitOptions = {},
): SlotFit {
  const {
    minShiftMinutes = MIN_SHIFT_MINUTES,
    fixedStart = false,
    fixedEnd = false,
  } = options;

  const w = windowInterval(window);

  const startsLate = w.start > slot.start;
  const endsEarly = w.end < slot.end;

  const start = Math.max(slot.start, w.start);
  const end = Math.min(slot.end, w.end);
  const worked = end - start;

  if (worked <= 0) return { kind: "none", reason: "no-overlap" };

  if (!startsLate && !endsEarly) {
    // המשבצת עצמה עשויה להיות קצרה מהמינימום — זו זכותו של בית הקפה,
    // והמינימום חל רק על קיצור שנובע מאילוץ של העובד.
    return { kind: "full", start: slot.start, end: slot.end };
  }

  if (worked < minShiftMinutes) return { kind: "none", reason: "too-short" };

  return {
    kind: "partial",
    start,
    end,
    startsLate,
    endsEarly,
    missingMinutes: duration(slot) - worked,
    breaksOpening: startsLate && fixedStart,
    breaksClosing: endsEarly && fixedEnd,
  };
}

// ---------------------------------------------------------------------------
// תאריכים
// ---------------------------------------------------------------------------

/**
 * אזור הזמן של בית הקפה.
 *
 * **שום דבר כאן לא נשען על שעון התהליך.** זה לא הידור יתר: `TZ=Asia/Jerusalem`
 * מוגדר ב-.env ומועבר לפריסה, ובכל זאת השרת בייצור רץ ב-UTC — הוכחה,
 * `weekStart` של השבוע היחיד שנוצר אי פעם נשמר כ-`2026-08-23T00:00:00.000Z`,
 * בעוד שבשעון ישראל `startOfWeek` היה מייצר `2026-08-22T21:00:00.000Z`.
 *
 * הסיבוב הקודם תיקן את **התצוגה** בלבד (המעברים למטה נעולים על TIME_ZONE),
 * ולכן תאריכים נראו נכון בזמן שהבנייה נשארה שבורה: מועד אחרון שנקבע ל-20:00
 * נשמר כ-`20:00Z` והוצג כ-23:00, ושעות קובץ היומן יצאו שלוש שעות מאוחר מדי.
 *
 * לכן הבנייה עוברת דרך `zonedTime` ולא דרך `setHours`. `TZ=UTC npm test`
 * הוא מה שמחזיק את זה — הוא מריץ את הבדיקות בדיוק בתנאי הייצור.
 */
export const TIME_ZONE = "Asia/Jerusalem";

const zonedPartsFormat = new Intl.DateTimeFormat("en-CA", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
  timeZone: TIME_ZONE,
});

export type ZonedParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
};

/** שעון הקיר בישראל ברגע נתון, בלי תלות ב-TZ של התהליך */
export function zonedParts(date: Date): ZonedParts {
  const p = Object.fromEntries(
    zonedPartsFormat.formatToParts(date).map((x) => [x.type, x.value]),
  );
  return {
    year: Number(p.year),
    month: Number(p.month),
    day: Number(p.day),
    // בחצות en-CA מחזיר "24" ולא "00" בחלק מהמנועים
    hour: Number(p.hour) % 24,
    minute: Number(p.minute),
    second: Number(p.second),
  };
}

/** בכמה שעון ישראל מקדים את UTC ברגע נתון (משתנה עם שעון קיץ) */
function offsetMs(instant: Date): number {
  const p = zonedParts(instant);
  const asIfUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return asIfUtc - instant.getTime();
}

/**
 * הרגע שבו שעון הקיר בישראל מראה את הערכים שניתנו.
 *
 * ההיסט תלוי ברגע עצמו, וההיסט של הרגע עדיין לא ידוע — לכן ניחוש ואז
 * תיקון. הסיבוב השני נדרש רק סביב מעברי שעון קיץ, ומתכנס שם.
 */
export function zonedTime(
  year: number,
  month: number,
  day: number,
  hour = 0,
  minute = 0,
  second = 0,
): Date {
  const wall = Date.UTC(year, month - 1, day, hour, minute, second);
  let ts = wall - offsetMs(new Date(wall));
  ts = wall - offsetMs(new Date(ts));
  return new Date(ts);
}

/** חצות של אותו יום קלנדרי בישראל */
export function zonedMidnight(date: Date): Date {
  const p = zonedParts(date);
  return zonedTime(p.year, p.month, p.day);
}

/** 0 = ראשון … 6 = שבת, לפי היום הקלנדרי בישראל */
export function zonedDayOfWeek(date: Date): number {
  const p = zonedParts(date);
  return new Date(Date.UTC(p.year, p.month - 1, p.day)).getUTCDay();
}

/** השעה בישראל, 0–23 */
export function zonedHour(date: Date): number {
  return zonedParts(date).hour;
}

/** אותו יום קלנדרי בישראל, בשעה שנתונה בדקות מחצות */
export function zonedAtMinutes(date: Date, minutes: number): Date {
  const p = zonedParts(date);
  return zonedTime(p.year, p.month, p.day, 0, minutes);
}

const dateTimeFormat = new Intl.DateTimeFormat("he-IL", {
  dateStyle: "short",
  timeStyle: "short",
  timeZone: TIME_ZONE,
});

const dateFormat = new Intl.DateTimeFormat("he-IL", {
  dateStyle: "short",
  timeZone: TIME_ZONE,
});

const dayMonthFormat = new Intl.DateTimeFormat("he-IL", {
  day: "numeric",
  month: "numeric",
  timeZone: TIME_ZONE,
});

/** "19.8.2026, 23:00" בשעון ישראל */
export function formatDateTime(date: Date): string {
  return dateTimeFormat.format(date);
}

/** "19.8.2026" בשעון ישראל */
export function formatDate(date: Date): string {
  return dateFormat.format(date);
}

/** יום ראשון של השבוע שאליו שייך התאריך (השבוע בישראל מתחיל בראשון). */
export function startOfWeek(date: Date): Date {
  const p = zonedParts(date);
  return zonedTime(p.year, p.month, p.day - zonedDayOfWeek(date));
}

/**
 * הזזה של ימים **קלנדריים בישראל**, לא של 24 שעות.
 *
 * ההבדל מופיע פעמיים בשנה: במעבר שעון קיץ היממה אינה 24 שעות, ותוספת של
 * מכפלת מילישניות הייתה מזיזה את שעת הקיר. Date.UTC מטפל בגלישת חודש ושנה.
 */
export function addDays(date: Date, days: number): Date {
  const p = zonedParts(date);
  return zonedTime(p.year, p.month, p.day + days, p.hour, p.minute, p.second);
}

/** "16/8" — הפורמט שבו התאריכים מופיעים בכותרות הגיליון */
export function formatDayMonth(date: Date): string {
  const parts = Object.fromEntries(
    dayMonthFormat.formatToParts(date).map((p) => [p.type, p.value]),
  );
  return `${parts.day}/${parts.month}`;
}

/*
 * בידוד דו-כיווני: FSI פותח, PDI סוגר.
 *
 * כל מה שביניהם נחשב יחידה סגורה שהכיווניות שלה נקבעת מתוכה, ולכן היא
 * אינה נבלעת בריצה של השכנים.
 */
const FSI = "\u2068";
const PDI = "\u2069";

/**
 * רשימת תאריכים בתוך משפט עברי.
 *
 * **הבאג שזה מתקן:** תאריך כמו `28/8` הוא ריצת LTR, והפסיק והרווח
 * שבין הפריטים הם תווים נייטרליים. אלגוריתם הדו-כיווניות מצרף אותם
 * לריצת LTR אחת ומציג אותה משמאל לימין — כך ש-`28/8, 18/9` נקרא
 * `18/9 ,28/8`. הסדר בקוד נכון; מה שנשבר הוא מה שהעין קוראת.
 *
 * ההתראה על פרסום סבב שישי יצאה כך ל-25 עובדים.
 *
 * בידוד כל תאריך הופך אותו ליחידה סגורה, והרשימה נקראת בסדר שנשלח.
 * בתווי יוניקוד ולא ב-`<bdi>`, כי היעד הוא גוף התראה — מחרוזת, לא HTML.
 *
 * **לשמות אין צורך בזה**: עברית בתוך עברית היא אותה כיווניות.
 */
export function dateList(dates: Date[]): string {
  return dates.map((d) => `${FSI}${formatDayMonth(d)}${PDI}`).join(", ");
}

const pad = (n: number) => String(n).padStart(2, "0");

/**
 * "YYYY-MM-DD" לפי השעון המקומי.
 * toISOString היה מזיז את התאריך ביום אחורה בישראל (UTC+2/3).
 */
export function toDateInputValue(date: Date): string {
  const p = zonedParts(date);
  return `${p.year}-${pad(p.month)}-${pad(p.day)}`;
}

/** "YYYY-MM-DDTHH:MM" לפי השעון המקומי, עבור input[type=datetime-local] */
export function toDateTimeInputValue(date: Date): string {
  const p = zonedParts(date);
  return `${toDateInputValue(date)}T${pad(p.hour)}:${pad(p.minute)}`;
}

/** קורא ערך של input[type=date] כתאריך בחצות המקומית ולא ב-UTC */
export function fromDateInputValue(value: string): Date {
  const [y, m, d] = value.split("-").map(Number);
  return zonedTime(y, m, d);
}

/**
 * יום ראשון לפתיחת השבוע הבא.
 *
 * **תמיד קדימה, לעולם לא למילוי חור אחורה.** הגרסה הקודמת החזירה את יום
 * ראשון הפנוי הקרוב ביותר, ולכן אחרי שרואי מחק שבוע היא הציעה לו לפתוח
 * שוב בדיוק אותו שבוע — התאריך התפנה, והוא היה הקרוב ביותר.
 *
 * לכן המועמד הוא המאוחר מבין שניים: השבוע הבא מהיום, והשבוע שאחרי
 * האחרון שקיים. ה"מקסימום" ולא "האחרון + 7" לבדו הוא בשביל שבוע ישן
 * שנשאר במסד — הוא לא אמור לגרור את ההצעה לעבר.
 *
 * שבוע מאורכב נחשב כאן קיים: `weekStart` הוא `@unique`, והחזרה שלו
 * מהארכיון הייתה מתנגשת בשבוע חדש שנפתח באותו תאריך.
 *
 * התוצאה תמיד יום ראשון בחצות — וזה קריטי, כי `createWeek` בונה את ימי
 * השבוע כ-weekStart + dayOfWeek, ולכן תאריך שאינו ראשון היה מייצר שבוע
 * שהעמודות שלו לא תואמות לימים.
 */
export function nextAvailableWeekStart(
  existingStarts: Date[],
  from: Date = new Date(),
): Date {
  const starts = existingStarts.map((d) => startOfWeek(d).getTime());
  const taken = new Set(starts);

  const nextFromToday = addDays(startOfWeek(from), 7);
  const afterLast =
    starts.length > 0 ? addDays(new Date(Math.max(...starts)), 7) : null;

  let candidate =
    afterLast && afterLast.getTime() > nextFromToday.getTime()
      ? afterLast
      : nextFromToday;

  // רשת ביטחון: רצף לא רציף של שבועות קיימים
  while (taken.has(candidate.getTime())) {
    candidate = addDays(candidate, 7);
  }
  return candidate;
}

/** ברירת המחדל למועד האחרון: יום שישי שלפני תחילת השבוע, 20:00 */
export function defaultDeadlineFor(weekStart: Date): Date {
  const p = zonedParts(addDays(weekStart, -2));
  const deadline = zonedTime(p.year, p.month, p.day, 20, 0);
  return deadline;
}
