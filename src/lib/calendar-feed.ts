import { randomBytes } from "node:crypto";
import { buildICS } from "./calendar";
import { prisma } from "./db";
import { loadShiftEvents } from "./swap-board";
import { addDays } from "./time";

/**
 * מנוי היומן האישי — הכתובת שיומן אפל נרשם אליה ומתעדכן ממנה לבד.
 *
 * הכתובת עצמה היא ההרשאה: יומן לא שולח עוגיות, ולכן אין כאן session. מה
 * שמגן הוא שהמפתח אקראי (24 בתים) ושאפשר להחליף אותו ("קישור חדש"). מה
 * שדולף ממנו הוא שעות המשמרות של עובד אחד — בדיוק מה שהוא בחר לשתף עם
 * היומן שלו.
 */

/** מפתח חדש למנוי — 24 בתים אקראיים, כ-base64url */
export function newCalendarToken(): string {
  return randomBytes(24).toString("base64url");
}

/** כמה אחורה המנוי מציג — שבועיים, כדי שמשמרת של אתמול לא תיעלם מהיומן */
const PAST_DAYS = 14;

/**
 * הקובץ של המנוי, או null כשהמפתח לא מוכר או שהעובד לא פעיל.
 *
 * רק שבועות שפורסמו ולא אורכבו. משמרות שמסר לא נכללות: מה שנעלם מהקובץ
 * נמחק מהיומן לבד.
 */
export async function calendarFeed(token: string, now: Date = new Date()): Promise<string | null> {
  const employee = await prisma.employee.findUnique({
    where: { calendarToken: token },
    select: { id: true, active: true },
  });
  if (!employee?.active) return null;

  const weeks = await prisma.week.findMany({
    where: {
      status: "published",
      deletedAt: null,
      weekStart: { gte: addDays(now, -PAST_DAYS - 7) },
    },
    select: { id: true },
    orderBy: { weekStart: "asc" },
  });

  const events = (
    await Promise.all(
      weeks.map((w) =>
        loadShiftEvents({ weekId: w.id, employeeId: employee.id, includeReleased: false }),
      ),
    )
  ).flat();

  return buildICS(events, now, { name: "משמרות פטלינה", refreshHours: 1 });
}
