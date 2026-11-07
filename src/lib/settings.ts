import { prisma } from "./db";
import type { Role } from "./domain";

/**
 * הגדרות כזוגות מפתח-ערך.
 *
 * היום יש רק סוג אחד: קישורי קבוצות הוואטסאפ. אי אפשר לגלות קבוצה מהקוד,
 * ולכן המנהל מדביק את הקישור פעם אחת ומכאן והלאה הכפתורים עובדים.
 */

const GROUP_PREFIX = "whatsapp.group.";

/** רק תפקידים שיש להם קבוצה בפועל — לאחמ"שים אין קבוצה נפרדת */
export const GROUP_ROLES = ["waiter", "bartender"] as const;
export type GroupRole = (typeof GROUP_ROLES)[number];

export function isGroupRole(role: string): role is GroupRole {
  return (GROUP_ROLES as readonly string[]).includes(role);
}

/**
 * קישורי הקבוצות, לפי תפקיד.
 *
 * שאילתה אחת לכל הקישורים ולא אחת לכל תפקיד — הם נקראים יחד בכל מקרה.
 */
export async function groupLinks(): Promise<Partial<Record<GroupRole, string>>> {
  const rows = await prisma.setting.findMany({
    where: { key: { startsWith: GROUP_PREFIX } },
  });

  const out: Partial<Record<GroupRole, string>> = {};
  for (const row of rows) {
    const role = row.key.slice(GROUP_PREFIX.length);
    if (isGroupRole(role) && row.value.trim()) out[role] = row.value.trim();
  }
  return out;
}

/**
 * שומר או מוחק קישור קבוצה.
 *
 * ערך ריק מוחק את השורה במקום לשמור מחרוזת ריקה, כדי ש"לא הוגדר" יהיה
 * מצב אחד ולא שניים — הכפתור נעלם בדיוק כשאין קישור.
 */
export async function setGroupLink(role: GroupRole, value: string) {
  const key = `${GROUP_PREFIX}${role}`;
  const trimmed = value.trim();

  if (!trimmed) {
    await prisma.setting.deleteMany({ where: { key } });
    return;
  }
  await prisma.setting.upsert({
    where: { key },
    create: { key, value: trimmed },
    update: { value: trimmed },
  });
}

/**
 * ההודעה על משבצות חסרות בתפקיד אחד.
 *
 * **הודעה אחת לתפקיד ולא אחת למשבצת.** חמש הודעות נפרדות לאותה קבוצה הן
 * ספאם שאיש לא קורא, ומי שכן יקרא לא יבין כמה באמת חסר.
 */
export function gapsMessage(args: {
  roleLabel: string;
  weekLabel: string;
  gaps: { day: string; time: string }[];
}): string {
  const lines = args.gaps.map((g) => `• ${g.day} · ${g.time}`).join("\n");
  return (
    `היי, חסרים ${args.roleLabel} בשבוע ${args.weekLabel}:\n\n${lines}\n\n` +
    `מי שיכול לקחת — שיכתוב לי כאן.`
  );
}

/*
 * איך ההודעה מגיעה לקבוצה:
 *
 * קישור הזמנה לקבוצה (`chat.whatsapp.com/…`) פותח מסך הצטרפות ואינו מקבל
 * טקסט כלל — אין דרך להזריק הודעה לקבוצה מסוימת מקישור.
 *
 * מה שכן עובד: `wa.me/?text=` בלי מספר (whatsappShareUrl) פותח את וואטסאפ
 * עם ההודעה כבר כתובה ומסך בחירה למי לשלוח, וקבוצות מופיעות בו כמו כל
 * צ'אט. זה הכפתור הראשי. הקישור לקבוצה שנשמר כאן משמש רק לדרך השנייה:
 * העתקה ללוח ופתיחת הקבוצה, והמנהל מדביק.
 */

export type { Role };

// ---------------------------------------------------------------------------
// הודעות שהמנהל הסתיר
// ---------------------------------------------------------------------------

/*
 * "בדקתי, להסתיר" — לכל מנהל בנפרד: מה שרואי כבר בדק, מנהל אחר עוד לא
 * ראה. אותה טבלה של הקישורים, עם מפתח לכל הודעה ולכל מנהל, ושורה קיימת =
 * מוסתר. אין מפתח זר לעובד, ולכן מנהל שנמחק משאיר שורה קטנה שאיש לא קורא.
 */
const DISMISSED_PREFIX = "dismissed.";

const dismissedKey = (notice: string, employeeId: string) =>
  `${DISMISSED_PREFIX}${notice}.${employeeId}`;

export async function isDismissed(notice: string, employeeId: string): Promise<boolean> {
  const row = await prisma.setting.findUnique({ where: { key: dismissedKey(notice, employeeId) } });
  return row !== null;
}

export async function setDismissed(notice: string, employeeId: string, dismissed: boolean) {
  const key = dismissedKey(notice, employeeId);
  if (!dismissed) {
    await prisma.setting.deleteMany({ where: { key } });
    return;
  }
  const value = new Date().toISOString();
  await prisma.setting.upsert({ where: { key }, create: { key, value }, update: { value } });
}
