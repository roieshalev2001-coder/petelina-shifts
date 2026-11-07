import { toHHMM } from "./time";

/**
 * רצפת האיוש — האילוץ שמונע יום שבו כולם ביקשו לרדת מוקדם והרצפה מתרוקנת.
 *
 * ברגע שמותר לרדת מוקדם, אף שיבוץ בודד לא נראה בעייתי, אבל הצירוף שלהם כן.
 * לכן הבדיקה היא על כל מלצרי היום ביחד ולא על משבצת בודדת.
 *
 * הרצפה נגזרת מהתבנית ולא מוגדרת כמספר קשיח:
 *     רצפה(t) = min(כמה מלצרים התבנית מתכננת ב-t, MIN_ON_FLOOR)
 *
 * ה-min הוא מה שגורם לזה לעבוד בלי מקרי קצה: ב-07:15 התבנית מתכננת מלצר אחד,
 * אז הרצפה היא 1 ולא 4; ב-22:15 נשארים שניים, אז הרצפה היא 2.
 */

/** כמה מלצרים חייבים להיות ברצפה בשעות העומס */
export const MIN_ON_FLOOR = 4;

export type CoverageInterval = { start: number; end: number };

export type FloorSegment = {
  start: number;
  end: number;
  /** כמה מלצרים התבנית מתכננת בקטע הזה */
  planned: number;
  /** כמה חייבים להיות בפועל */
  required: number;
};

export type CoverageGap = {
  start: number;
  end: number;
  required: number;
  actual: number;
};

/** נקודות הזמן שבהן מספר האנשים ברצפה יכול להשתנות */
function breakpoints(intervals: CoverageInterval[]): number[] {
  const points = new Set<number>();
  for (const i of intervals) {
    points.add(i.start);
    points.add(i.end);
  }
  return [...points].sort((a, b) => a - b);
}

function countAt(intervals: CoverageInterval[], from: number, to: number): number {
  return intervals.filter((i) => i.start <= from && i.end >= to).length;
}

/**
 * עקומת הרצפה הנדרשת, לפי מה שהתבנית מתכננת ומוגבלת ב-cap.
 * מוחזרת כקטעים רציפים, לא כדקות בודדות.
 */
export function requiredFloor(
  plannedSlots: CoverageInterval[],
  cap: number = MIN_ON_FLOOR,
): FloorSegment[] {
  const points = breakpoints(plannedSlots);
  const segments: FloorSegment[] = [];

  for (let i = 0; i < points.length - 1; i++) {
    const start = points[i];
    const end = points[i + 1];
    const planned = countAt(plannedSlots, start, end);
    if (planned === 0) continue;

    const required = Math.min(planned, cap);
    const previous = segments.at(-1);

    // איחוד קטעים סמוכים בעלי אותה דרישה, כדי שהדוח יהיה קריא
    if (previous && previous.end === start && previous.required === required) {
      previous.end = end;
      previous.planned = Math.min(previous.planned, planned);
    } else {
      segments.push({ start, end, planned, required });
    }
  }

  return segments;
}

/**
 * איפה האיוש בפועל יורד מתחת לרצפה.
 *
 * `planned` הן משבצות התבנית (מה שאמור להיות), ו-`actual` הן השעות בפועל
 * של השיבוצים — שעשויות להיות קצרות יותר בגלל אילוצי העובדים.
 */
export function coverageDeficit(
  plannedSlots: CoverageInterval[],
  actualShifts: CoverageInterval[],
  cap: number = MIN_ON_FLOOR,
): CoverageGap[] {
  const floor = requiredFloor(plannedSlots, cap);
  const points = breakpoints([...plannedSlots, ...actualShifts]);
  const gaps: CoverageGap[] = [];

  for (let i = 0; i < points.length - 1; i++) {
    const start = points[i];
    const end = points[i + 1];

    const segment = floor.find((f) => f.start <= start && f.end >= end);
    if (!segment) continue;

    const actual = countAt(actualShifts, start, end);
    if (actual >= segment.required) continue;

    const previous = gaps.at(-1);
    if (
      previous &&
      previous.end === start &&
      previous.required === segment.required &&
      previous.actual === actual
    ) {
      previous.end = end;
    } else {
      gaps.push({ start, end, required: segment.required, actual });
    }
  }

  return gaps;
}

/** סך הדקות שחסר בהן איש, משוקלל במספר האנשים החסרים */
export function deficitMinutes(gaps: CoverageGap[]): number {
  return gaps.reduce((sum, g) => sum + (g.end - g.start) * (g.required - g.actual), 0);
}

export function describeGap(gap: CoverageGap): string {
  return `בין ${toHHMM(gap.start)} ל-${toHHMM(gap.end)} יהיו ${gap.actual} מלצרים במקום ${gap.required}`;
}
