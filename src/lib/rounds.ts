import type { Period, Role } from "./domain";

/**
 * סבב (round) הוא מחזור משמרות שלם ביום — בוקר או ערב.
 *
 * הגבולות נגזרים מהתבנית עצמה ולא מוגדרים כקבועים, כדי שעריכת שעות במסך
 * התבנית תעדכן אותם מאליה. מול הזריעה הנוכחית זה נותן בוקר 07:15–17:00
 * וערב 16:00–23:00 — הם נחפפים בכוונה, כי בין 16:00 ל-17:00 מלצרי שני
 * הסבבים נמצאים ברצפה יחד.
 */

export type Round = {
  period: Period;
  start: number;
  end: number;
};

type SlotLike = {
  role: string;
  period: string;
  start: number;
  end: number;
};

/**
 * גבולות הסבבים של תפקיד מסוים ביום מסוים.
 * ברירת המחדל היא מלצרים, כי רק עליהם חל האיסור לעבור בין סבבים —
 * ברמן צהריים ואחראי ערב מגשרים ביניהם במכוון.
 */
export function deriveRounds(
  slots: SlotLike[],
  role: Role = "waiter",
): Map<Period, Round> {
  const rounds = new Map<Period, Round>();

  for (const slot of slots) {
    if (slot.role !== role) continue;
    const period = slot.period as Period;

    const existing = rounds.get(period);
    if (!existing) {
      rounds.set(period, { period, start: slot.start, end: slot.end });
      continue;
    }
    existing.start = Math.min(existing.start, slot.start);
    existing.end = Math.max(existing.end, slot.end);
  }

  return rounds;
}

/**
 * האם משבצת חוצה את הגבול בין הסבבים — כלומר נמתחת לתוך סבב שאינו שלה.
 * משמש לאזהרה רכה במסך התבנית כשמוסיפים משבצת מלצר חריגה.
 */
export function crossesRounds(slot: SlotLike, rounds: Map<Period, Round>): boolean {
  for (const [period, round] of rounds) {
    if (period === slot.period) continue;
    if (slot.start < round.end && round.start < slot.end) return true;
  }
  return false;
}
