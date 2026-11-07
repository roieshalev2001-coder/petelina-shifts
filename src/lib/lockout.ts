/**
 * הגבלת קצב על ניסיונות כניסה.
 *
 * **כאן נמצאת ההגנה האמיתית.** קוד בן שש ספרות הוא מיליון אפשרויות — גיבוב
 * לא מונע מיצוי שלהן דרך הטופס, רק האטה מונעת. חמישה ניסיונות לדקות ספורות
 * הופכים מיצוי למאות שנים.
 *
 * המונים יושבים במסד ולא בזיכרון התהליך, כי השרת נכבה כשאין תנועה ומתעורר
 * מחדש — כל התעוררות הייתה מאפסת מונה שיושב בזיכרון, וההגנה הייתה אשליה.
 *
 * הקובץ טהור ואינו נוגע ב-Prisma, כדי שהמדיניות תהיה ניתנת לבדיקה בלי מסד.
 */

/** אחרי כמה כישלונות ננעל */
export const MAX_ATTEMPTS = 5;
/** לכמה זמן */
export const LOCK_MINUTES = 15;
/** אחרי כמה שקט המונה מתאפס מעצמו */
export const DECAY_MINUTES = 15;

const MINUTE = 60_000;

export type AttemptState = {
  failedAttempts: number;
  lastFailedAt: Date | null;
  lockedUntil: Date | null;
};

export type LockStatus =
  | { locked: false; attemptsLeft: number }
  | { locked: true; until: Date; minutesLeft: number };

/** האם החשבון נעול כרגע, וכמה נשאר */
export function lockStatus(state: AttemptState, now: Date = new Date()): LockStatus {
  if (state.lockedUntil && state.lockedUntil.getTime() > now.getTime()) {
    const minutesLeft = Math.ceil(
      (state.lockedUntil.getTime() - now.getTime()) / MINUTE,
    );
    return { locked: true, until: state.lockedUntil, minutesLeft };
  }
  return { locked: false, attemptsLeft: MAX_ATTEMPTS - effectiveAttempts(state, now) };
}

/**
 * כמה כישלונות נספרים כרגע.
 *
 * אחרי DECAY_MINUTES של שקט המונה מתאפס: מי שטעה פעמיים לפני שעה אינו
 * צריך לשאת את זה איתו, אחרת עובד שמתבלבל אחת לכמה שבועות היה נעול בלי סיבה.
 */
function effectiveAttempts(state: AttemptState, now: Date): number {
  if (!state.lastFailedAt) return state.failedAttempts;
  const quietMinutes = (now.getTime() - state.lastFailedAt.getTime()) / MINUTE;
  return quietMinutes >= DECAY_MINUTES ? 0 : state.failedAttempts;
}

/** המצב החדש אחרי ניסיון כושל */
export function afterFailure(state: AttemptState, now: Date = new Date()): AttemptState {
  const attempts = effectiveAttempts(state, now) + 1;
  return {
    failedAttempts: attempts,
    lastFailedAt: now,
    lockedUntil:
      attempts >= MAX_ATTEMPTS ? new Date(now.getTime() + LOCK_MINUTES * MINUTE) : null,
  };
}

/** המצב החדש אחרי כניסה מוצלחת — הכול מתאפס */
export function afterSuccess(): AttemptState {
  return { failedAttempts: 0, lastFailedAt: null, lockedUntil: null };
}

/** ההודעה שהמשתמש רואה. לא חושפת אם הטלפון קיים במערכת. */
export function lockMessage(status: LockStatus): string {
  return status.locked
    ? `יותר מדי ניסיונות. אפשר לנסות שוב בעוד ${status.minutesLeft} דקות, או לבקש מהמנהל קישור כניסה חדש.`
    : "טלפון או קוד שגויים";
}
