import { prisma } from "./db";
import { INVITE_INVALID, hashInviteToken } from "./invite-token";
import { afterSuccess } from "./lockout";
import { hashPasscode, weakPasscodeError } from "./passcode";
import { normalizePhone } from "./phone";

/**
 * קישור כניסה אישי: המנהל יוצר אותו בטבלת העובדים ושולח בוואטסאפ, והעובד
 * פותח, בוחר קוד בן 6 ספרות בעצמו ונכנס. מחליף את "המנהל ממציא קוד זמני
 * ושולח אותו", ופותר גם עובד בלי טלפון במערכת — הוא מקליד אותו בעצמו.
 *
 * המפתח אקראי (24 בתים), ובמסד נשמר רק הגיבוב שלו: מי שיקרא את המסד לא
 * יוכל להשתמש בקישור. הוא עובד פעם אחת ותקף 7 ימים. אין צורך בנעילה אחרי
 * ניסיונות כמו בכניסה הרגילה — אי אפשר לנחש מפתח כזה.
 *
 * החלקים הטהורים (יצירת מפתח, גיבוב, תוקף) ב-src/lib/invite-token.ts.
 */

/** העובד שהקישור שייך לו, או null כשהקישור לא תקף */
export async function findInvite(token: string, now: Date = new Date()) {
  const employee = await prisma.employee.findUnique({
    where: { inviteTokenHash: hashInviteToken(token) },
    select: { id: true, fullName: true, phone: true, active: true, inviteExpiresAt: true },
  });
  if (!employee?.active || !employee.inviteExpiresAt || employee.inviteExpiresAt <= now) {
    return null;
  }
  return employee;
}

/**
 * העובד בוחר קוד דרך הקישור. מחזיר את מזהה העובד כדי להכניס אותו מיד.
 *
 * הכתיבה מותנית בכך שהקישור עדיין שלו ועדיין בתוקף, כך ששתי לחיצות או
 * שני מכשירים לא יכולים להשתמש בו פעמיים: השני מוצא את המפתח כבר מחוק.
 */
export async function redeemInvite(args: {
  token: string;
  /** רק כשאין טלפון במערכת — העובד מקליד אותו בעצמו */
  phone?: string;
  passcode: string;
  now?: Date;
}): Promise<{ ok: true; employeeId: string } | { ok: false; error: string }> {
  const now = args.now ?? new Date();
  const weak = weakPasscodeError(args.passcode);
  if (weak) return { ok: false, error: weak };

  const employee = await findInvite(args.token, now);
  if (!employee) return { ok: false, error: INVITE_INVALID };

  let phone = employee.phone;
  if (!phone) {
    phone = normalizePhone(args.phone ?? "");
    if (!phone) return { ok: false, error: "מספר הטלפון לא תקין" };
    const taken = await prisma.employee.findFirst({
      where: { phone, id: { not: employee.id } },
      select: { id: true },
    });
    if (taken) return { ok: false, error: "המספר הזה כבר רשום לעובד אחר. פנה למנהל." };
  }

  try {
    const { count } = await prisma.employee.updateMany({
      where: {
        id: employee.id,
        inviteTokenHash: hashInviteToken(args.token),
        inviteExpiresAt: { gt: now },
      },
      data: {
        phone,
        passcodeHash: hashPasscode(args.passcode),
        mustChangePasscode: false,
        inviteTokenHash: null,
        inviteExpiresAt: null,
        ...afterSuccess(),
      },
    });
    if (count === 0) return { ok: false, error: INVITE_INVALID };
  } catch {
    // התנגשות על הטלפון: מישהו אחר נרשם עם אותו מספר באותו רגע
    return { ok: false, error: "המספר הזה כבר רשום לעובד אחר. פנה למנהל." };
  }
  return { ok: true, employeeId: employee.id };
}
