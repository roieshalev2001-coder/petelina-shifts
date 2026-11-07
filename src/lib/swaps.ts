import { parseRoles, type Role } from "./domain";
import { resolveEnd, toMinutes, zonedAtMinutes } from "./time";

/**
 * מסירת משמרת — הכללים הטהורים.
 *
 * הקובץ הזה לא נוגע ב-Prisma בכוונה: אותן פונקציות בדיוק מסננות את הרשימה
 * שהעובד רואה על המסך *וגם* רצות שוב בתוך הטרנזקציה שמבצעת את התפיסה
 * (src/lib/swap-board.ts). כך תצוגה וכתיבה לא יכולות להתפצל — אין שני
 * מימושים שאפשר לשכוח לעדכן אחד מהם.
 */

/** כמה שעות לפני תחילת המשמרת נסגר החלון — גם למסירה וגם לתפיסה. */
export const SWAP_CUTOFF_HOURS = 24;

/** משבצת כפי שהיא נראית ללוח המסירות — השעות כבר פתורות. */
export type SwapSlotView = {
  slotId: string;
  role: Role;
  dayOfWeek: number;
  date: Date;
  startTime: string;
  /** אחרי פתירת "עד סגירה" */
  endTime: string;
};

/**
 * מתי המשמרת מתחילה בפועל.
 *
 * נבנה על היום הקלנדרי **בישראל**, בלי תלות בשעון התהליך. כשזה היה
 * setHours, שרת שרץ ב-UTC היה מזיז את חתך 24 השעות בשלוש שעות — כלומר
 * מסירת משמרת נחסמה מוקדם או מאוחר מדי מהמכוון.
 */
export function shiftStartsAt(slot: { date: Date; startTime: string }): Date {
  return zonedAtMinutes(slot.date, toMinutes(slot.startTime));
}

/** כמה דקות נותרו עד תחילת המשמרת. שלילי = כבר התחילה. */
export function minutesUntilShift(
  slot: { date: Date; startTime: string },
  now: Date,
): number {
  return Math.floor((shiftStartsAt(slot).getTime() - now.getTime()) / 60_000);
}

/** האם עדיין בתוך החלון. בדיוק 24 שעות לפני — עדיין מותר. */
export function isBeforeCutoff(
  slot: { date: Date; startTime: string },
  now: Date,
  cutoffHours: number = SWAP_CUTOFF_HOURS,
): boolean {
  return minutesUntilShift(slot, now) >= cutoffHours * 60;
}

/**
 * השעות שמי שיתפוס יקבל — תמיד המשבצת המלאה.
 *
 * הקיצור של המוסר נגזר מחלון הזמינות ש*הוא* הצהיר עליו, ולכן אין שום טעם
 * להוריש אותו למישהו אחר. מסירה של המשמרת המלאה גם רק משפרת את רצפת האיוש.
 */
export function offeredHours(
  slot: { startTime: string; endTime: string },
  closingTime: string,
): { start: string; end: string } {
  return { start: slot.startTime, end: resolveEnd(slot.endTime, closingTime) };
}

// ---------------------------------------------------------------------------
// מי רשאי למסור, ומי רשאי לתפוס
// ---------------------------------------------------------------------------

export type OfferBlock =
  | "week-not-published"
  | "not-your-shift"
  | "past-cutoff"
  | "already-offered";

export type ClaimBlock =
  | "own-offer"
  | "not-open"
  | "pending-approval"
  | "past-cutoff"
  | "wrong-role"
  | "busy-same-day";

/*
 * מחזור החיים של הצעה.
 *
 *   open ──תפיסה──▶ pending ──אישור המנהל──▶ claimed
 *     ▲                 │
 *     └────דחייה────────┘
 *
 *   open ──ביטול המוסר──▶ cancelled
 *
 * המשמרת עוברת בפועל **רק** במעבר ל-claimed. עד אז היא רשומה על מי
 * שהציע אותה, והסידור אינו משתנה — כדי שדחייה לא תדרוש להחזיר שיבוץ
 * אחורה, וכדי שמה שמוצג בסידור יהיה תמיד מי שבאמת אמור להגיע.
 *
 * `openSlotId` נשאר לא-null גם ב-pending. האינדקס הייחודי עליו הוא מה
 * שסוגר את המשבצת בפני תופס שני — במסד, לא בקוד.
 */
export const SWAP_STATUSES = ["open", "pending", "claimed", "cancelled"] as const;
export type SwapStatus = (typeof SWAP_STATUSES)[number];

/** למה המנהל אינו יכול להכריע בהצעה הזו */
export type DecisionBlock = "not-pending";

export const DECISION_BLOCK_LABEL: Record<DecisionBlock, string> = {
  "not-pending": "אין מה לאשר — ההצעה אינה ממתינה לאישור",
};

export function decisionBlock(offer: { status: string }): DecisionBlock | null {
  return offer.status === "pending" ? null : "not-pending";
}

/** למה מי שהציע אינו יכול לבטל */
export type CancelBlock = "not-yours" | "not-open";

export const CANCEL_BLOCK_LABEL: Record<CancelBlock, string> = {
  "not-yours": "ההצעה אינה שלך",
  "not-open": "מישהו כבר לקח את המשמרת וההחלטה אצל המנהל",
};

export function cancelBlock(args: {
  offer: { status: string; offeredById: string };
  employeeId: string;
}): CancelBlock | null {
  if (args.offer.offeredById !== args.employeeId) return "not-yours";
  return args.offer.status === "open" ? null : "not-open";
}

export const OFFER_BLOCK_LABEL: Record<OfferBlock, string> = {
  "week-not-published": "השבוע עדיין לא פורסם",
  "not-your-shift": "המשמרת אינה שלך",
  "past-cutoff": `אפשר למסור משמרת רק עד ${SWAP_CUTOFF_HOURS} שעות לפני תחילתה`,
  "already-offered": "המשמרת כבר מוצעת למסירה",
};

export const CLAIM_BLOCK_LABEL: Record<ClaimBlock, string> = {
  "own-offer": "זו המשמרת שאתה מסרת",
  "not-open": "מישהו הקדים אותך — המשמרת כבר נתפסה",
  "pending-approval": "מישהו הקדים אותך, וההחלטה אצל המנהל",
  "past-cutoff": `נותרו פחות מ-${SWAP_CUTOFF_HOURS} שעות למשמרת`,
  "wrong-role": "המשמרת הזו אינה בתפקיד שלך",
  "busy-same-day": "כבר יש לך משמרת ביום הזה",
};

/**
 * האם העובד רשאי למסור את המשמרת. null = מותר.
 * מחזיר סיבה ולא בוליאני, באותה מוסכמה של isFeasible בפותר.
 */
export function offerBlock(args: {
  weekStatus: string;
  slot: { date: Date; startTime: string };
  /** למי המשבצת משובצת כרגע, null אם היא ריקה */
  assignedToId: string | null;
  requesterId: string;
  hasOpenOffer: boolean;
  now: Date;
  cutoffHours?: number;
}): OfferBlock | null {
  if (args.weekStatus !== "published") return "week-not-published";
  if (args.assignedToId !== args.requesterId) return "not-your-shift";
  if (args.hasOpenOffer) return "already-offered";
  if (!isBeforeCutoff(args.slot, args.now, args.cutoffHours)) return "past-cutoff";
  return null;
}

/**
 * האם העובד רשאי לתפוס את ההצעה. null = מותר.
 *
 * הסינון מקל בכוונה: נבדקים רק תפקיד והתנגשות באותו יום. מכסת המשמרות,
 * הרשאת הסגירה, שמונה שעות המנוחה ואילוצי "לא עובדים יחד" — שכולם נאכפים
 * בבניית הסידור — אינם נאכפים כאן. זו החלטה מפורשת של בית הקפה: עדיף
 * שמישהו יגיע. מסך המנהל מסמן בענבר חילוף שעקף כלל כזה.
 *
 * סדר הבדיקות הוא חלק מהחוזה ולא פרט מימוש — הוא קובע איזו הודעה העובד
 * רואה כששתי סיבות מתקיימות יחד, ולכן הוא מכוסה בבדיקות.
 */
export function claimBlock(args: {
  offer: { status: string; offeredById: string };
  slot: { date: Date; startTime: string; role: Role; dayOfWeek: number };
  /** ה-CSV מהפרופיל, נפרס כאן ולא מושווה כמחרוזת */
  claimer: { id: string; roles: string };
  /** ימי השבוע שבהם התופס כבר משובץ באותו שבוע */
  claimerAssignedDays: readonly number[];
  now: Date;
  cutoffHours?: number;
}): ClaimBlock | null {
  if (args.offer.offeredById === args.claimer.id) return "own-offer";
  // pending נבדל מ-claimed בהודעה בלבד: לתופס חשוב לדעת שזה עדיין בהכרעה
  if (args.offer.status === "pending") return "pending-approval";
  if (args.offer.status !== "open") return "not-open";
  if (!isBeforeCutoff(args.slot, args.now, args.cutoffHours)) return "past-cutoff";
  if (!parseRoles(args.claimer.roles).includes(args.slot.role)) return "wrong-role";
  if (args.claimerAssignedDays.includes(args.slot.dayOfWeek)) return "busy-same-day";
  return null;
}
