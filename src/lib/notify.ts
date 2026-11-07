import webpush from "web-push";
import { prisma } from "./db";

/**
 * התראות לעובדים.
 *
 * שתי שכבות, ובכוונה:
 *
 * 1. **שורה במסד** — תמיד. זו הרשת שתופסת את כל מי שהדחיפה לא הגיעה אליו,
 *    והיא מה שמופיע בפעמון בכותרת.
 * 2. **דחיפה לנייד** — למי שנרשם. באייפון זה עובד רק אם העובד הוסיף את
 *    האתר למסך הבית, וחלק מהצוות לא יעשה את זה. לכן שכבה 1 אינה גיבוי
 *    אלא העיקר, והדחיפה היא השיפור.
 *
 * הדחיפה **לא** מפילה את הפעולה שקראה לה: מסירת משמרת שנכשלה כי שרת
 * הדחיפה של גוגל לא ענה היא באג גרוע בהרבה מהתראה שלא הגיעה.
 */

export type NotificationKind =
  | "swap-offered"
  | "swap-claimed"
  | "swap-approved"
  | "swap-rejected"
  | "friday-published"
  /** תזכורת יומית למי שטרם הגיש — ראה src/app/api/cron/remind */
  | "submit-reminder"
  /**
   * תזכורת ידנית מהמנהל, מכפתור במסך השבוע.
   *
   * סוג נפרד בכוונה: התזכורת היומית שולחת פעם אחת לעובד לשבוע ומזהה את
   * מי שכבר קיבל לפי הסוג שלה. אילו הידנית נספרה כמוה, תזכורת ביום ראשון
   * הייתה מבטלת את האוטומטית שיוצאת יום לפני המועד.
   */
  | "submit-nudge";

export type NotificationInput = {
  kind: NotificationKind;
  title: string;
  body: string;
  /** לאן לנווט בלחיצה */
  url: string;
};

let configured = false;

/**
 * המפתחות נטענים פעם אחת, ורק כשבאמת שולחים.
 *
 * מחזיר false כשהם חסרים — אז ההתראות בתוך האתר ממשיכות לעבוד והדחיפה
 * פשוט מדלגת. זו הסיבה שזה לא זורק כמו AUTH_SECRET: שם היעדר המפתח פותח
 * דלת, וכאן הוא רק מוריד תוספת.
 */
function ensureConfigured(): boolean {
  if (configured) return true;
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  if (!publicKey || !privateKey) return false;
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT ?? "mailto:noreply@petelina.local",
    publicKey,
    privateKey,
  );
  configured = true;
  return true;
}

/**
 * שולח לכל ההרשמות של העובדים שצוינו.
 *
 * הרשמה שהשרת מחזיר עליה 404 או 410 מתה — הדפדפן נמחק, האפליקציה הוסרה,
 * או ההרשאה נשללה. היא נמחקת, אחרת הן נצברות ומייצרות רעש לנצח.
 */
async function push(employeeIds: string[], input: NotificationInput) {
  if (employeeIds.length === 0 || !ensureConfigured()) return;

  const subs = await prisma.pushSubscription.findMany({
    where: { employeeId: { in: employeeIds } },
  });
  if (subs.length === 0) return;

  const payload = JSON.stringify({
    title: input.title,
    body: input.body,
    url: input.url,
  });

  const dead: string[] = [];
  await Promise.all(
    subs.map(async (sub) => {
      try {
        await webpush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: { p256dh: sub.p256dh, auth: sub.auth },
          },
          payload,
        );
      } catch (error) {
        const status = (error as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) dead.push(sub.id);
      }
    }),
  );

  if (dead.length > 0) {
    await prisma.pushSubscription.deleteMany({ where: { id: { in: dead } } });
  }
}

/**
 * ההתראה נשמרת לכל נמען, ואז נדחפת.
 *
 * הכתיבה למסד היא זו שחייבת להצליח; הדחיפה עוטפת את עצמה ולעולם אינה
 * מפילה את הקורא.
 */
export async function notify(
  employeeIds: readonly string[],
  input: NotificationInput,
): Promise<void> {
  const ids = [...new Set(employeeIds)].filter(Boolean);
  if (ids.length === 0) return;

  await prisma.notification.createMany({
    data: ids.map((employeeId) => ({ employeeId, ...input })),
  });

  try {
    await push(ids, input);
  } catch {
    // כבר נשמר במסד — העובד יראה את זה בפעמון
  }
}

/** מי מקבל את ההתראה על משמרת שהוצעה: כל מי שכשיר לתפקיד, וכל המנהלים */
export async function swapAudience(args: {
  role: string;
  excludeId: string;
}): Promise<{ eligible: string[]; managers: string[] }> {
  const [candidates, managers] = await Promise.all([
    prisma.employee.findMany({
      where: { active: true, id: { not: args.excludeId } },
      select: { id: true, roles: true },
    }),
    prisma.employee.findMany({
      where: { active: true, canManage: true },
      select: { id: true },
    }),
  ]);

  return {
    // roles הוא CSV, ולכן ההשוואה היא על הרשימה ולא על המחרוזת
    eligible: candidates
      .filter((e) => e.roles.split(",").includes(args.role))
      .map((e) => e.id),
    managers: managers.map((m) => m.id),
  };
}

/** כמה התראות שלא נקראו — למונה שליד הפעמון */
export async function unreadCount(employeeId: string): Promise<number> {
  return prisma.notification.count({ where: { employeeId, readAt: null } });
}
