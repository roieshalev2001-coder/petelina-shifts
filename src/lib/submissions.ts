import { prisma } from "./db";
import { parseTemplate } from "./availability-template";
import { submitRolesOf, type Period, type Role } from "./domain";
import { closingTimeFor } from "./week";
import { resolveEnd, toMinutes } from "./time";

/** משבצת כפי שהיא מוצגת לעובד בטופס ההגשה — שעות כבר פתורות. */
export type FormSlot = {
  id: string;
  dayOfWeek: number;
  role: Role;
  period: Period;
  startTime: string;
  /** השעה בפועל, אחרי פתירת "עד סגירה" */
  endTime: string;
  /** האם המשבצת מוגדרת כ"עד סגירה" */
  isClosing: boolean;
  /** פותחת את הסבב — חובה להגיע בשעה המדויקת */
  fixedStart: boolean;
  /** סוגרת את הסבב — חובה להישאר עד הסוף */
  fixedEnd: boolean;
  label: string | null;
  sortOrder: number;
  start: number;
  end: number;
};

export type ExistingMark = {
  slotId: string;
  state: "available" | "preferred";
  earliestStart: string | null;
  latestEnd: string | null;
};

/**
 * טוען את מה שצריך כדי להציג לעובד את טופס ההגשה שלו:
 * רק המשבצות שתואמות לתפקידים שלו, והסימונים הקיימים.
 */
export async function loadSubmissionForm(weekId: string, employeeId: string) {
  /*
   * ארבע השאילתות רצות בגל אחד ולא בשניים.
   *
   * קודם הן היו מחולקות לשתי קבוצות Promise.all עוקבות, אבל אף אחת
   * מהשאילתות בקבוצה השנייה לא הייתה תלויה בתוצאות הראשונה — כולן צריכות
   * רק weekId ו-employeeId, ששניהם ידועים כאן בשורה הראשונה. החלוקה
   * עלתה סבב רשת שלם לחינם, על מסך שכל 29 העובדים פותחים כל שבוע.
   */
  const [week, employee, marks, submission, template] = await Promise.all([
    prisma.week.findUnique({
      where: { id: weekId },
      include: { slots: { orderBy: [{ dayOfWeek: "asc" }, { sortOrder: "asc" }] } },
    }),
    prisma.employee.findUnique({
      where: { id: employeeId },
      select: { id: true, roles: true },
    }),
    prisma.availability.findMany({
      where: { weekId, employeeId },
      select: {
        slotId: true,
        state: true,
        earliestStart: true,
        latestEnd: true,
      },
    }),
    prisma.submission.findUnique({
      where: { weekId_employeeId: { weekId, employeeId } },
    }),
    // "השבוע הרגיל שלי" — ראה src/lib/availability-template.ts
    prisma.availabilityTemplate.findUnique({ where: { employeeId } }),
  ]);
  if (!week || !employee) return null;

  // כולל תפקידים שהוא מתלמד בהם — מתלמד מגיש על הבלוקים שהוא יצטרף אליהם
  const roles = submitRolesOf(employee.roles);

  const slots: FormSlot[] = week.slots
    .filter((s) => roles.includes(s.role as Role))
    .map((s) => {
      const isClosing = s.endTime === "CLOSING";
      const endTime = resolveEnd(s.endTime, closingTimeFor(week, s.dayOfWeek));
      return {
        id: s.id,
        dayOfWeek: s.dayOfWeek,
        role: s.role as Role,
        period: s.period as Period,
        startTime: s.startTime,
        endTime,
        isClosing,
        fixedStart: s.fixedStart,
        fixedEnd: s.fixedEnd,
        label: s.label,
        sortOrder: s.sortOrder,
        start: toMinutes(s.startTime),
        end: toMinutes(endTime),
      };
    });

  return {
    week,
    slots,
    marks: marks as ExistingMark[],
    submission,
    usualWeek: template
      ? (() => {
          const data = parseTemplate(template.data);
          return data ? { data, savedAt: template.savedAt } : null;
        })()
      : null,
    isOpen: week.status === "open" && week.deadline.getTime() > Date.now(),
  };
}

export type SubmittedMark = {
  slotId: string;
  state: "available" | "preferred";
  earliestStart: string | null;
  latestEnd: string | null;
};

/**
 * שומר הגשה. מחליף את כל הסימונים הקודמים של העובד לשבוע —
 * כך "ביטול סימון" עובד בלי לוגיקת מחיקה נפרדת.
 */
export async function saveSubmission(args: {
  weekId: string;
  employeeId: string;
  marks: SubmittedMark[];
  note: string | null;
  finalize: boolean;
}) {
  const week = await prisma.week.findUnique({
    where: { id: args.weekId },
    include: { slots: { select: { id: true } } },
  });
  if (!week) throw new Error("השבוע לא נמצא");

  // ההגנה האמיתית על המועד האחרון — הלקוח יכול לשקר, השרת לא
  if (week.status !== "open" || week.deadline.getTime() < Date.now()) {
    throw new Error("מועד ההגשה חלף — לא ניתן לשנות. פנה למנהל.");
  }

  const validSlotIds = new Set(week.slots.map((s) => s.id));
  const marks = args.marks.filter((m) => validSlotIds.has(m.slotId));

  await prisma.$transaction([
    prisma.availability.deleteMany({
      where: { weekId: args.weekId, employeeId: args.employeeId },
    }),
    ...(marks.length
      ? [
          prisma.availability.createMany({
            data: marks.map((m) => ({
              weekId: args.weekId,
              employeeId: args.employeeId,
              slotId: m.slotId,
              state: m.state,
              earliestStart: m.earliestStart,
              latestEnd: m.latestEnd,
            })),
          }),
        ]
      : []),
    prisma.submission.upsert({
      where: {
        weekId_employeeId: { weekId: args.weekId, employeeId: args.employeeId },
      },
      create: {
        weekId: args.weekId,
        employeeId: args.employeeId,
        note: args.note,
        submittedAt: args.finalize ? new Date() : null,
      },
      update: {
        note: args.note,
        ...(args.finalize ? { submittedAt: new Date() } : {}),
      },
    }),
  ]);
}
