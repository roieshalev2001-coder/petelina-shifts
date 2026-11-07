/**
 * סבב שישי.
 *
 * שישי הוא משמרת חובה: **הסבב קובע, לא ההגשה**. מי שתורו הגיע משובץ גם
 * אם לא סימן זמינות, והפטור היחיד הוא המדרגה שנקבעה לו בפרופיל. מי שלא
 * יכול בפועל מוסר את המשמרת דרך החילופים — זה מסלול המילוט, לא הסבב.
 *
 * הקובץ הזה טהור לחלוטין: בלי מסד, בלי שעון, ובלי אקראיות משלו. שני
 * קלטים זהים תמיד מייצרים אותה תוכנית, וזה מה שמאפשר לבדוק אותו. מי
 * שרוצה סידור אחר בכל לחיצה ("סידור אוטומטי") מעביר `random` בעצמו.
 */
import { toHHMM, toMinutes, zonedDayOfWeek, zonedParts, zonedTime } from "./time";


/**
 * כל ימי שישי בחודש, בשעון ישראל.
 *
 * יושבת כאן ולא בשכבת המסד למרות ששם היא נצרכת: היא חישוב טהור, וכל מי
 * שייבא אותה משם היה מושך איתה את לקוח ה-Prisma.
 */
export function fridaysInMonth(year: number, month: number): Date[] {
  const out: Date[] = [];
  const nextMonth = zonedTime(year, month + 1, 1).getTime();
  for (let day = 1; day <= 31; day++) {
    const date = zonedTime(year, month, day);
    // גלישה לחודש הבא — Date.UTC מתקן 31/9 ל-1/10, וכאן זה נעצר
    if (date.getTime() >= nextMonth) break;
    if (zonedDayOfWeek(date) === 5) out.push(date);
  }
  return out;
}

/**
 * N ימי השישי הבאים, החל מהקרוב ביותר שעדיין לא עבר.
 *
 * הסבב נבנה על אופק ולא על חודש קלנדרי: הגיליון שהסידור עובד לפיו מחזיק
 * שמונה שישיים ברצף, ולא אכפת לו איפה עובר גבול החודש. `fridaysInMonth`
 * נשארת כי מדרגות הפטור עדיין חודשיות.
 */
export function nextFridays(count: number, from: Date = new Date()): Date[] {
  const out: Date[] = [];
  const start = zonedParts(from);
  let cursor = zonedTime(start.year, start.month, start.day);
  // עד שנה קדימה — גבול שפוי שמונע לולאה אינסופית על קלט משובש
  for (let i = 0; i < 400 && out.length < count; i++) {
    if (zonedDayOfWeek(cursor) === 5) out.push(cursor);
    const p = zonedParts(cursor);
    cursor = zonedTime(p.year, p.month, p.day + 1);
  }
  return out;
}

/**
 * השישי שממנו נספרות תקופות הסבב — העמודה הראשונה בגיליון של רואי
 * (23/10/2026). מכאן והלאה כל תקופה היא 8 שישיים ברצף.
 */
const PERIOD_ANCHOR = { year: 2026, month: 10, day: 23 };

/** כמה שישיים בתקופה — "חודשיים", כמו בגיליון */
export const PERIOD_LENGTH = 8;

/**
 * התקופה הנוכחית והבאה של סבב שישי.
 *
 * **נוכחית** = זו שמכילה את השישי הקרוב (כולל היום, אם היום שישי) — הסידור
 * שכבר מוכן. **הבאה** = שמונת השישיים שאחריה, שעליה עובדים לקראת פרסום.
 * כשהנוכחית נגמרת, הבאה הופכת לנוכחית ונפתחת חדשה — בלי שום פעולה.
 *
 * תקופות קבועות מנקודת עוגן ולא "8 השישיים הבאים": אופק מתגלגל היה זז
 * בשבוע כל שבוע, ושישי היה עובר מ"הבאה" ל"נוכחית" באמצע העבודה עליו.
 */
export function rotationPeriods(from: Date = new Date()): { current: Date[]; next: Date[] } {
  const first = zonedParts(nextFridays(1, from)[0]);
  const days = Math.round(
    (Date.UTC(first.year, first.month - 1, first.day) -
      Date.UTC(PERIOD_ANCHOR.year, PERIOD_ANCHOR.month - 1, PERIOD_ANCHOR.day)) /
      86_400_000,
  );
  // floor ולא trunc: גם תאריך שלפני העוגן נופל בתקופה הנכונה
  const index = Math.floor(days / 7 / PERIOD_LENGTH);

  const period = (n: number) =>
    Array.from({ length: PERIOD_LENGTH }, (_, i) =>
      zonedTime(
        PERIOD_ANCHOR.year,
        PERIOD_ANCHOR.month,
        PERIOD_ANCHOR.day + 7 * (n * PERIOD_LENGTH + i),
      ),
    );
  return { current: period(index), next: period(index + 1) };
}

/**
 * שעת ההגעה של מיקום בתפקיד.
 *
 * עד גודל התבנית — השעה של המשבצת עצמה. מעבר לה (מלצר שמיני, כשהתבנית
 * מחזיקה שבעה) — רבע שעה אחרי האחרון לכל מקום נוסף, כמו הקפיצות של רבע
 * שעה בין המלצרים (החלטה של רואי). כך גם הבלוק שנוצר בשבוע עצמו.
 */
export function arrivalAt(
  template: { role: string; position: number; startTime: string }[],
  role: string,
  position: number,
): string | null {
  const ofRole = template.filter((t) => t.role === role).sort((a, b) => a.position - b.position);
  const exact = ofRole.find((t) => t.position === position);
  if (exact) return exact.startTime;
  const last = ofRole[ofRole.length - 1];
  if (!last || position < last.position) return null;
  return toHHMM(toMinutes(last.startTime) + 15 * (position - last.position));
}

/** מפתח החודש הקלנדרי של "YYYY-MM-DD" — המכסה נספרת לפיו */
export function monthKey(date: string): string {
  return date.slice(0, 7);
}

/** כמה שישיים בחודש. `null` = בלי הגבלה. */
export const FRIDAY_LIMITS = {
  none: 0,
  one: 1,
  two: 2,
  unlimited: null,
} as const;

export type FridayLimit = keyof typeof FRIDAY_LIMITS;

export const FRIDAY_LIMIT_LABEL: Record<FridayLimit, string> = {
  none: "פטור לגמרי",
  one: "פעם בחודש",
  two: "פעמיים בחודש",
  unlimited: "אין הגבלה",
};

export function isFridayLimit(value: string): value is FridayLimit {
  return value in FRIDAY_LIMITS;
}

export function monthlyCap(limit: string): number | null {
  return isFridayLimit(limit) ? FRIDAY_LIMITS[limit] : null;
}

/**
 * שישיים שקרו **מחוץ לאתר**, ונספרים בכל זאת בהיסטוריה של הסבב.
 *
 * ההיסטוריה ("מי עבד הכי מעט שישיים") נלקחת משיבוצים אמיתיים, אבל
 * שישיים שנוהלו בגיליון לפני שהשבוע שלהם נפתח באתר — 2/10 ו-9/10 —
 * אין להם שיבוץ, ובלי זה מי שעבד בהם היה חוזר לראש התור כאילו לא עבד.
 *
 * נספרת שורת סבב רק כשכל אלה נכונים:
 * - **ידנית** — מהגיליון או מתיקון של המנהל. שורה אוטומטית היא הצעה
 *   שאיש לא אימת, ולא עדות למה שקרה.
 * - **בתאריך שכבר עבר** — שישי עתידי עוד לא נעבד.
 * - **אין שבוע באתר שמכסה אותה** — אם יש, השיבוצים שלו הם האמת, ושורת
 *   הסבב הייתה נספרת פעמיים.
 */
export function offSiteFridayCounts(args: {
  rows: { date: Date; employeeId: string; isClosing: boolean; source: string }[];
  /** תחילות השבועות שקיימים באתר (שלא נמחקו) */
  weekStarts: Date[];
  /** חצות של היום בשעון ישראל — מה שלפניו כבר עבר */
  today: Date;
}): { worked: Map<string, number>; closed: Map<string, number> } {
  const WEEK = 7 * 24 * 60 * 60 * 1000;
  const covered = (date: Date) =>
    args.weekStarts.some(
      (start) => date.getTime() >= start.getTime() && date.getTime() < start.getTime() + WEEK,
    );

  const worked = new Map<string, number>();
  const closed = new Map<string, number>();
  for (const row of args.rows) {
    if (row.source !== "manual") continue;
    if (row.date.getTime() >= args.today.getTime()) continue;
    if (covered(row.date)) continue;
    worked.set(row.employeeId, (worked.get(row.employeeId) ?? 0) + 1);
    if (row.isClosing) closed.set(row.employeeId, (closed.get(row.employeeId) ?? 0) + 1);
  }
  return { worked, closed };
}

/**
 * שישיים שכבר מתוכננים לפני התקופה שבונים — נספרים בהוגנות שלה.
 *
 * כשבונים את "החודשיים הבאים", שמונת השישיים של התקופה הנוכחית עוד לא
 * נעבדו, ולכן אינם בהיסטוריה. בלי הספירה הזו מי שמשובץ הרבה בנוכחית היה
 * מקבל עוד ועוד גם בבאה.
 *
 * כל שורה נספרת (גם אוטומטית — היא התוכנית), אבל רק אם אין שבוע באתר
 * שמכסה אותה: שבוע פתוח כבר נספר דרך השיבוצים שלו, ושורה שלו הייתה
 * נספרת פעמיים.
 */
export function plannedAheadCounts(args: {
  rows: { date: Date; employeeId: string; isClosing: boolean }[];
  weekStarts: Date[];
  /** חצות של היום — מה שלפניו כבר בהיסטוריה */
  today: Date;
  /** השישי הראשון של התקופה שבונים — ממנו והלאה זו התקופה עצמה */
  before: Date;
}): { worked: Map<string, number>; closed: Map<string, number> } {
  const WEEK = 7 * 24 * 60 * 60 * 1000;
  const covered = (date: Date) =>
    args.weekStarts.some(
      (start) => date.getTime() >= start.getTime() && date.getTime() < start.getTime() + WEEK,
    );

  const worked = new Map<string, number>();
  const closed = new Map<string, number>();
  for (const row of args.rows) {
    const t = row.date.getTime();
    if (t < args.today.getTime() || t >= args.before.getTime()) continue;
    if (covered(row.date)) continue;
    worked.set(row.employeeId, (worked.get(row.employeeId) ?? 0) + 1);
    if (row.isClosing) closed.set(row.employeeId, (closed.get(row.employeeId) ?? 0) + 1);
  }
  return { worked, closed };
}

export type RotationPerson = {
  id: string;
  fullName: string;
  /** CSV מהפרופיל — כבר מפורק לרשימה על ידי הקורא */
  roles: string[];
  fridayLimit: string;
  /**
   * כמה שישיים העובד **סגר** בפועל, בנפרד מכמה עבד.
   *
   * סגירה בשישי היא סבב בתוך סבב: מי שעבד הרבה שישיים לא בהכרח סגר, ומי
   * שסגר נושא נטל אחר. מונה משותף היה מרכז את הסגירות אצל מי שממילא
   * עובד מעט — כלומר בדיוק ההפך מהוגן.
   */
  closed: number;
  /**
   * כמה שישיים העובד עבד בפועל עד כה.
   *
   * זה מה שמייצר את ההגינות, ולכן הוא נספר מההיסטוריה ולא ממונה שאנחנו
   * מתחזקים: מי שהחליף משמרת או שמישהו לקח ממנו חוזר מעצמו לראש התור
   * בחודש הבא, בלי שאף אחד יזכור לעדכן.
   */
  worked: number;
};

export type RotationSlot = {
  /** מפתח התאריך, "YYYY-MM-DD" — מגיע מ-toDateInputValue */
  date: string;
  role: string;
  /** משבצת "עד סגירה" — נגזר מהתבנית, ולא מוגדר כאן */
  isClosing: boolean;
  /**
   * מקומה של המשבצת בסדר ההגעה של אותו תפקיד, החל מ-1.
   *
   * נגזר מ-`sortOrder` בתבנית ולכן שווה ערך לשעת ההתחלה. זה מה שמאפשר
   * לסבב שנבנה כאן ולסבב שמיובא מהגיליון לצאת באותה צורה בדיוק.
   */
  position: number;
};

export type RotationEntry = {
  date: string;
  role: string;
  isClosing: boolean;
  position: number;
  employeeId: string;
};

export type RotationResult = {
  entries: RotationEntry[];
  /** משבצות שלא היה למי לתת — המנהל צריך לדעת, לא לגלות בשישי בבוקר */
  unfilled: RotationSlot[];
};

/**
 * בונה את הסבב לחודש.
 *
 * `slots` הוא כל משבצות השישי של החודש, אחת לכל מקום שצריך לאייש.
 * `locked` הן שיבוצים שהמנהל קבע ידנית — הם נלקחים כנתון ולא נדרסים.
 *
 * הבחירה: מי שעבד הכי מעט שישיים קודם. שוויון נשבר לפי `random` כשהוא
 * מועבר — כך כל לחיצה על "סידור אוטומטי" נותנת סידור אחר, הוגן באותה
 * מידה — ובלעדיו לפי שם, כדי שהתוצאה תהיה יציבה ולא תלויה בסדר שבו
 * המסד החזיר את השורות.
 */
export function planFridays(args: {
  slots: RotationSlot[];
  people: RotationPerson[];
  locked?: RotationEntry[];
  /** מספר אקראי ב-[0,1), למשל Math.random. בלעדיו — שוויון נשבר לפי שם */
  random?: () => number;
}): RotationResult {
  const locked = args.locked ?? [];
  const byId = new Map(args.people.map((p) => [p.id, p]));
  // מפתח אקראי אחד לכל אדם להרצה הזו — שובר שוויון באופן עקבי לאורכה
  const jitter = args.random
    ? new Map(args.people.map((p) => [p.id, args.random!()]))
    : null;

  /*
   * שני מונים, ולא אחד.
   *
   * `assignedInRun` הוא כמה כבר שובץ באופק הזה, והוא זה שמייצר את
   * הפיזור. `assignedInMonth` נספר לפי **חודש קלנדרי**, כי `fridayLimit`
   * הוא מכסה חודשית: "פעם בחודש" על אופק של שמונה שישיים חוצה־חודשיים
   * היה הופך ל"פעם בחודשיים", כלומר פטור כפול ממה שנקבע.
   */
  const assignedInRun = new Map<string, number>();
  const assignedInMonth = new Map<string, number>();
  // וכמה מתוכם סגירות, כדי שגם הן יתחלקו ולא רק השישיים
  const closedThisMonth = new Map<string, number>();

  const monthCounterKey = (date: string, employeeId: string) =>
    `${monthKey(date)}|${employeeId}`;
  // מי כבר תפוס בתאריך מסוים, כדי שלא ישובץ פעמיים באותו שישי
  const takenOnDate = new Map<string, Set<string>>();

  const take = (date: string, employeeId: string, isClosing: boolean) => {
    assignedInRun.set(employeeId, (assignedInRun.get(employeeId) ?? 0) + 1);
    const mk = monthCounterKey(date, employeeId);
    assignedInMonth.set(mk, (assignedInMonth.get(mk) ?? 0) + 1);
    if (isClosing) {
      closedThisMonth.set(employeeId, (closedThisMonth.get(employeeId) ?? 0) + 1);
    }
    if (!takenOnDate.has(date)) takenOnDate.set(date, new Set());
    takenOnDate.get(date)!.add(employeeId);
  };

  const entries: RotationEntry[] = [];
  for (const entry of locked) {
    if (!byId.has(entry.employeeId)) continue;
    entries.push(entry);
    take(entry.date, entry.employeeId, entry.isClosing);
  }

  /*
   * המשבצות שנותרו אחרי הידניות. ההשוואה היא לפי תאריך+תפקיד, ולכן שתי
   * משבצות זהות באותו יום מקזזות שתי שורות ידניות — וזה נכון: הן באמת
   * שני מקומות זהים.
   */
  const remaining: RotationSlot[] = [];
  const lockedCount = new Map<string, number>();
  for (const e of locked) {
    const key = `${e.date}|${e.role}|${e.position}`;
    lockedCount.set(key, (lockedCount.get(key) ?? 0) + 1);
  }
  for (const slot of args.slots) {
    const key = `${slot.date}|${slot.role}|${slot.position}`;
    const left = lockedCount.get(key) ?? 0;
    if (left > 0) {
      lockedCount.set(key, left - 1);
      continue;
    }
    remaining.push(slot);
  }

  const unfilled: RotationSlot[] = [];

  /*
   * סדר יציב, ו**משבצות הסגירה קודם**.
   *
   * הסדר אינו קוסמטי: מי שיסגור נבחר לפי מונה **הסגירות**, ומי שיעבוד
   * רגיל לפי מונה השישיים. אם הרגילות תתמלאנה ראשונות הן תבלענה אנשים
   * לפי המונה הלא נכון, והסגירה תקבל את מי שנשאר.
   */
  const ordered = [...remaining].sort(
    (a, b) =>
      a.date.localeCompare(b.date) ||
      Number(b.isClosing) - Number(a.isClosing) ||
      a.role.localeCompare(b.role),
  );

  for (const slot of ordered) {
    const taken = takenOnDate.get(slot.date) ?? new Set<string>();

    const candidates = args.people.filter((p) => {
      if (!p.roles.includes(slot.role)) return false;
      if (taken.has(p.id)) return false;
      const cap = monthlyCap(p.fridayLimit);
      if (cap === null) return true;
      return (assignedInMonth.get(monthCounterKey(slot.date, p.id)) ?? 0) < cap;
    });

    if (candidates.length === 0) {
      unfilled.push(slot);
      continue;
    }

    /*
     * ההגינות נמדדת במונה שמתאים למשבצת: משבצת סגירה נשפטת לפי כמה
     * העובד **סגר**, ומשבצת רגילה לפי כמה שישיים עבד. שני מונים ולא אחד,
     * אחרת הסגירות היו מתרכזות אצל מי שממילא עובד מעט.
     *
     * לכל אחד מהם מתווסף מה שכבר שובץ החודש: בלי זה אותו אדם היה מקבל את
     * כל שישיי החודש ברצף, כי ההיסטוריה מתעדכנת רק אחרי שהחודש נגמר.
     * זה גם מה שמחליף את הזוג שסוגר משישי לשישי, בלי כלל נפרד.
     */
    const rank = (p: RotationPerson) =>
      slot.isClosing
        ? p.closed + (closedThisMonth.get(p.id) ?? 0)
        : p.worked + (assignedInRun.get(p.id) ?? 0);

    const best = candidates.reduce((a, b) => {
      if (rank(a) !== rank(b)) return rank(a) < rank(b) ? a : b;
      if (jitter) return jitter.get(a.id)! <= jitter.get(b.id)! ? a : b;
      return a.fullName.localeCompare(b.fullName, "he") <= 0 ? a : b;
    });

    entries.push({
      date: slot.date,
      role: slot.role,
      isClosing: slot.isClosing,
      position: slot.position,
      employeeId: best.id,
    });
    take(slot.date, best.id, slot.isClosing);
  }

  return { entries, unfilled };
}

// ---------------------------------------------------------------------------
// התאמת הסבב למשבצות השבוע
// ---------------------------------------------------------------------------

export type SeedSlot = {
  id: string;
  role: string;
  /** נגזר מהתבנית (`endTime === CLOSING`), לא מוגדר כאן */
  isClosing: boolean;
};

export type SeedEntry = {
  role: string;
  isClosing: boolean;
  /** null = שורה שנוצרה לפני שהמיקום קיים */
  position: number | null;
};

/**
 * ממפה את שיבוצי הסבב למשבצות השבוע.
 *
 * **מיקום i נכנס למשבצת ה-i של אותו תפקיד**, כשהמשבצות מגיעות ממוינות
 * ב-`sortOrder` — כלומר לפי שעת ההתחלה. זו הקונבנציה שהסידור עובד לפיה:
 * הסדר שבו העובדים רשומים הוא סדר ההגעה שלהם. משבצות הסגירה הן
 * האחרונות בתבנית, ולכן "השניים האחרונים סוגרים" יוצא מכאן מעצמו, בלי
 * כלל נפרד ובלי להסתמך על `isClosing` כמפתח.
 *
 * שני מעברים ולא אחד: קודם מי שיש לו מיקום, ורק אחריו מי שאין. מעבר
 * יחיד היה נותן לשורה חסרת מיקום לתפוס משבצת ששייכת למישהו מפורש.
 *
 * `slots` **חייב** להגיע ממוין ב-sortOrder — זו ההנחה היחידה כאן.
 */
export function matchRotationToSlots<E extends SeedEntry>(
  entries: E[],
  slots: SeedSlot[],
): { pairs: { entry: E; slotId: string }[]; unmatched: E[] } {
  const byRole = new Map<string, SeedSlot[]>();
  for (const s of slots) {
    if (!byRole.has(s.role)) byRole.set(s.role, []);
    byRole.get(s.role)!.push(s);
  }

  const pairs: { entry: E; slotId: string }[] = [];
  const unmatched: E[] = [];
  const claimed = new Set<string>();

  const positioned = entries.filter((e) => e.position != null);
  const legacy = entries.filter((e) => e.position == null);

  for (const entry of [...positioned, ...legacy]) {
    const ordered = byRole.get(entry.role) ?? [];
    const slot =
      entry.position != null
        ? ordered[entry.position - 1]
        : ordered.find((s) => !claimed.has(s.id) && s.isClosing === entry.isClosing);

    if (!slot || claimed.has(slot.id)) {
      unmatched.push(entry);
      continue;
    }
    claimed.add(slot.id);
    pairs.push({ entry, slotId: slot.id });
  }

  return { pairs, unmatched };
}
