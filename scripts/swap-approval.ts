/**
 * מקצה לקצה של אישור החילוף.
 *
 * הבדיקות הטהורות ב-swaps.test.ts מכסות את מכונת המצבים; כאן נבדק מה
 * שקורה **במסד**: שהתפיסה אינה מזיזה את המשמרת, שהמשבצת נסגרת לתופס שני,
 * ושרק האישור מעביר אותה בפועל.
 *
 * מוחק ובונה שיבוצים, ולכן עובר דרך אותו שער כמו db:seed ו-test:e2e:
 *
 *   SWAP_DB="postgres://…" npm run test:swap
 */
import { requireDevDatabase } from "@/lib/dev-db";

let failures = 0;
function check(label: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) failures++;
  console.log(`${ok ? "✓" : "✗"} ${label}`);
  if (!ok) {
    console.log(`    ציפיתי: ${JSON.stringify(expected)}`);
    console.log(`    קיבלתי: ${JSON.stringify(actual)}`);
  }
}

async function main() {
  process.env.DATABASE_URL = requireDevDatabase("SWAP_DB", "npm run test:swap");

  const { prisma } = await import("@/lib/db");
  const { openSwapOffer, claimSwapOffer, decideSwapOffer, cancelSwapOffer, SwapError } =
    await import("@/lib/swap-board");

  const week = await prisma.week.findFirstOrThrow({
    orderBy: { weekStart: "desc" },
    select: { id: true, status: true },
  });
  // מסירה מותרת רק בשבוע שפורסם
  await prisma.week.update({ where: { id: week.id }, data: { status: "published" } });

  /*
   * במסד הפיתוח אין בהכרח מנהל — הבדיקות הקודמות ניקו אחריהן. יוצרים אחד
   * זמני, כי decideSwapOffer שומר את מזהה מי שהכריע.
   */
  const manager =
    (await prisma.employee.findFirst({ where: { canManage: true }, select: { id: true } })) ??
    (await prisma.employee.create({
      data: {
        fullName: "SWAP-מנהל בדיקה",
        roles: "",
        requiredShifts: 0,
        maxShifts: 0,
        seniority: 5,
        active: true,
        needsReview: false,
        canManage: true,
        token: `SWAP-${Date.now()}`,
      },
      select: { id: true },
    }));

  /*
   * משמרת עתידית: חלון המסירה נסגר 24 שעות לפני תחילתה, ומשבצת שכבר עברה
   * הייתה נדחית בבדיקת החתך ולא בכלל שאנחנו באים לבדוק.
   */
  const slot = await prisma.weekSlot.findFirstOrThrow({
    where: {
      role: "waiter",
      date: { gt: new Date(Date.now() + 3 * 24 * 3600_000) },
      assignment: { isNot: null },
    },
    select: { id: true, dayOfWeek: true, assignment: { select: { employeeId: true } } },
  });
  const owner = slot.assignment!.employeeId;

  // תופס כשיר: מלצר, לא הבעלים, ולא משובץ באותו יום
  const busyDays = new Set(
    (
      await prisma.assignment.findMany({
        where: { weekId: week.id },
        select: { employeeId: true, slot: { select: { dayOfWeek: true } } },
      })
    )
      .filter((a) => a.slot.dayOfWeek === slot.dayOfWeek)
      .map((a) => a.employeeId),
  );
  const claimers = (
    await prisma.employee.findMany({
      where: { active: true, id: { not: owner }, roles: { contains: "waiter" } },
      select: { id: true, fullName: true },
    })
  ).filter((e) => !busyDays.has(e.id));

  if (claimers.length < 2) throw new Error("צריך שני תופסים כשירים לבדיקה");
  const [first, second] = claimers;

  await prisma.swapOffer.deleteMany({ where: { slotId: slot.id } });

  // ---- מסירה ----
  // openSwapOffer אינה מחזירה את ההצעה, ולכן היא נשלפת לפי המשבצת
  await openSwapOffer({ employeeId: owner, slotId: slot.id });
  const offer = await prisma.swapOffer.findFirstOrThrow({
    where: { slotId: slot.id },
    select: { id: true },
  });
  check("ההצעה נפתחה", (await prisma.swapOffer.findUniqueOrThrow({ where: { id: offer.id } })).status, "open");

  // ---- תפיסה ----
  await claimSwapOffer({ employeeId: first.id, offerId: offer.id });
  const afterClaim = await prisma.swapOffer.findUniqueOrThrow({ where: { id: offer.id } });
  check("התפיסה מעבירה ל-pending", afterClaim.status, "pending");
  check("ומי שתפס נרשם", afterClaim.claimedById, first.id);
  check(
    "המשמרת עדיין רשומה על מי שהציע",
    (await prisma.assignment.findUniqueOrThrow({ where: { slotId: slot.id } })).employeeId,
    owner,
  );
  check("openSlotId נשאר תפוס וסוגר את המשבצת", afterClaim.openSlotId, slot.id);

  // ---- תופס שני נחסם ----
  let blocked = "";
  try {
    await claimSwapOffer({ employeeId: second.id, offerId: offer.id });
  } catch (e) {
    blocked = e instanceof SwapError ? e.message : String(e);
  }
  check("תופס שני נדחה", blocked.includes("הקדים"), true);

  // ---- המוסר אינו יכול לבטל בזמן ההמתנה ----
  let cancelErr = "";
  try {
    await cancelSwapOffer({ employeeId: owner, offerId: offer.id });
  } catch (e) {
    cancelErr = e instanceof SwapError ? e.message : String(e);
  }
  check("ביטול בזמן המתנה נחסם", cancelErr.includes("המנהל"), true);

  // ---- דחייה מחזירה ללוח ----
  await decideSwapOffer({ offerId: offer.id, managerId: manager.id, approve: false });
  const afterReject = await prisma.swapOffer.findUniqueOrThrow({ where: { id: offer.id } });
  check("דחייה מחזירה ל-open", afterReject.status, "open");
  check("ומשחררת את מי שתפס", afterReject.claimedById, null);
  check(
    "והמשמרת עדיין של מי שהציע",
    (await prisma.assignment.findUniqueOrThrow({ where: { slotId: slot.id } })).employeeId,
    owner,
  );

  // ---- תפיסה שנייה ואישור ----
  await claimSwapOffer({ employeeId: second.id, offerId: offer.id });
  await decideSwapOffer({ offerId: offer.id, managerId: manager.id, approve: true });
  const afterApprove = await prisma.swapOffer.findUniqueOrThrow({ where: { id: offer.id } });
  check("אישור מעביר ל-claimed", afterApprove.status, "claimed");
  check("openSlotId משתחרר", afterApprove.openSlotId, null);
  check("ומי אישר נשמר", afterApprove.decidedById, manager.id);

  const moved = await prisma.assignment.findUniqueOrThrow({ where: { slotId: slot.id } });
  check("**המשמרת עברה בפועל**", moved.employeeId, second.id);
  check("והיא נעוצה, כדי שבניית סידור לא תמחק אותה", moved.pinned, true);

  // ---- אין הכרעה כפולה ----
  let twice = "";
  try {
    await decideSwapOffer({ offerId: offer.id, managerId: manager.id, approve: true });
  } catch (e) {
    twice = e instanceof SwapError ? e.message : String(e);
  }
  check("אי אפשר להכריע פעמיים", twice.length > 0, true);

  // ניקוי: החזרת המשמרת והמצב
  await prisma.assignment.update({ where: { slotId: slot.id }, data: { employeeId: owner } });
  await prisma.swapOffer.deleteMany({ where: { slotId: slot.id } });
  await prisma.week.update({ where: { id: week.id }, data: { status: week.status } });
  await prisma.employee.deleteMany({ where: { fullName: "SWAP-מנהל בדיקה" } });

  console.log(failures === 0 ? "\nהכול עבר." : `\n${failures} בדיקות נכשלו.`);
  process.exitCode = failures === 0 ? 0 : 1;
  await prisma.$disconnect();
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
