/**
 * שכבת המסד של חילופי שישי.
 *
 * הכללים עצמם טהורים ויושבים ב-friday-swaps.ts. כאן יושבת ההרצה, ואיתה
 * הדבר היחיד שאי אפשר לבדוק בלי מסד: **בלעדיות**. שני עובדים שלוחצים
 * "אני לוקח" באותה שנייה חייבים להסתיים באחד שקיבל ואחד שקיבל הודעה
 * ברורה — ולא בשניהם, ולא באף אחד.
 *
 * הדפוס הוא השוואה-והחלפה (`updateMany` + בדיקת `count`), אותו דפוס
 * שמגן על מסירת משמרת רגילה ב-swap-board.ts. `openPlanId` הייחודי מוסיף
 * שכבה שנייה: לכל שיבוץ יש לכל היותר הצעה פתוחה אחת, והמסד אוכף זאת.
 */
import { prisma } from "./db";
import { parseRoles } from "./domain";
import { dateKey } from "./friday-plan";
import {
  applySwap,
  cancelBlock,
  claimBlock,
  decisionBlock,
  offerBlock,
  type PlanRef,
} from "./friday-swaps";
import { notify } from "./notify";
import { addDays, formatDayMonth, toDateInputValue, zonedMidnight } from "./time";

export class FridaySwapError extends Error {}

/** השיבוץ, בצורה שהכללים הטהורים מבינים */
function toRef(row: {
  id: string;
  date: Date;
  role: string;
  employeeId: string;
}): PlanRef {
  return {
    id: row.id,
    date: dateKey(row.date),
    role: row.role,
    employeeId: row.employeeId,
  };
}

/**
 * האם השבוע של אותו שישי כבר פורסם.
 *
 * זה הגבול בין שני מנגנוני החילוף. ההשוואה היא ליום קלנדרי ולא לרגע —
 * אותה מלכודת שהפילה את הזריעה, ראה seedFridayPlan ב-weeks.ts.
 */
async function weekPublishedFor(date: Date): Promise<boolean> {
  const from = zonedMidnight(date);
  const slot = await prisma.weekSlot.findFirst({
    where: {
      dayOfWeek: 5,
      date: { gte: from, lt: addDays(from, 1) },
      week: { status: "published" },
    },
    select: { id: true },
  });
  return slot !== null;
}

export type FridaySwapView = {
  id: string;
  mode: string;
  status: string;
  offeredById: string;
  offeredBy: string;
  offeredDate: string;
  offeredRole: string;
  offeredIsClosing: boolean;
  claimedBy: string | null;
  /** ב-trade: התאריך שניתן בתמורה */
  inReturnDate: string | null;
};

function viewOf(o: {
  id: string;
  mode: string;
  status: string;
  offeredById: string;
  offeredBy: { fullName: string };
  offeredPlan: { date: Date; role: string; isClosing: boolean };
  claimedBy: { fullName: string } | null;
  claimedPlan: { date: Date } | null;
}): FridaySwapView {
  return {
    id: o.id,
    mode: o.mode,
    status: o.status,
    offeredById: o.offeredById,
    offeredBy: o.offeredBy.fullName,
    offeredDate: dateKey(o.offeredPlan.date),
    offeredRole: o.offeredPlan.role,
    offeredIsClosing: o.offeredPlan.isClosing,
    claimedBy: o.claimedBy?.fullName ?? null,
    inReturnDate: o.claimedPlan ? dateKey(o.claimedPlan.date) : null,
  };
}

const OFFER_INCLUDE = {
  offeredBy: { select: { fullName: true } },
  claimedBy: { select: { fullName: true } },
  offeredPlan: { select: { date: true, role: true, isClosing: true } },
  claimedPlan: { select: { date: true } },
} as const;

/** ההצעות הפתוחות ואלה שממתינות להכרעה, לתצוגה */
export async function loadFridaySwaps(now: Date = new Date()): Promise<{
  open: FridaySwapView[];
  awaiting: FridaySwapView[];
}> {
  const rows = await prisma.fridaySwap.findMany({
    where: {
      status: { in: ["open", "pending"] },
      // הצעות על שישי שכבר עבר אינן מעניינות איש
      offeredPlan: { date: { gte: zonedMidnight(now) } },
    },
    orderBy: { createdAt: "desc" },
    include: OFFER_INCLUDE,
  });

  return {
    open: rows.filter((r) => r.status === "open").map(viewOf),
    awaiting: rows.filter((r) => r.status === "pending").map(viewOf),
  };
}

/**
 * מציע שישי — למסירה או להחלפה.
 *
 * ההצעה אינה מזיזה דבר: היא רק מסמנת שאני מחפש. הסבב נשאר בדיוק כפי
 * שפורסם עד שמישהו לוקח **והמנהל מאשר**.
 */
export async function offerFriday(args: {
  planId: string;
  employeeId: string;
  mode: string;
  now?: Date;
}): Promise<void> {
  const now = args.now ?? new Date();
  const plan = await prisma.fridayPlan.findUnique({
    where: { id: args.planId },
    select: { id: true, date: true, role: true, employeeId: true, publishedAt: true },
  });
  if (!plan) throw new FridaySwapError("השיבוץ אינו קיים");

  const [existing, published] = await Promise.all([
    prisma.fridaySwap.findFirst({
      where: { openPlanId: plan.id },
      select: { id: true },
    }),
    weekPublishedFor(plan.date),
  ]);

  const block = offerBlock({
    plan: toRef(plan),
    employeeId: args.employeeId,
    hasOpenOffer: existing !== null,
    weekPublished: published,
    today: toDateInputValue(now),
  });
  if (block) throw new FridaySwapError(block);

  await prisma.fridaySwap.create({
    data: {
      mode: args.mode === "trade" ? "trade" : "give",
      offeredPlanId: plan.id,
      offeredById: args.employeeId,
      openPlanId: plan.id,
      status: "open",
    },
  });

  /*
   * ההתראה יוצאת למי שיכול באמת לקחת — אותו תפקיד, ולא כולם. הודעה
   * לברמנים על משבצת מלצר היא רעש שגורם לאנשים להפסיק לקרוא.
   */
  const audience = await prisma.employee.findMany({
    where: { active: true, id: { not: args.employeeId } },
    select: { id: true, roles: true },
  });
  const eligible = audience
    .filter((e) => parseRoles(e.roles).includes(plan.role as never))
    .map((e) => e.id);

  await notify(eligible, {
    kind: "swap-offered",
    title: args.mode === "trade" ? "מישהו מחפש להחליף שישי" : "שישי פנוי",
    body: `${formatDayMonth(plan.date)} — ${
      args.mode === "trade" ? "מוצע להחלפה בשישי אחר" : "מוצע למסירה"
    }.`,
    url: "/me/fridays",
  });
}

/** ביטול הצעה שטרם נתפסה */
export async function cancelFridaySwap(args: {
  offerId: string;
  employeeId: string;
}): Promise<void> {
  const offer = await prisma.fridaySwap.findUnique({
    where: { id: args.offerId },
    select: { id: true, status: true, offeredById: true },
  });
  if (!offer) throw new FridaySwapError("ההצעה אינה קיימת");

  const block = cancelBlock({ offer, employeeId: args.employeeId });
  if (block) throw new FridaySwapError(block);

  /*
   * השוואה-והחלפה ולא update: בין הקריאה לכתיבה מישהו יכול היה לתפוס,
   * ואז הביטול היה מוחק תפיסה תקפה.
   */
  const { count } = await prisma.fridaySwap.updateMany({
    where: { id: offer.id, status: "open" },
    data: { status: "cancelled", openPlanId: null },
  });
  if (count === 0) throw new FridaySwapError("ההצעה נתפסה בינתיים");
}

/**
 * תופס הצעה — ו**אינו מזיז דבר**.
 *
 * זה הלב של החוזה שרואי ביקש: העובד מסמן שהוא מוכן, וההחלטה נשארת אצל
 * המנהל. עד האישור הסבב נראה בדיוק כפי שפורסם, ואיש אינו מגלה שהמשמרת
 * שלו עברה בלי שאיש שאל.
 */
export async function claimFriday(args: {
  offerId: string;
  employeeId: string;
  /** ב-trade: השיבוץ שהוא נותן בתמורה */
  inReturnPlanId?: string | null;
}): Promise<void> {
  const offer = await prisma.fridaySwap.findUnique({
    where: { id: args.offerId },
    include: {
      offeredPlan: {
        select: { id: true, date: true, role: true, employeeId: true },
      },
    },
  });
  if (!offer) throw new FridaySwapError("ההצעה אינה קיימת");

  const [claimer, inReturn, myPlans] = await Promise.all([
    prisma.employee.findUnique({
      where: { id: args.employeeId },
      select: { id: true, roles: true, active: true },
    }),
    args.inReturnPlanId
      ? prisma.fridayPlan.findUnique({
          where: { id: args.inReturnPlanId },
          select: { id: true, date: true, role: true, employeeId: true },
        })
      : null,
    prisma.fridayPlan.findMany({
      where: { employeeId: args.employeeId },
      select: { date: true },
    }),
  ]);
  if (!claimer?.active) throw new FridaySwapError("העובד אינו פעיל");

  const block = claimBlock({
    offer,
    offered: toRef(offer.offeredPlan),
    claimerId: claimer.id,
    claimerRoles: parseRoles(claimer.roles) as string[],
    myDates: myPlans.map((p) => dateKey(p.date)),
    inReturn: inReturn ? toRef(inReturn) : null,
  });
  if (block) throw new FridaySwapError(block);

  // בלעדיות: רק מי שהגיע ראשון משנה את הסטטוס
  const { count } = await prisma.fridaySwap.updateMany({
    where: { id: offer.id, status: "open" },
    data: {
      status: "pending",
      claimedById: claimer.id,
      claimedPlanId: inReturn?.id ?? null,
      claimedAt: new Date(),
      openPlanId: null,
    },
  });
  if (count === 0) throw new FridaySwapError("מישהו הקדים אותך");

  const managers = await prisma.employee.findMany({
    where: { active: true, canManage: true },
    select: { id: true },
  });
  await notify(
    managers.map((m) => m.id),
    {
      kind: "swap-claimed",
      title: "חילוף שישי ממתין לאישור",
      body: `${formatDayMonth(offer.offeredPlan.date)} — ממתין להכרעה שלך.`,
      url: "/manager/fridays",
    },
  );
}

/**
 * הכרעת המנהל.
 *
 * באישור, שתי שורות הסבב מחליפות בעלים **בטרנזקציה אחת** — מצב ביניים
 * שבו רק אחת זזה משאיר את אחד השניים משובץ פעמיים ואת השני בכלל לא.
 *
 * ואם השבוע של אותו שישי כבר נפתח, גם ה-`Assignment` מתעדכן באותה
 * טרנזקציה: אחרת הסבב והסידור היו אומרים שני דברים שונים.
 */
export async function decideFridaySwap(args: {
  offerId: string;
  approve: boolean;
}): Promise<void> {
  const offer = await prisma.fridaySwap.findUnique({
    where: { id: args.offerId },
    include: {
      offeredPlan: { select: { id: true, date: true, role: true, employeeId: true } },
      claimedPlan: { select: { id: true, date: true, role: true, employeeId: true } },
    },
  });
  if (!offer) throw new FridaySwapError("ההצעה אינה קיימת");

  const block = decisionBlock(offer);
  if (block) throw new FridaySwapError(block);

  if (!args.approve) {
    const { count } = await prisma.fridaySwap.updateMany({
      where: { id: offer.id, status: "pending" },
      data: { status: "open", claimedById: null, claimedPlanId: null, openPlanId: offer.offeredPlanId },
    });
    if (count === 0) throw new FridaySwapError("ההצעה כבר הוכרעה");

    if (offer.claimedById) {
      await notify([offer.claimedById], {
        kind: "swap-rejected",
        title: "החילוף לא אושר",
        body: `${formatDayMonth(offer.offeredPlan.date)} — המנהל לא אישר. המשמרת נשארה אצל מי שהציע.`,
        url: "/me/fridays",
      });
    }
    return;
  }

  const moves = applySwap({
    mode: offer.mode,
    offered: toRef(offer.offeredPlan),
    claimerId: offer.claimedById!,
    inReturn: offer.claimedPlan ? toRef(offer.claimedPlan) : null,
  });

  await prisma.$transaction(async (tx) => {
    // הסטטוס קודם: אם מישהו הכריע במקביל, שום שורה לא זזה
    const { count } = await tx.fridaySwap.updateMany({
      where: { id: offer.id, status: "pending" },
      data: { status: "done", decidedAt: new Date() },
    });
    if (count === 0) throw new FridaySwapError("ההצעה כבר הוכרעה");

    /*
     * מחיקה ואז יצירה, ולא update.
     *
     * `@@unique([date, employeeId])` הופך החלפה לבלתי אפשרית בעדכון
     * ישיר: השורה הראשונה שזזה מתנגשת עם השנייה שעדיין לא זזה. בתוך
     * טרנזקציה אחת אין שום רגע שבו מישהו רואה מצב חלקי.
     */
    const rows = await tx.fridayPlan.findMany({
      where: { id: { in: moves.map((m) => m.planId) } },
    });
    await tx.fridayPlan.deleteMany({
      where: { id: { in: moves.map((m) => m.planId) } },
    });
    await tx.fridayPlan.createMany({
      data: rows.map((r) => {
        const move = moves.find((m) => m.planId === r.id)!;
        return {
          id: r.id,
          date: r.date,
          role: r.role,
          isClosing: r.isClosing,
          position: r.position,
          employeeId: move.employeeId,
          // נשאר ידני: זו החלטה של אדם, ו"יצירה מחדש" לא תדרוס אותה
          source: "manual",
          publishedAt: r.publishedAt,
        };
      }),
    });

    /*
     * ואם השבוע כבר קיים — גם הסידור. בלי זה הסבב והסידור היו אומרים
     * שני דברים שונים, ומי שבודק את המשמרת שלו היה רואה את הישן.
     */
    for (const move of moves) {
      const row = rows.find((r) => r.id === move.planId)!;
      const from = zonedMidnight(row.date);

      /*
       * המשבצת מזוהה לפי **מי יושב בה עכשיו**, ולא לפי המיקום: אם המנהל
       * הזיז אנשים ידנית בסידור, המיקום בסבב כבר אינו מצביע על אותה
       * משבצת. מי שמוסר את המשמרת הוא הזיהוי היציב.
       */
      const current = await tx.assignment.findFirst({
        where: {
          employeeId: row.employeeId,
          slot: { dayOfWeek: 5, role: row.role, date: { gte: from, lt: addDays(from, 1) } },
        },
        select: { slotId: true },
      });
      if (!current) continue;

      await tx.assignment.update({
        where: { slotId: current.slotId },
        data: { employeeId: move.employeeId, manualOverride: true, pinned: true },
      });
    }
  });

  const recipients = [offer.offeredById, offer.claimedById].filter(
    (id): id is string => Boolean(id),
  );
  await notify(recipients, {
    kind: "swap-approved",
    title: offer.mode === "trade" ? "ההחלפה אושרה" : "המסירה אושרה",
    body:
      offer.mode === "trade" && offer.claimedPlan
        ? `${formatDayMonth(offer.offeredPlan.date)} הוחלף ב-${formatDayMonth(offer.claimedPlan.date)}.`
        : `${formatDayMonth(offer.offeredPlan.date)} עבר.`,
    url: "/me/fridays",
  });
}

/** השישיים של העובד שאפשר להציע — כלומר לפני פרסום השבוע */
export async function myOfferableFridays(args: {
  employeeId: string;
  dates: Date[];
}): Promise<{ id: string; date: string; isClosing: boolean }[]> {
  if (args.dates.length === 0) return [];
  const sorted = [...args.dates].sort((a, b) => a.getTime() - b.getTime());
  const rows = await prisma.fridayPlan.findMany({
    where: {
      employeeId: args.employeeId,
      publishedAt: { not: null },
      date: {
        gte: zonedMidnight(sorted[0]),
        lt: addDays(zonedMidnight(sorted[sorted.length - 1]), 1),
      },
    },
    select: { id: true, date: true, isClosing: true },
    orderBy: { date: "asc" },
  });
  return rows.map((r) => ({
    id: r.id,
    date: dateKey(r.date),
    isClosing: r.isClosing,
  }));
}
