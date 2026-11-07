import type { Role } from "./domain";

/**
 * מודל השורות של תצוגת הסידור, בפריסה של הגיליון המקורי:
 * עמודה לכל יום, שורה לכל משבצת, ותווית זמן בעמודה הימנית.
 *
 * האתגר: לימים יש מבנים שונים. ליום רגיל 16 משבצות עם חלוקת בוקר/ערב,
 * ולשישי משמרת אחת רצופה. שיוך נאיבי לפי sortOrder היה מציב אחמ"ש של
 * שישי בשורת ברמן.
 *
 * הפתרון: השורות נגזרות מהיום ה"מייצג" (זה עם הכי הרבה משבצות), וכל יום
 * אחר משבץ את המשבצות שלו לשורות לפי התפקיד — משבצת מלצר תיפול תמיד
 * בשורת מלצר. כך הצבעים והמשמעות נשמרים, ושישי נקרא כרשימה משלו
 * עם שעות העלייה האישיות בתא, בדיוק כמו בגיליון.
 *
 * **יום רציף** (בלי חלוקה לבוקר/ערב — היום זה שישי) נקרא כמו בגיליון:
 * כל האחמ"שים שלו כתובים יחד בתא של אחמ"ש הבוקר ("טל + מיקה"), ושורת
 * אחראי הערב, שאין לה משמעות ביום כזה, ממשיכה את הקבוצה שמעליה — כך
 * המלצרים רצים ברצף ולא נחתכים באמצע בבלוק כתום.
 */

export type GridSlot = {
  id: string;
  dayOfWeek: number;
  role: string;
  period: string;
  startTime: string;
  endTime: string;
  label: string | null;
  sortOrder: number;
  /** נוסף לשבוע הזה ולא מהתבנית — רק כזה אפשר להסיר (ראה WeekSlot.extra) */
  extra?: boolean;
  /** range | start | end — ראה formatHours */
  timeDisplay?: string;
};

/**
 * תא בגיליון: משבצת אחת, או כמה משבצות של אותו תפקיד שנכתבות יחד.
 *
 * התפקיד שייך לתא ולא רק לשורה — ביום רציף מלצר יכול לשבת בשורה של
 * אחמ"ש, והצבע שלו צריך להיות של מלצר.
 */
export type GridCell = {
  role: Role;
  slots: GridSlot[];
};

export type GridRow = {
  key: string;
  role: Role;
  /** תיאור מילולי מהתבנית, למשל "ברמן בוקר" */
  prefix: string | null;
  startTime: string;
  endTime: string;
  isClosing: boolean;
  /** morning | evening | allday — כמו של משבצת התבנית שממנה נגזרה השורה */
  period: string;
  /** האם השורה פותחת קבוצה חדשה — מקבלת קו מפריד */
  isGroupStart: boolean;
  cells: (GridCell | null)[];
};

/** התפקיד שכל המשבצות שלו נכתבות בתא אחד ביום רציף */
const STACKED_ROLE: Role = "manager";

/**
 * יום בלי חלוקה לבוקר/ערב — משמרת אחת רצופה.
 *
 * נגזר מהנתונים ולא ממספר היום: אם התבנית של יום אחר תהפוך לרציפה, הוא
 * ייקרא באותה דרך בלי שינוי כאן.
 */
export function isContinuousDay(daySlots: GridSlot[]): boolean {
  return daySlots.length > 0 && daySlots.every((s) => s.period === "allday");
}

/**
 * האם מציגים בתא את שעת ההגעה של המשבצת.
 *
 * ביום רציף (שישי) — רק למלצרים, שכל אחד מהם מגיע בשעה אחרת. לאחמ"שים
 * ולברמנים השעות קבועות וידועות, ושעה ליד השם רק מעמיסה על התא — שני
 * האחמ"שים כתובים יחד בלי "14:00", והברמן השני בלי "13:30" (החלטה של רואי).
 */
export function showsStartTime(slot: Pick<GridSlot, "period" | "role">): boolean {
  return slot.period !== "allday" || slot.role === "waiter";
}

export function buildGrid(slots: GridSlot[], days: number[]): GridRow[] {
  const byDay = new Map<number, GridSlot[]>();
  for (const day of days) byDay.set(day, []);
  for (const s of slots) byDay.get(s.dayOfWeek)?.push(s);
  for (const list of byDay.values()) list.sort((a, b) => a.sortOrder - b.sortOrder);

  // היום המייצג קובע את שלד השורות
  let representative = days[0];
  let most = -1;
  for (const day of days) {
    const n = byDay.get(day)?.length ?? 0;
    if (n > most) {
      most = n;
      representative = day;
    }
  }

  const template = byDay.get(representative) ?? [];
  if (template.length === 0) return [];

  const rows: GridRow[] = template.map((t, i) => ({
    key: `r${i}`,
    role: t.role as Role,
    prefix: t.label,
    startTime: t.startTime,
    endTime: t.endTime,
    isClosing: t.endTime === "CLOSING",
    period: t.period,
    isGroupStart:
      i > 0 &&
      (template[i - 1].role !== t.role || template[i - 1].period !== t.period),
    cells: days.map(() => null),
  }));

  // כל יום משבץ את משבצותיו לשורות מאותו תפקיד, לפי הסדר
  days.forEach((day, dayIndex) => {
    const daySlots = byDay.get(day) ?? [];
    const continuous = isContinuousDay(daySlots);
    /*
     * ביום רגיל משבצת נכנסת לשורה של אותו תפקיד **ואותו חלק של היום**.
     * בלי חלק היום, מלצר בוקר נוסף ("+ בלוק") היה דוחף את כל המלצרים
     * שאחריו שורה אחת למטה — עד לתוך שורות הערב. יום רציף (שישי) עובר
     * לפי תפקיד בלבד, כי אין לו בוקר וערב (ראה למעלה).
     */
    const periodAware = !continuous && !isContinuousDay(template);
    const keyOf = (role: string, period: string) => (periodAware ? `${role}|${period}` : role);
    const queues = new Map<string, GridSlot[]>();
    for (const s of daySlots) {
      const key = keyOf(s.role, s.period);
      if (!queues.has(key)) queues.set(key, []);
      queues.get(key)!.push(s);
    }

    let stackedPlaced = false;
    rows.forEach((row, r) => {
      if (continuous && row.role === STACKED_ROLE) {
        if (!stackedPlaced) {
          // שורת האחמ"ש הראשונה מקבלת את כולם, גם אם יש רק אחד
          const all = queues.get(STACKED_ROLE) ?? [];
          queues.set(STACKED_ROLE, []);
          stackedPlaced = true;
          if (all.length > 0) row.cells[dayIndex] = { role: STACKED_ROLE, slots: all };
          return;
        }
        /*
         * שורת אחמ"ש נוספת שהתפנתה ממשיכה את הקבוצה שמעליה: בשורת אחראי
         * הערב יושב המלצר הבא, ולא חור כתום באמצע המלצרים.
         */
        const above = r > 0 ? (rows[r - 1].cells[dayIndex]?.role ?? rows[r - 1].role) : null;
        const queue = above ? queues.get(above) : undefined;
        if (above && queue?.length) {
          row.cells[dayIndex] = { role: above, slots: [queue.shift()!] };
        }
        return;
      }

      const queue = queues.get(keyOf(row.role, row.period));
      if (queue?.length) row.cells[dayIndex] = { role: row.role, slots: [queue.shift()!] };
    });

    // משבצות עודפות (ליום יש יותר מהתבנית) מקבלות שורות נוספות בסוף הקבוצה
    for (const leftover of queues.values()) {
      if (leftover.length === 0) continue;
      const role = leftover[0].role;
      // ביום רציף האחמ"שים העודפים נכתבים יחד, כמו בשורת הבוקר
      const groups =
        continuous && role === STACKED_ROLE ? [leftover] : leftover.map((s) => [s]);
      for (const group of groups) {
        const first = group[0];
        // בסוף הקבוצה שלה — אותו תפקיד ואותו חלק של היום. מלצר בוקר
        // נוסף ("+ בלוק") יושב עם מלצרי הבוקר, לא אחרי מלצרי הערב
        const samePeriod = rows.findLastIndex((r) => r.role === role && r.period === first.period);
        const lastOfRole =
          samePeriod !== -1 ? samePeriod : rows.map((r) => r.role).lastIndexOf(role as Role);
        const row: GridRow = {
          key: `x${first.id}`,
          role: role as Role,
          prefix: first.label,
          startTime: first.startTime,
          endTime: first.endTime,
          isClosing: first.endTime === "CLOSING",
          period: first.period,
          isGroupStart: false,
          cells: days.map(() => null),
        };
        row.cells[dayIndex] = { role: role as Role, slots: group };
        rows.splice(lastOfRole + 1, 0, row);
      }
    }
  });

  /*
   * השעות של השורה = השעות שיש לרוב הימים בה, ולא של היום המייצג.
   *
   * בלי זה, "שינוי שעות" לעובד אחד ביום המייצג (בדרך כלל ראשון) היה
   * משנה את עמודת השעות של כל השורה, ושאר הימים — שלא השתנו — היו
   * נראים כאילו הם החריגים. כך השעות החדשות נכתבות רק בתא שהשתנה
   * (רואי). נספרים רק תאים מאותו תפקיד ואותו חלק של היום: מלצר של שישי
   * שיושב בשורת בוקר אינו "מצביע" על שעות הבוקר. בתיקו — של היום המייצג.
   *
   * צורת התצוגה של הבלוק ("רק הגעה") לא נספרת: השורה תמיד כתובה כטווח
   * (רואי), ובלוק עם תצוגה אחרת כותב את שלו בתוך התא.
   */
  for (const row of rows) {
    type Vote = { n: number; start: string; end: string };
    const votes = new Map<string, Vote>();
    for (const cell of row.cells) {
      if (!cell || cell.role !== row.role) continue;
      for (const slot of cell.slots) {
        if (slot.period !== row.period) continue;
        const key = `${slot.startTime}|${slot.endTime}`;
        const v = votes.get(key) ?? { n: 0, start: slot.startTime, end: slot.endTime };
        v.n++;
        votes.set(key, v);
      }
    }
    const own = votes.get(`${row.startTime}|${row.endTime}`)?.n ?? 0;
    let best: Vote | null = null;
    for (const v of votes.values()) if (!best || v.n > best.n) best = v;
    if (best && best.n > own) {
      row.startTime = best.start;
      row.endTime = best.end;
      row.isClosing = best.end === "CLOSING";
    }
  }

  /*
   * שורה שאף יום לא משתמש בה. קורה רק כשהיום המייצג עצמו רציף: שורת
   * האחמ"ש השנייה שלו התרוקנה לתוך הראשונה, ושורה ריקה לכל הרוחב היא
   * רעש ולא מידע.
   */
  return rows.filter((row) => row.cells.some(Boolean));
}

/** כל המשבצות של יום אחד, בסדר התצוגה — לרשימת הטלפון */
export function daySlotsInOrder(
  rows: GridRow[],
  dayIndex: number,
): { row: GridRow; cell: GridCell; slot: GridSlot }[] {
  return rows.flatMap((row) => {
    const cell = row.cells[dayIndex];
    return cell ? cell.slots.map((slot) => ({ row, cell, slot })) : [];
  });
}
