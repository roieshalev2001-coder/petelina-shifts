import { createHash, randomBytes } from "node:crypto";

/**
 * החלקים הטהורים של קישור הכניסה — בלי מסד, כדי שייבדקו כמו כל השאר.
 * ראה src/lib/invite.ts.
 */

/** כמה ימים הקישור תקף */
export const INVITE_DAYS = 7;

export function hashInviteToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** מפתח חדש, הגיבוב שלו, ומתי הוא פג */
export function newInvite(now: Date = new Date()): { token: string; hash: string; expiresAt: Date } {
  const token = randomBytes(24).toString("base64url");
  return {
    token,
    hash: hashInviteToken(token),
    expiresAt: new Date(now.getTime() + INVITE_DAYS * 86_400_000),
  };
}

/** עד מתי הקישור פתוח, או null כשאין קישור או שפג */
export function openInviteUntil(expiresAt: Date | null, now: Date = new Date()): Date | null {
  return expiresAt && expiresAt > now ? expiresAt : null;
}

/** הודעה אחת לכל מצב: לא קיים, פג, כבר נוצל — אין סיבה לספר איזה מהם */
export const INVITE_INVALID = "הקישור לא תקף: פג תוקפו או שכבר השתמשו בו. בקש מהמנהל קישור חדש.";
