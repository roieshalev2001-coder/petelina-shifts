import { prisma } from "@/lib/db";
import { sendSubmitReminders } from "@/lib/reminders";
import { addDays, formatDateTime, formatDayMonth } from "@/lib/time";
import { submitReminderText, whoNeedsReminder } from "@/lib/week";

/**
 * תזכורות אוטומטיות למי שטרם הגיש: "יום לפני" ו"כמה שעות לפני".
 *
 * זה התהליך היחיד באתר שרץ בלי שאיש לחץ על כלום. רץ פעמיים ביום (ראה
 * REMINDER_RUNS_UTC ו-vercel.json) — זו המגבלה של התוכנית החינמית ב-Vercel,
 * ומשם גם אי-הדיוק של עד שעה. לכן אסור שהוא יהיה תלוי בשעה מדויקת: כל
 * ריצה בודקת כמה זמן נשאר למועד ובוחרת את התזכורת שמתאימה (reminderStageFor).
 *
 * הוא גם חייב להיות אדיש להרצה חוזרת: היומן (ReminderLog) מבטיח שכל סוג
 * יוצא פעם אחת לעובד לכל שבוע, וזה נבדק בתוך נעילה — ראה sendSubmitReminders.
 */

export async function GET(request: Request) {
  /*
   * שער. הנתיב פתוח לאינטרנט ומייצר התראות ל-29 אנשים, ולכן בלי הסוד
   * הוא אינו עושה דבר — גם במחיר שתקלת הגדרה תשתיק אותו לגמרי. שתיקה
   * עדיפה כאן על נתיב שכל אחד יכול למשוך.
   */
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return new Response("unauthorized", { status: 401 });
  }

  const now = new Date();

  const [weeks, employees] = await Promise.all([
    prisma.week.findMany({
      where: { status: "open", deletedAt: null },
      select: {
        id: true,
        status: true,
        weekStart: true,
        deadline: true,
        deletedAt: true,
        submissions: {
          where: { submittedAt: { not: null } },
          select: { employeeId: true },
        },
      },
    }),
    prisma.employee.findMany({ where: { active: true }, select: { id: true } }),
  ]);

  // מי כבר קיבל — סינון ראשון. ההחלטה הסופית נבדקת שוב בתוך הנעילה
  const sent = await prisma.reminderLog.findMany({
    where: { stage: { not: "manual" }, weekId: { in: weeks.map((w) => w.id) } },
    select: { employeeId: true, weekId: true, stage: true },
  });

  const targets = whoNeedsReminder({
    weeks: weeks.map((w) => ({
      ...w,
      submittedIds: w.submissions.map((s) => s.employeeId),
      reminded: sent.filter((r) => r.weekId === w.id),
    })),
    employeeIds: employees.map((e) => e.id),
    now,
  });

  let notified = 0;
  for (const target of targets) {
    const week = weeks.find((w) => w.id === target.weekId)!;
    const label = `${formatDayMonth(week.weekStart)}–${formatDayMonth(addDays(week.weekStart, 5))}`;

    const recipients = await sendSubmitReminders({
      weekId: week.id,
      stage: target.stage,
      candidateIds: target.employeeIds,
      text: submitReminderText({
        weekLabel: label,
        deadline: formatDateTime(week.deadline),
        lastHours: target.stage === "last-hours",
      }),
      now,
    });
    notified += recipients.length;
  }

  // מספרים בלבד, בלי שמות — התשובה הזו נשמרת ביומני Vercel
  return Response.json(
    { ok: true, weeks: targets.length, notified },
    { headers: { "Cache-Control": "no-store" } },
  );
}
