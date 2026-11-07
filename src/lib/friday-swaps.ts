/**
 * חילופים על סבב שישי.
 *
 * שני מסלולים:
 *
 * - **מסירה** (`give`) — אני נותן את השישי שלי, ומי שלוקח מקבל אותו.
 *   זהה במהות למסירה של משמרת רגילה.
 * - **החלפה** (`trade`) — אני נותן את השישי שלי ומקבל בתמורה שישי אחר.
 *   זה מה שלא קיים במשמרות רגילות, וזה מה שהופך את הסבב לניתן לחיים:
 *   שישי הוא משמרת חובה, ולכן מי שאינו יכול לא רוצה *לוותר* על מכסה
 *   אלא להזיז אותה.
 *
 * הקובץ טהור: בלי מסד, בלי שעון (הוא מוזרק). כל מה שכאן הוא הכללים,
 * וההכרעה מה קורה בפועל יושבת ב-friday-swap-board.ts.
 *
 * מכונת המצבים היא שיקוף מכוון של src/lib/swaps.ts — אותו חוזה שהמנהל
 * כבר מכיר: **תפיסה אינה מזיזה כלום**, והמנהל מכריע.
 */

export const FRIDAY_SWAP_STATUSES = ["open", "pending", "done", "cancelled"] as const;
export type FridaySwapStatus = (typeof FRIDAY_SWAP_STATUSES)[number];

export const FRIDAY_SWAP_MODES = ["give", "trade"] as const;
export type FridaySwapMode = (typeof FRIDAY_SWAP_MODES)[number];

export const MODE_LABEL: Record<FridaySwapMode, string> = {
  give: "מסירה",
  trade: "החלפה",
};

export type OfferBlock =
  | "not-yours"
  | "already-offered"
  | "week-published"
  | "past";

export const OFFER_BLOCK_LABEL: Record<OfferBlock, string> = {
  "not-yours": "זה לא השישי שלך",
  "already-offered": "כבר הצעת את השישי הזה",
  "week-published": "השבוע כבר פורסם — אפשר למסור מלוח החילופים",
  past: "השישי הזה כבר עבר",
};

export type ClaimBlock =
  | "not-open"
  | "own-offer"
  | "wrong-role"
  | "already-on-that-day"
  | "trade-needs-friday"
  | "trade-same-day"
  | "trade-not-yours";

export const CLAIM_BLOCK_LABEL: Record<ClaimBlock, string> = {
  "not-open": "ההצעה כבר נסגרה",
  "own-offer": "זו ההצעה שלך",
  "wrong-role": "התפקיד אינו מתאים למשבצת",
  "already-on-that-day": "אתה כבר משובץ בשישי הזה",
  "trade-needs-friday": "להחלפה צריך להציע שישי משלך בתמורה",
  "trade-same-day": "שני השישיים הם אותו יום",
  "trade-not-yours": "השישי שהצעת בתמורה אינו שלך",
};

export type PlanRef = {
  id: string;
  /** "YYYY-MM-DD" */
  date: string;
  role: string;
  employeeId: string;
};

/**
 * האם מותר להציע את השישי הזה.
 *
 * `weekPublished` הוא הגבול בין שני המנגנונים: כל עוד השבוע לא פורסם,
 * הסבב הוא המציאות והחילוף רץ עליו. מרגע הפרסום המציאות היא הסידור,
 * ולוח החילופים הרגיל הוא הכלי — שני מסלולים על אותה משמרת היו יכולים
 * להזיז אותה פעמיים.
 */
export function offerBlock(args: {
  plan: PlanRef;
  employeeId: string;
  hasOpenOffer: boolean;
  weekPublished: boolean;
  today: string;
}): OfferBlock | null {
  if (args.plan.employeeId !== args.employeeId) return "not-yours";
  if (args.plan.date < args.today) return "past";
  if (args.weekPublished) return "week-published";
  if (args.hasOpenOffer) return "already-offered";
  return null;
}

/**
 * האם מותר לקחת את ההצעה.
 *
 * `myDates` הן כל השישיים שהמבקש כבר משובץ בהם — זה מה שמונע ממנו
 * להופיע פעמיים באותו יום, אילוץ שגם המסד אוכף אבל שעדיף לומר בעברית
 * לפני שהוא נופל כשגיאה.
 *
 * ב-`trade` יש תנאי נוסף: מה שהוא נותן בתמורה חייב להיות באמת שלו,
 * ולא באותו יום — אחרת ה"החלפה" היא החלפה של שיבוץ בעצמו.
 */
export function claimBlock(args: {
  offer: { status: string; mode: string; offeredById: string };
  offered: PlanRef;
  claimerId: string;
  claimerRoles: readonly string[];
  /** התאריכים שבהם המבקש כבר משובץ */
  myDates: readonly string[];
  /** ב-trade: השיבוץ שהוא נותן בתמורה */
  inReturn?: PlanRef | null;
}): ClaimBlock | null {
  if (args.offer.status !== "open") return "not-open";
  if (args.offer.offeredById === args.claimerId) return "own-offer";
  if (!args.claimerRoles.includes(args.offered.role)) return "wrong-role";
  if (args.myDates.includes(args.offered.date)) return "already-on-that-day";

  if (args.offer.mode === "trade") {
    if (!args.inReturn) return "trade-needs-friday";
    if (args.inReturn.employeeId !== args.claimerId) return "trade-not-yours";
    if (args.inReturn.date === args.offered.date) return "trade-same-day";
  }
  return null;
}

export type DecisionBlock = "not-pending";

export const DECISION_BLOCK_LABEL: Record<DecisionBlock, string> = {
  "not-pending": "ההצעה אינה ממתינה להכרעה",
};

export function decisionBlock(offer: { status: string }): DecisionBlock | null {
  return offer.status === "pending" ? null : "not-pending";
}

export type CancelBlock = "not-yours" | "not-open";

export const CANCEL_BLOCK_LABEL: Record<CancelBlock, string> = {
  "not-yours": "ההצעה אינה שלך",
  "not-open": "אי אפשר לבטל הצעה שכבר נתפסה",
};

export function cancelBlock(args: {
  offer: { status: string; offeredById: string };
  employeeId: string;
}): CancelBlock | null {
  if (args.offer.offeredById !== args.employeeId) return "not-yours";
  if (args.offer.status !== "open") return "not-open";
  return null;
}

/**
 * מה יקרה לשורות הסבב באישור.
 *
 * מוחזר כרשימת שינויים ולא מבוצע כאן — כדי שאפשר יהיה לבדוק את הכלל
 * בלי מסד, ולכתוב את כולם בטרנזקציה אחת.
 *
 * ב-`give` שורה אחת מחליפה בעלים. ב-`trade` שתיהן מחליפות, וזה חייב
 * להיות אטומי: מצב ביניים שבו רק אחת זזה משאיר את אחד השניים משובץ
 * פעמיים ואת השני בכלל לא.
 */
export function applySwap(args: {
  mode: string;
  offered: PlanRef;
  claimerId: string;
  inReturn?: PlanRef | null;
}): { planId: string; employeeId: string }[] {
  const moves = [{ planId: args.offered.id, employeeId: args.claimerId }];
  if (args.mode === "trade" && args.inReturn) {
    moves.push({
      planId: args.inReturn.id,
      employeeId: args.offered.employeeId,
    });
  }
  return moves;
}
