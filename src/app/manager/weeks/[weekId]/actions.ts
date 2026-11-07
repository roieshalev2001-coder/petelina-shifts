"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireManager } from "@/lib/auth";
import { notify } from "@/lib/notify";
import { sendSubmitReminders } from "@/lib/reminders";
import { decideSwapOffer } from "@/lib/swap-board";
import { prisma } from "@/lib/db";
import { buildSolverInput } from "@/lib/scheduler/adapter";
import {
  indexConstraints,
  isFeasible,
  ScheduleState,
} from "@/lib/scheduler/candidates";
import { DEFAULT_OPTIONS } from "@/lib/scheduler/types";
import { DAY_NAMES, ROLE_LABEL, parseRoles, traineeFor, type Role } from "@/lib/domain";
import {
  addDays,
  fitSlot,
  formatDateTime,
  formatDayMonth,
  resolveEnd,
  toHHMM,
  toMinutes,
} from "@/lib/time";
import {
  acceptingSubmissionsWhere,
  closingTimeFor,
  findTemplateSlot,
  isDeadlinePassed,
  isTimeDisplay,
  shiftedActual,
  showsEndTime,
  submitReminderText,
} from "@/lib/week";
import { addWeekSlot, buildSchedule, seedFridayPlan } from "@/lib/weeks";

/**
 * התראה לכל מי שטרם הגיש לשבוע — הכפתור הידני במסך השבוע.
 *
 * ההתראה נרשמת לכולם ומופיעה בפעמון; לטלפון היא מגיעה רק למי שרשום
 * להתראות. לכן הפעולה מחזירה את שני המספרים, והממשק אומר למנהל כמה באמת
 * יקבלו אותה בטלפון — לא "נשלח" כללי שמסתיר ש-29 מתוך 35 לא ירגישו בה.
 *
 * מי שטרם הגיש מחושב כאן מחדש ולא מתקבל מהדפדפן: עובד שהגיש בדקה שבין
 * טעינת הדף ללחיצה לא יקבל תזכורת.
 */
export async function nudgeMissing(
  weekId: string,
): Promise<{ error: string } | { sent: number; withPush: number; skipped: number }> {
  await requireManager();

  const week = await prisma.week.findUnique({
    where: { id: weekId },
    select: {
      status: true,
      deadline: true,
      weekStart: true,
      deletedAt: true,
      submissions: { where: { submittedAt: { not: null } }, select: { employeeId: true } },
    },
  });
  if (!week || week.deletedAt) return { error: "השבוע לא נמצא" };

  // אותו תנאי שבו טופס ההגשה נפתח לעובד — ראה src/lib/submissions.ts
  if (week.status !== "open" || isDeadlinePassed(week)) {
    return { error: "ההגשה לשבוע הזה סגורה, ותזכורת הייתה מובילה לטופס נעול." };
  }

  const submitted = new Set(week.submissions.map((s) => s.employeeId));
  const missing = await prisma.employee.findMany({
    where: { active: true, id: { notIn: [...submitted] } },
    select: { id: true, _count: { select: { pushSubs: true } } },
  });
  if (missing.length === 0) return { sent: 0, withPush: 0, skipped: 0 };

  /*
   * מי שקיבל התראה ידנית ביממה האחרונה לא מקבל שוב — הבדיקה בתוך נעילה,
   * כך שגם לחיצה כפולה או שני מנהלים יחד לא שולחים פעמיים.
   */
  const weekLabel = `${formatDayMonth(week.weekStart)}–${formatDayMonth(addDays(week.weekStart, 5))}`;
  const recipients = new Set(
    await sendSubmitReminders({
      weekId,
      stage: "manual",
      candidateIds: missing.map((e) => e.id),
      text: submitReminderText({ weekLabel, deadline: formatDateTime(week.deadline) }),
    }),
  );

  // נספר מהשאילתה שלפני השליחה: הדחיפה מוחקת הרשמות מתות תוך כדי
  const withPush = missing.filter((e) => recipients.has(e.id) && e._count.pushSubs > 0).length;

  revalidatePath(`/manager/weeks/${weekId}`);
  return { sent: recipients.size, withPush, skipped: missing.length - recipients.size };
}

export async function runSolver(weekId: string) {
  await requireManager();
  await buildSchedule(weekId);
  revalidatePath(`/manager/weeks/${weekId}`);
}

export async function closeSubmissions(weekId: string) {
  await requireManager();
  await prisma.week.update({ where: { id: weekId }, data: { status: "closed" } });
  revalidatePath(`/manager/weeks/${weekId}`);
}

/**
 * פותח מחדש שבוע שנסגר. אם המועד האחרון כבר חלף הוא נדחה ביממה,
 * אחרת השבוע היה נפתח ונסגר מיד בבדיקת המועד בצד השרת.
 */
export async function reopenSubmissions(weekId: string, confirmed: boolean) {
  await requireManager();

  const week = await prisma.week.findUnique({ where: { id: weekId } });
  if (!week) throw new Error("השבוע לא נמצא");

  /*
   * פתיחה מחדש היא הדרך השנייה להגיע לשני שבועות פתוחים, ולכן היא עוברת
   * את אותו שער כמו openNextWeek: אם כבר פתוח שבוע אחר — צריך אישור.
   *
   * השער בשרת ולא רק בדיאלוג. ראה WeekActions.
   *
   * רק שבועות שעוד מקבלים הגשות — שבוע שהמועד שלו עבר אינו "פתוח במקביל".
   * אותו כלל כמו הרשימה שהדיאלוג מציג (otherOpenWeeks במסך השבוע).
   */
  const otherOpen = await prisma.week.count({
    where: { ...acceptingSubmissionsWhere(), id: { not: weekId } },
  });
  if (otherOpen > 0 && !confirmed) {
    return { error: "כבר פתוח שבוע אחר להגשה. פתיחה מחדש דורשת אישור." };
  }

  const deadline =
    week.deadline.getTime() > Date.now()
      ? week.deadline
      : new Date(Date.now() + 24 * 60 * 60 * 1000);

  await prisma.week.update({
    where: { id: weekId },
    data: { status: "open", deadline, publishedAt: null },
  });
  revalidatePath(`/manager/weeks/${weekId}`);
}

/**
 * אין יותר חסימת פרסום: שיבוץ חלקי נוצר רק בבחירה ידנית של המנהל,
 * כלומר הוא מאושר מעצם קיומו. משבצת ריקה אינה עילה לחסום — ייתכן
 * שאין ברירה, והמנהל רואה את זה בכרטיס האזהרה.
 */
export async function publishWeek(weekId: string) {
  await requireManager();

  await prisma.week.update({
    where: { id: weekId },
    data: { status: "published", publishedAt: new Date() },
  });
  revalidatePath(`/manager/weeks/${weekId}`);
}

export async function unpublishWeek(weekId: string) {
  await requireManager();
  await prisma.week.update({
    where: { id: weekId },
    data: { status: "closed", publishedAt: null },
  });
  revalidatePath(`/manager/weeks/${weekId}`);
}

/**
 * מארכב שבוע. **לא מוחק.**
 *
 * קודם זו הייתה `delete` עם cascade על המשבצות, ההגשות והשיבוצים — ומחיקה
 * בטעות הייתה אובדן מוחלט. עכשיו נשמר `deletedAt`: הסידור יורד מכל המסכים
 * וממוני סבב שישי, וחוזר בלחיצה מ"סידורי עבר".
 *
 * השורה נשארת גם כדי שהתאריך יישאר תפוס — `weekStart` הוא `@unique`.
 */
export async function archiveWeek(weekId: string) {
  await requireManager();
  await prisma.week.update({
    where: { id: weekId },
    data: { deletedAt: new Date() },
  });
  revalidatePath("/manager");
  revalidatePath("/manager/history");
  redirect("/manager");
}

/** מחזיר שבוע מהארכיון. */
export async function restoreWeek(weekId: string) {
  await requireManager();
  await prisma.week.update({
    where: { id: weekId },
    data: { deletedAt: null },
  });
  revalidatePath("/manager");
  revalidatePath("/manager/history");
  revalidatePath(`/manager/weeks/${weekId}`);
}

/** שינוי המועד האחרון — בעיקר כדי להאריך לעובדים שמתמהמהים. */
export async function updateDeadline(weekId: string, deadline: Date) {
  await requireManager();
  await prisma.week.update({ where: { id: weekId }, data: { deadline } });
  revalidatePath(`/manager/weeks/${weekId}`);
}

/**
 * השעות בפועל של עובד במשבצת, כשהמנהל משבץ אותו ידנית.
 *
 * מכבדים את חלון הזמינות שהעובד הצהיר עליו גם בשיבוץ ידני, כדי שהשעות
 * בפועל יהיו נכונות ושהתא יסומן אם הוא מקוצר. משותף לשיבוץ ולהחלפה, כך
 * ששתי הדרכים לשים אדם במשבצת מחשבות שעות בדיוק אותו דבר.
 */
async function manualHours(
  slot: { id: string; startTime: string; endTime: string; dayOfWeek: number },
  week: { closingTimes: string },
  employeeId: string,
) {
  const closing = closingTimeFor(week, slot.dayOfWeek);
  const slotStart = toMinutes(slot.startTime);
  const slotEnd = toMinutes(resolveEnd(slot.endTime, closing));

  const availability = await prisma.availability.findUnique({
    where: { employeeId_slotId: { employeeId, slotId: slot.id } },
  });

  const fit = fitSlot(
    { start: slotStart, end: slotEnd },
    {
      earliestStart: availability?.earliestStart ?? null,
      latestEnd: availability?.latestEnd ?? null,
    },
    // בשיבוץ ידני המנהל מחליט — הוא רואה את האזהרות בבורר ובוחר בכל זאת
    { minShiftMinutes: 0 },
  );

  const start = fit.kind === "none" ? slotStart : fit.start;
  const end = fit.kind === "none" ? slotEnd : fit.end;
  return {
    actualStart: toHHMM(start),
    actualEnd: toHHMM(end),
    shortened: start !== slotStart || end !== slotEnd,
  };
}

/** שיבוץ ידני של עובד למשבצת, או פינוי המשבצת כש-employeeId ריק. */
export async function assignCell(
  weekId: string,
  slotId: string,
  employeeId: string | null,
) {
  await requireManager();

  const slot = await prisma.weekSlot.findUnique({
    where: { id: slotId },
    include: { week: true },
  });
  if (!slot) throw new Error("המשבצת לא נמצאה");

  await prisma.assignment.deleteMany({ where: { slotId } });

  if (employeeId) {
    await prisma.assignment.create({
      data: {
        weekId,
        slotId,
        employeeId,
        ...(await manualHours(slot, slot.week, employeeId)),
        // בחירה ידנית היא האישור עצמו — אין תור אישורים נפרד יותר
        shortenedApproved: true,
        manualOverride: true,
        pinned: true,
      },
    });
  }

  revalidatePath(`/manager/weeks/${weekId}`);
}

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

/**
 * "שינוי שעות" של בלוק בעריכת הסידור.
 *
 * `week` — רק המשבצת של השבוע הזה. `always` — גם בלוק התבנית שממנו היא
 * נוצרה (כל שבוע שייפתח מעכשיו), וגם אותו בלוק בשבועות שכבר נפתחו אחרי
 * השבוע הזה ועוד לא פורסמו. שבוע שפורסם לא משתנה מאחורי הגב של העובדים.
 *
 * בשישי משנים רק את שעת ההגעה — שעת הסיום שם אינה מוצגת לאיש (ראה
 * showsEndTime), ולכן היא נשארת כמו שהיא.
 *
 * העובד שבבלוק זז עם השעות; קיצור אישי שלו נשמר (ראה shiftedActual).
 */
export async function changeSlotHours(args: {
  weekId: string;
  slotId: string;
  startTime: string;
  /** "HH:MM" או "CLOSING". מתעלמים ממנו בשישי */
  endTime: string;
  scope: "week" | "always";
  /** range | start | end — איך השעות יוצגו. בלי — נשאר כמו שהיה */
  timeDisplay?: string;
}): Promise<{ error?: string; templateUpdated?: boolean; otherWeeks?: number }> {
  await requireManager();
  if (!HHMM.test(args.startTime)) return { error: "שעת ההתחלה לא תקינה" };
  if (args.timeDisplay !== undefined && !isTimeDisplay(args.timeDisplay)) {
    return { error: "צורת התצוגה לא מוכרת" };
  }
  const display = args.timeDisplay ? { timeDisplay: args.timeDisplay } : {};

  const slot = await prisma.weekSlot.findUnique({
    where: { id: args.slotId },
    include: { week: true, assignment: true },
  });
  if (!slot || slot.weekId !== args.weekId) return { error: "הבלוק לא נמצא" };

  const startOnly = !showsEndTime(slot.dayOfWeek);
  const endTime = startOnly ? slot.endTime : args.endTime;
  if (!startOnly && endTime !== "CLOSING" && !HHMM.test(endTime)) {
    return { error: "שעת הסיום לא תקינה" };
  }
  const closing = closingTimeFor(slot.week, slot.dayOfWeek);
  if (toMinutes(args.startTime) >= toMinutes(resolveEnd(endTime, closing))) {
    return { error: "שעת ההתחלה צריכה להיות לפני שעת הסיום" };
  }

  const old = {
    dayOfWeek: slot.dayOfWeek,
    role: slot.role,
    startTime: slot.startTime,
    endTime: slot.endTime,
    sortOrder: slot.sortOrder,
  };

  /** משבצת אחת בשבוע אחד: השעות שלה, והשיבוץ שבה */
  const apply = async (target: {
    id: string;
    startTime: string;
    endTime: string;
    dayOfWeek: number;
    week: { closingTimes: string; weekStart: Date };
    assignment: { id: string; actualStart: string; actualEnd: string } | null;
  }) => {
    const close = closingTimeFor(target.week, target.dayOfWeek);
    await prisma.weekSlot.update({
      where: { id: target.id },
      data: { startTime: args.startTime, endTime, ...display },
    });
    if (target.assignment) {
      const next = shiftedActual({
        oldStart: target.startTime,
        oldEnd: resolveEnd(target.endTime, close),
        newStart: args.startTime,
        newEnd: resolveEnd(endTime, close),
        actualStart: target.assignment.actualStart,
        actualEnd: target.assignment.actualEnd,
      });
      await prisma.assignment.update({ where: { id: target.assignment.id }, data: next });
    }
  };

  await apply(slot);

  let templateUpdated = false;
  let otherWeeks = 0;
  if (args.scope === "always") {
    const template = await prisma.templateSlot.findMany({
      where: { dayOfWeek: slot.dayOfWeek, active: true },
    });
    const match = findTemplateSlot(template, old);
    if (match) {
      await prisma.templateSlot.update({
        where: { id: match.id },
        data: { startTime: args.startTime, endTime, ...display },
      });
      templateUpdated = true;
    }

    const later = await prisma.week.findMany({
      where: {
        weekStart: { gt: slot.week.weekStart },
        deletedAt: null,
        status: { not: "published" },
      },
      select: {
        slots: {
          where: { dayOfWeek: slot.dayOfWeek, role: slot.role },
          include: { week: true, assignment: true },
        },
      },
    });
    for (const w of later) {
      const target = findTemplateSlot(w.slots, old);
      if (!target) continue;
      await apply(target);
      otherWeeks++;
    }
    revalidatePath("/manager/template");
  }

  revalidatePath("/manager", "layout");
  return { templateUpdated, otherWeeks };
}

const BLOCK_ROLES = ["waiter", "bartender", "manager"] as const;
const BLOCK_PERIODS = ["morning", "evening", "allday"] as const;

/**
 * "+ בלוק" — משבצת נוספת ביום אחד של השבוע הזה בלבד. התבנית לא משתנה.
 * הבלוק נכנס אחרי האחרון מאותו תפקיד באותו יום (ראה addWeekSlot).
 */
export async function addBlock(args: {
  weekId: string;
  dayOfWeek: number;
  role: string;
  period: string;
  startTime: string;
  endTime: string;
}): Promise<{ error?: string }> {
  await requireManager();
  if (!(BLOCK_ROLES as readonly string[]).includes(args.role)) return { error: "תפקיד לא מוכר" };
  if (!(BLOCK_PERIODS as readonly string[]).includes(args.period)) return { error: "חלק היום לא מוכר" };
  if (!Number.isInteger(args.dayOfWeek) || args.dayOfWeek < 0 || args.dayOfWeek > 6) {
    return { error: "יום לא תקין" };
  }
  if (!HHMM.test(args.startTime)) return { error: "שעת ההתחלה לא תקינה" };
  if (args.endTime !== "CLOSING" && !HHMM.test(args.endTime)) return { error: "שעת הסיום לא תקינה" };

  const week = await prisma.week.findUnique({ where: { id: args.weekId } });
  if (!week || week.deletedAt) return { error: "השבוע לא נמצא" };
  const closing = closingTimeFor(week, args.dayOfWeek);
  if (toMinutes(args.startTime) >= toMinutes(resolveEnd(args.endTime, closing))) {
    return { error: "שעת ההתחלה צריכה להיות לפני שעת הסיום" };
  }

  await addWeekSlot(args);
  revalidatePath(`/manager/weeks/${args.weekId}`);
  return {};
}

/**
 * "הסרת הבלוק" — רק לבלוק שנוסף לשבוע הזה (`extra`). בלוק מהתבנית אפשר
 * רק לפנות: מחיקה שלו לא ניתנת להחזרה, ומשמרת קריטית הייתה נעלמת (רואי).
 * הבדיקה כאן ולא רק במסך, כדי שאי אפשר יהיה לעקוף אותה.
 *
 * המשבצת יורדת יחד עם מי שמשובץ בה והסימונים עליה (Cascade). המסך מזהיר
 * לפני, כשיש בה עובד.
 */
export async function removeBlock(weekId: string, slotId: string): Promise<{ error?: string }> {
  await requireManager();
  const slot = await prisma.weekSlot.findUnique({
    where: { id: slotId },
    select: { weekId: true, extra: true },
  });
  if (!slot || slot.weekId !== weekId) return { error: "הבלוק לא נמצא" };
  if (!slot.extra) return { error: "בלוק מהתבנית אי אפשר להסיר — אפשר לפנות אותו" };
  await prisma.weekSlot.delete({ where: { id: slotId } });
  revalidatePath(`/manager/weeks/${weekId}`);
  return {};
}

/**
 * הערה לעובד בבלוק שלו, לשבוע הזה ("פותח קופה"). ריקה = מחיקה.
 *
 * הערה נועצת את השיבוץ: בנייה מחדש מוחקת כל מה שאינו נעוץ, וההערה הייתה
 * נעלמת איתו בלי שאיש ביקש.
 */
export async function setAssignmentNote(
  weekId: string,
  slotId: string,
  note: string,
): Promise<{ error?: string }> {
  await requireManager();
  const text = note.trim().slice(0, 40) || null;
  const assignment = await prisma.assignment.findUnique({ where: { slotId } });
  if (!assignment || assignment.weekId !== weekId) return { error: "אין עובד בבלוק הזה" };
  await prisma.assignment.update({
    where: { slotId },
    data: { note: text, ...(text ? { pinned: true } : {}) },
  });
  revalidatePath(`/manager/weeks/${weekId}`);
  return {};
}

/**
 * המתלמדים שאפשר לצרף לבלוק: פעילים, מתלמדים בתפקיד של הבלוק, ומי שסימן
 * אותו קודם. מי שכבר עובד או מתלמד באותו יום מסומן "תפוס" — אפשר לצרף
 * אותו בכל זאת, אחרי אישור, כמו בבורר העובדים.
 */
export async function traineeOptions(weekId: string, slotId: string) {
  await requireManager();
  const slot = await prisma.weekSlot.findUnique({
    where: { id: slotId },
    select: { weekId: true, role: true, dayOfWeek: true },
  });
  if (!slot || slot.weekId !== weekId) return [];

  const sameDay = { weekId, slot: { dayOfWeek: slot.dayOfWeek } };
  const [employees, marks, traineesToday, workingToday] = await Promise.all([
    prisma.employee.findMany({
      where: { active: true },
      select: { id: true, fullName: true, roles: true },
      orderBy: { fullName: "asc" },
    }),
    prisma.availability.findMany({ where: { slotId }, select: { employeeId: true, state: true } }),
    prisma.traineeAssignment.findMany({ where: sameDay, select: { employeeId: true, slotId: true } }),
    prisma.assignment.findMany({ where: sameDay, select: { employeeId: true } }),
  ]);

  const markOf = new Map(marks.map((m) => [m.employeeId, m.state as "available" | "preferred"]));
  const current = traineesToday.find((t) => t.slotId === slotId)?.employeeId;
  const otherBlock = new Set(traineesToday.filter((t) => t.slotId !== slotId).map((t) => t.employeeId));
  const working = new Set(workingToday.map((a) => a.employeeId));

  const rank = (o: { marked: string | null; busy: string | null }) =>
    (o.busy ? 3 : 0) + (o.marked === "preferred" ? 0 : o.marked === "available" ? 1 : 2);

  return employees
    .filter((e) => e.id !== current && traineeFor(e.roles).includes(slot.role as Role))
    .map((e) => ({
      id: e.id,
      fullName: e.fullName,
      marked: markOf.get(e.id) ?? null,
      busy: otherBlock.has(e.id)
        ? "כבר מתלמד בבלוק אחר ביום הזה"
        : working.has(e.id)
          ? "כבר עובד ביום הזה"
          : null,
    }))
    .sort((a, b) => rank(a) - rank(b));
}

export type TraineeOption = Awaited<ReturnType<typeof traineeOptions>>[number];

/**
 * צירוף מתלמד לבלוק, או הסרתו (null). מתלמד אחד לכל בלוק — צירוף חדש
 * מחליף את הקודם. הבנייה לא נוגעת בזה, ולכן אין צורך לנעוץ את העובד הרגיל.
 */
export async function setTrainee(
  weekId: string,
  slotId: string,
  employeeId: string | null,
): Promise<{ error?: string }> {
  await requireManager();
  const slot = await prisma.weekSlot.findUnique({
    where: { id: slotId },
    select: { weekId: true, role: true },
  });
  if (!slot || slot.weekId !== weekId) return { error: "הבלוק לא נמצא" };

  if (employeeId === null) {
    await prisma.traineeAssignment.deleteMany({ where: { slotId } });
  } else {
    const employee = await prisma.employee.findUnique({
      where: { id: employeeId },
      select: { active: true, roles: true },
    });
    if (!employee?.active || !traineeFor(employee.roles).includes(slot.role as Role)) {
      return { error: `העובד אינו מתלמד ${ROLE_LABEL[slot.role as Role]}` };
    }
    await prisma.traineeAssignment.upsert({
      where: { slotId },
      create: { weekId, slotId, employeeId },
      update: { employeeId },
    });
  }
  revalidatePath(`/manager/weeks/${weekId}`);
  revalidatePath("/me");
  return {};
}

/**
 * "שינוי שעות" לשורה שלמה — לחיצה על השעות בעמודה הימנית של הסידור.
 *
 * חל על כל הימים בשורה שיש להם בדיוק את השעות האלה (הלקוח שולח אותם),
 * כל יום כמו ב-changeSlotHours — כולל "תמידי" לבלוק התבנית של אותו יום.
 */
export async function changeRowHours(args: {
  weekId: string;
  slotIds: string[];
  startTime: string;
  endTime: string;
  scope: "week" | "always";
  timeDisplay?: string;
}): Promise<{ error?: string; days?: number; templateUpdated?: number; otherWeeks?: number }> {
  await requireManager();
  let templateUpdated = 0;
  let otherWeeks = 0;
  for (const slotId of args.slotIds) {
    const result = await changeSlotHours({ ...args, slotId });
    if (result.error) return { error: result.error };
    if (result.templateUpdated) templateUpdated++;
    otherWeeks += result.otherWeeks ?? 0;
  }
  return { days: args.slotIds.length, templateUpdated, otherWeeks };
}

/** "שני 07:15" — לתיאור משבצת בהודעה למנהל */
function slotLabel(slot: { dayOfWeek: number; startTime: string }): string {
  return `${DAY_NAMES[slot.dayOfWeek]} ${slot.startTime}`;
}

/**
 * מה ישתנה בהחלפה בין שתי משבצות, ומה כדאי שהמנהל יידע לפני.
 *
 * `b` יכולה להיות ריקה — אז זו העברה של העובד מ-`a` אליה.
 *
 * האזהרות **אינן חוסמות**, אותו חוזה כמו בבורר: המנהל רואה ומחליט. הן
 * מחושבות כאילו ההחלפה כבר קרתה — מי שעוזב משבצת באותו יום אינו "כבר
 * עובד באותו יום" בגללה.
 */
export async function previewSwap(
  weekId: string,
  slotIdA: string,
  slotIdB: string,
): Promise<
  | { error: string }
  | { moving: { name: string; to: string }[]; warnings: string[]; swap: boolean }
> {
  await requireManager();
  let pair;
  try {
    pair = await loadSwapPair(weekId, slotIdA, slotIdB);
  } catch (e) {
    if (e instanceof SwapRefused) return { error: e.message };
    throw e;
  }
  const { a, b } = pair;

  const moves = [
    { who: pair.assignmentA.employee, from: a, to: b },
    ...(b.assignment ? [{ who: b.assignment.employee, from: b, to: a }] : []),
  ];

  const warnings: string[] = [];
  for (const m of moves) {
    const name = m.who.fullName;
    const role = m.to.role as Role;
    if (!(parseRoles(m.who.roles) as string[]).includes(role)) {
      warnings.push(`ל${name} אין תפקיד ${ROLE_LABEL[role] ?? role}.`);
    }

    // משמרת אחרת באותו יום — לא כולל את שתי המשבצות שמתחלפות
    const sameDay = await prisma.assignment.count({
      where: {
        weekId,
        employeeId: m.who.id,
        slot: { dayOfWeek: m.to.dayOfWeek },
        slotId: { notIn: [a.id, b.id] },
      },
    });
    if (sameDay > 0) {
      warnings.push(`ל${name} כבר יש משמרת אחרת ביום ${DAY_NAMES[m.to.dayOfWeek]}.`);
    }

    const marked = await prisma.availability.count({
      where: { employeeId: m.who.id, slotId: m.to.id },
    });
    if (marked === 0) warnings.push(`אין ל${name} סימון זמינות ל${slotLabel(m.to)}.`);
  }

  return {
    moving: moves.map((m) => ({ name: m.who.fullName, to: slotLabel(m.to) })),
    warnings,
    swap: Boolean(b.assignment),
  };
}

/**
 * החלפה אחד תמורת אחד בין שני עובדים משובצים — או העברה, כש-`b` ריקה.
 *
 * עד היום זה היה פינוי ושיבוץ פעמיים, ובאמצע אחד העובדים היה משובץ פעמיים
 * באותו יום. כאן זה צעד אחד, בטרנזקציה.
 *
 * שתי הכתיבות מותנות במי שישב במשבצת כשהמנהל ראה אותה: אם בינתיים משהו
 * השתנה (לשונית אחרת, בנייה מחדש), ההחלפה נכשלת ולא מחליפה אדם אחר.
 *
 * אישור חריגה מהמקסימום עובר **עם העובד**: מספר המשמרות של כל אחד לא
 * השתנה, ולכן החלטה שהמנהל כבר קיבל עליו עדיין תקפה.
 */
export async function swapAssignments(
  weekId: string,
  slotIdA: string,
  slotIdB: string,
): Promise<{ error?: string }> {
  await requireManager();
  let pair;
  try {
    pair = await loadSwapPair(weekId, slotIdA, slotIdB);
  } catch (e) {
    if (e instanceof SwapRefused) return { error: e.message };
    throw e;
  }
  const { a, b, week } = pair;
  const empA = pair.assignmentA;
  const empB = b.assignment;

  // השעות נקראות לפני הטרנזקציה — הן תלויות רק בזמינות של העובד
  const hoursAinB = await manualHours(b, week, empA.employeeId);
  const hoursBinA = empB ? await manualHours(a, week, empB.employeeId) : null;
  const manual = { shortenedApproved: true, manualOverride: true, pinned: true };

  const moved = await prisma.$transaction(async (tx) => {
    if (empB) {
      const first = await tx.assignment.updateMany({
        where: { slotId: a.id, employeeId: empA.employeeId },
        data: {
          employeeId: empB.employeeId,
          ...hoursBinA!,
          overMaxApproved: empB.overMaxApproved,
          ...manual,
        },
      });
      const second = await tx.assignment.updateMany({
        where: { slotId: b.id, employeeId: empB.employeeId },
        data: {
          employeeId: empA.employeeId,
          ...hoursAinB,
          overMaxApproved: empA.overMaxApproved,
          ...manual,
        },
      });
      if (first.count !== 1 || second.count !== 1) throw new SwapChanged();
      return true;
    }

    const removed = await tx.assignment.deleteMany({
      where: { slotId: a.id, employeeId: empA.employeeId },
    });
    if (removed.count !== 1) throw new SwapChanged();
    // המשבצת היעד ריקה — ואם מישהו נכנס אליה בינתיים, ה-unique על slotId נכשל
    await tx.assignment.create({
      data: {
        weekId,
        slotId: b.id,
        employeeId: empA.employeeId,
        ...hoursAinB,
        overMaxApproved: empA.overMaxApproved,
        ...manual,
      },
    });
    return true;
  }).catch((e) => {
    if (e instanceof SwapChanged || (e as { code?: string })?.code === "P2002") return false;
    throw e;
  });

  revalidatePath(`/manager/weeks/${weekId}`);
  return moved ? {} : { error: "הסידור השתנה בינתיים. המסך רוענן — נסה שוב." };
}

class SwapChanged extends Error {}

/** סירוב שההודעה שלו מוצגת למנהל כמו שהיא */
class SwapRefused extends Error {}

/** שתי המשבצות של החלפה, אחרי כל הבדיקות שמשותפות לתצוגה ולביצוע */
async function loadSwapPair(weekId: string, slotIdA: string, slotIdB: string) {
  if (slotIdA === slotIdB) throw new SwapRefused("זו אותה משמרת.");

  const week = await prisma.week.findUnique({
    where: { id: weekId },
    select: { status: true, deletedAt: true, closingTimes: true },
  });
  if (!week || week.deletedAt) throw new SwapRefused("השבוע לא נמצא.");
  // הטבלה ממילא לקריאה בלבד אחרי פרסום — השער כאן הוא האכיפה עצמה
  if (week.status === "published") {
    throw new SwapRefused("הסידור כבר פורסם. כדי להחליף צריך לבטל את הפרסום.");
  }

  const slots = await prisma.weekSlot.findMany({
    where: { id: { in: [slotIdA, slotIdB] }, weekId },
    include: { assignment: { include: { employee: true } } },
  });
  const a = slots.find((s) => s.id === slotIdA);
  const b = slots.find((s) => s.id === slotIdB);
  if (!a || !b) throw new SwapRefused("המשמרת לא נמצאה בשבוע הזה.");
  if (!a.assignment) throw new SwapRefused("במשמרת הראשונה אין אף אחד להחליף.");
  if (b.assignment?.employeeId === a.assignment.employeeId) {
    throw new SwapRefused("זה אותו עובד בשתי המשמרות.");
  }
  return { a, b, week, assignmentA: a.assignment };
}

/**
 * מזרים את סבב שישי לשבוע הזה, שוב.
 *
 * הזריעה קורית בפתיחת השבוע בלבד, ולכן שבוע שנפתח לפני שהסבב נוצר — או
 * לפני שהגיליון יובא — נשאר בלעדיו לנצח. זו הדרך להשלים אותו בלי למחוק
 * את השבוע ולפתוח מחדש, מה שהיה מוחק גם את כל ההגשות.
 */
export async function reseedFriday(weekId: string) {
  await requireManager();
  const result = await seedFridayPlan(weekId);
  revalidatePath(`/manager/weeks/${weekId}`);
  return result;
}

export async function togglePin(weekId: string, slotId: string) {
  await requireManager();
  const assignment = await prisma.assignment.findUnique({ where: { slotId } });
  if (!assignment) return;
  await prisma.assignment.update({
    where: { slotId },
    data: { pinned: !assignment.pinned },
  });
  revalidatePath(`/manager/weeks/${weekId}`);
}

export async function approveShortened(weekId: string, slotId: string) {
  await requireManager();
  await prisma.assignment.update({
    where: { slotId },
    data: { shortenedApproved: true },
  });
  revalidatePath(`/manager/weeks/${weekId}`);
}

/**
 * אישור שיבוץ שחורג ממקסימום המשמרות של העובד.
 *
 * האישור חי רק עד הבנייה הבאה — `buildSchedule` מוחק כל שיבוץ שאינו נעוץ.
 * זה מכוון: סידור חדש מחזיר את החריגות לבדיקה מאפס.
 */
export async function approveOverMax(weekId: string, slotId: string) {
  await requireManager();
  await prisma.assignment.update({
    where: { slotId },
    data: { overMaxApproved: true },
  });
  revalidatePath(`/manager/weeks/${weekId}`);
}

/**
 * מי כשיר לאייש משבצת נתונה, עם הסבר לכל מועמד.
 * זה מה שמאפשר למנהל לבחור ידנית בלי לשבור אילוץ בלי לשים לב.
 */
export async function eligibleForSlot(weekId: string, slotId: string) {
  await requireManager();

  // הפונקציה רצה בכל פתיחה של בורר תאים, ולכן שולפים רק את מה שבאמת נחוץ:
  // הזמינויות מסוננות למשבצת אחת ולא לכל השבוע (מאות שורות), ושלוש
  // השאילתות רצות במקביל כי אינן תלויות זו בזו.
  const [loaded, employees, constraints] = await Promise.all([
    prisma.week.findUnique({
      where: { id: weekId },
      include: {
        slots: { orderBy: [{ dayOfWeek: "asc" }, { sortOrder: "asc" }] },
        assignments: true,
        availabilities: { where: { slotId } },
      },
    }),
    prisma.employee.findMany({ where: { active: true }, orderBy: { fullName: "asc" } }),
    prisma.pairConstraint.findMany(),
  ]);
  if (!loaded) return [];

  const input = buildSolverInput({
    week: loaded,
    slots: loaded.slots,
    employees,
    availabilities: loaded.availabilities,
    constraints,
  });

  const slot = input.slots.find((s) => s.id === slotId);
  if (!slot) return [];

  const slotById = new Map(input.slots.map((s) => [s.id, s]));
  const state = new ScheduleState(
    slotById,
    loaded.assignments
      .filter((a) => a.slotId !== slotId)
      .map((a) => ({
        slotId: a.slotId,
        employeeId: a.employeeId,
        actualStart: toMinutes(a.actualStart),
        actualEnd: toMinutes(a.actualEnd),
        shortened: a.shortened,
        pinned: a.pinned,
      })),
  );
  const constraintIndex = indexConstraints(input.constraints);

  const marks = new Map(
    input.availabilities
      .filter((a) => a.slotId === slotId)
      .map((a) => [a.employeeId, a]),
  );

  const FIT_REASON_LABEL: Record<string, string> = {
    "too-short": "נשארות פחות מ-4 שעות",
    "no-overlap": "השעות שלו לא חופפות למשמרת",
  };

  const REASON_LABEL: Record<string, string> = {
    "at-max": "הגיע למקסימום המשמרות",
    "busy-same-day": "כבר משובץ באותו יום",
    "cross-round": "כבר משובץ בסבב השני באותו יום",
    "standby-repeat": "כבר משובץ למשמרת כוננות אחרת השבוע",
    "pair-conflict": 'אילוץ "לא עובדים יחד"',
    "rest-violation": "אין מספיק מנוחה מהמשמרת הקודמת",
  };

  /*
   * ההערה נקראת מהשורה הגולמית ולא מ-SolverEmployee, כי הטיפוס הזה בכוונה
   * אינו נושא אותה: לפותר אין שום עסק עם טקסט חופשי, וזה גבול ששווה לשמור.
   */
  const notes = new Map(employees.map((e) => [e.id, e.privateNotes]));

  const slotMinutes = slot.end - slot.start;

  const options = input.employees
    .filter((e) => e.roles.includes(slot.role))
    .map((e) => {
      const mark = marks.get(e.id);
      const blocked = isFeasible(e, slot, state, constraintIndex, DEFAULT_OPTIONS);

      // minShiftMinutes: 0 — המנהל רשאי לשקול גם כיסוי קצר מהמינימום.
      // הדגלים עוברים כדי שהתשובה תסמן breaksOpening/breaksClosing, ולא
      // כדי לפסול: איחור לפתיחה הוא אפשרות שמוצגת עם אזהרה, וההחלטה שלך.
      const fit = mark
        ? fitSlot(
            { start: slot.start, end: slot.end },
            { earliestStart: mark.earliestStart, latestEnd: mark.latestEnd },
            {
              minShiftMinutes: 0,
              fixedStart: slot.fixedStart,
              fixedEnd: slot.fixedEnd,
            },
          )
        : null;

      const fitBlocked = fit?.kind === "none" ? FIT_REASON_LABEL[fit.reason] : null;
      // הרשאת סגירה בוטלה — כולם יכולים לסגור, ולכן אין כאן יותר אזהרה
      const reason = fitBlocked ?? (blocked ? REASON_LABEL[blocked] : null);

      // מי שלא סימן את המשמרת הוא אפשרות אחרונה: המנהל עדיין יכול לשבץ אותו,
      // אבל הוא נחות ממי שהתנדב ויכול לכסות ולו חלק.
      const group: "full" | "partial" | "unmarked" | "blocked" = reason
        ? "blocked"
        : !mark
          ? "unmarked"
          : fit?.kind === "partial"
            ? "partial"
            : "full";

      const covered = fit?.kind === "partial" ? fit.end - fit.start : slotMinutes;

      return {
        id: e.id,
        fullName: e.fullName,
        /*
         * ההערה הפנימית, כדי שתקרא אותה ברגע ההחלטה ולא תצטרך לזכור.
         *
         * זה טקסט שגלוי למנהל בלבד והוא נשלח לדפדפן — מותר **רק** כאן,
         * כי הבורר יושב מאחורי requireManager. אל תעתיק את הדפוס הזה
         * למסך שעובד רואה.
         *
         * הפותר אינו קורא את ההערה ולא ינחש ממנה כלל: משפט חופשי בעברית
         * אינו אילוץ, וניחוש היה טועה בשקט.
         */
        note: notes.get(e.id) ?? null,
        group,
        seniority: e.seniority,
        marked: mark ? (mark.state as "available" | "preferred") : null,
        assignedCount: state.countFor(e.id),
        requiredShifts: e.requiredShifts,
        /** null בקבוצות full ו-partial */
        reason,
        coverStart: fit?.kind === "partial" ? toHHMM(fit.start) : null,
        coverEnd: fit?.kind === "partial" ? toHHMM(fit.end) : null,
        coveredMinutes: covered,
        slotMinutes,
        /**
         * אזהרה ולא פסילה: הוא כן אפשרות, אבל אם תבחר בו המקום ייפתח
         * באיחור או שלא יישאר מי שיסגור. ההחלטה שלך, ועם העיניים פקוחות.
         */
        warning:
          fit?.kind === "partial" && fit.breaksOpening
            ? `המשמרת פותחת ב-${toHHMM(slot.start)} — יגיע ב-${toHHMM(fit.start)}`
            : fit?.kind === "partial" && fit.breaksClosing
              ? `המשמרת סוגרת — ירד ב-${toHHMM(fit.end)}`
              : null,
      };
    });

  const rankMark = (x: (typeof options)[number]) =>
    x.marked === "preferred" ? 0 : x.marked === "available" ? 1 : 2;
  const byQuota = (a: (typeof options)[number], b: (typeof options)[number]) =>
    b.requiredShifts - b.assignedCount - (a.requiredShifts - a.assignedCount);

  return options.sort((a, b) => {
    // הקבוצות לפי סדר השימושיות למנהל
    const groupRank = { full: 0, partial: 1, unmarked: 2, blocked: 3 } as const;
    if (a.group !== b.group) return groupRank[a.group] - groupRank[b.group];

    // בתוך "מכסים חלק" — מי שמכסה הכי הרבה קודם. זה השיקול הראשון של המנהל.
    if (a.group === "partial" && a.coveredMinutes !== b.coveredMinutes) {
      return b.coveredMinutes - a.coveredMinutes;
    }
    if (rankMark(a) !== rankMark(b)) return rankMark(a) - rankMark(b);
    return byQuota(a, b) || a.fullName.localeCompare(b.fullName, "he");
  });
}

export type EligibleEmployee = Awaited<ReturnType<typeof eligibleForSlot>>[number];

/**
 * המנהל מאשר או דוחה תפיסת משמרת.
 *
 * זה הרגע היחיד שבו המשמרת באמת עוברת. שני הצדדים מקבלים התראה בכל מקרה,
 * כולל בדחייה — מי שתפס צריך לדעת שהוא לא מגיע, ומי שמסר צריך לדעת
 * שהמשמרת חזרה אליו.
 */
export async function decideSwap(offerId: string, approve: boolean) {
  const manager = await requireManager();

  const { weekId, slotId, claimerId } = await decideSwapOffer({
    offerId,
    managerId: manager.id,
    approve,
  });

  const offer = await prisma.swapOffer.findUnique({
    where: { id: offerId },
    select: {
      offeredById: true,
      offeredStart: true,
      offeredEnd: true,
      slot: { select: { dayOfWeek: true, date: true } },
    },
  });

  if (offer) {
    const when = `${DAY_NAMES[offer.slot.dayOfWeek]} ${formatDayMonth(offer.slot.date)} ${offer.offeredStart}–${offer.offeredEnd}`;
    await notify([offer.offeredById, claimerId], {
      kind: approve ? "swap-approved" : "swap-rejected",
      title: approve ? "החילוף אושר" : "החילוף נדחה",
      body: approve
        ? `${when} — המשמרת עברה.`
        : `${when} — המשמרת נשארת אצל מי שהציע אותה.`,
      url: "/me",
    });
  }

  revalidatePath(`/manager/weeks/${weekId}`);
  revalidatePath("/me");
  void slotId;
}
