import { prisma } from "./db";
import { notify } from "./notify";
import { reminderBlocked, type ReminderStage } from "./week";

/**
 * שולח תזכורת להגשה — פעם אחת בלבד, גם כשמשהו מנסה לשלוח פעמיים.
 *
 * הבדיקה מי כבר קיבל והרישום ביומן קורים בטרנזקציה אחת שנועלת את שורת
 * השבוע. כך לחיצה כפולה, שני מנהלים או ריצה כפולה של השעון ממתינים זה
 * לזה, והשני כבר רואה את מה שהראשון רשם. הכלל מי חסום — reminderBlocked.
 *
 * ההתראה עצמה יוצאת אחרי הרישום: אם היא נכשלת, העובד פשוט לא יקבל אותה,
 * אבל לעולם לא יקבל אותה פעמיים.
 *
 * מחזיר את מי שבאמת קיבל.
 */
export async function sendSubmitReminders(args: {
  weekId: string;
  stage: ReminderStage;
  /** מי שטרם הגיש — מי מהם כבר קיבל נבדק כאן */
  candidateIds: readonly string[];
  text: { title: string; body: string };
  now?: Date;
}): Promise<string[]> {
  const now = args.now ?? new Date();
  if (args.candidateIds.length === 0) return [];

  const recipients = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT 1 FROM "Week" WHERE "id" = ${args.weekId} FOR UPDATE`;

    const previous = await tx.reminderLog.findMany({
      where: { weekId: args.weekId, employeeId: { in: [...args.candidateIds] } },
      select: { employeeId: true, stage: true, createdAt: true },
    });
    const byEmployee = new Map<string, typeof previous>();
    for (const p of previous) {
      byEmployee.set(p.employeeId, [...(byEmployee.get(p.employeeId) ?? []), p]);
    }

    const allowed = [...new Set(args.candidateIds)].filter(
      (id) => !reminderBlocked({ stage: args.stage, previous: byEmployee.get(id) ?? [], now }),
    );
    if (allowed.length > 0) {
      await tx.reminderLog.createMany({
        data: allowed.map((employeeId) => ({
          weekId: args.weekId,
          employeeId,
          stage: args.stage,
          createdAt: now,
        })),
      });
    }
    return allowed;
  });

  if (recipients.length > 0) {
    await notify(recipients, {
      kind: args.stage === "manual" ? "submit-nudge" : "submit-reminder",
      ...args.text,
      url: `/me/submit?week=${args.weekId}`,
    });
  }
  return recipients;
}
