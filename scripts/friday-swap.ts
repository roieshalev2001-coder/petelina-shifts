/**
 * מקצה לקצה של חילופי שישי.
 *
 * הבדיקות הטהורות ב-friday-swaps.test.ts מכסות את הכללים; כאן נבדק מה
 * שקורה **במסד**, וזה מה שאי אפשר לבדוק בלעדיו:
 *
 * - תפיסה אינה מזיזה את השיבוץ — הוא עובר רק באישור
 * - שני עובדים שתופסים את אותה הצעה: אחד מקבל, השני מקבל סירוב
 * - **החלפה מזיזה את שתי השורות** — זו הבדיקה החשובה ביותר כאן, כי
 *   `@@unique([date, employeeId])` הופך עדכון ישיר לבלתי אפשרי, ומצב
 *   ביניים היה משאיר אחד משובץ פעמיים ואת השני בכלל לא
 * - אי אפשר להכריע פעמיים
 *
 * מוחק ובונה שיבוצים, ולכן עובר דרך אותו שער כמו db:seed ו-test:swap:
 *
 *   FRIDAY_DB="postgres://…" npm run test:friday
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
  process.env.DATABASE_URL = requireDevDatabase("FRIDAY_DB", "npm run test:friday");

  const { prisma } = await import("@/lib/db");
  const { offerFriday, claimFriday, decideFridaySwap, FridaySwapError } = await import(
    "@/lib/friday-swap-board"
  );
  const { zonedTime } = await import("@/lib/time");

  const waiters = await prisma.employee.findMany({
    where: { active: true, roles: { contains: "waiter" } },
    select: { id: true, fullName: true },
    take: 3,
  });
  if (waiters.length < 3) {
    throw new Error("צריך לפחות שלושה מלצרים פעילים במסד הפיתוח");
  }
  const [a, b, c] = waiters;

  // שני שישיים רחוקים, כדי לא להתנגש בשבוע קיים
  const friday1 = zonedTime(2027, 3, 5);
  const friday2 = zonedTime(2027, 3, 12);
  const marker = { date: { in: [friday1, friday2] } };

  await prisma.fridaySwap.deleteMany({ where: { offeredPlan: marker } });
  await prisma.fridayPlan.deleteMany({ where: marker });

  const [planA, planB] = await Promise.all([
    prisma.fridayPlan.create({
      data: {
        date: friday1,
        role: "waiter",
        position: 1,
        employeeId: a.id,
        source: "manual",
        publishedAt: new Date(),
      },
    }),
    prisma.fridayPlan.create({
      data: {
        date: friday2,
        role: "waiter",
        position: 1,
        employeeId: b.id,
        source: "manual",
        publishedAt: new Date(),
      },
    }),
  ]);

  // ---- מסירה: תפיסה אינה מזיזה ----
  await offerFriday({ planId: planA.id, employeeId: a.id, mode: "give" });
  await claimFriday({ offerId: (await open(planA.id)).id, employeeId: c.id });

  check(
    "תפיסה אינה מזיזה את השיבוץ",
    (await prisma.fridayPlan.findUniqueOrThrow({ where: { id: planA.id } })).employeeId,
    a.id,
  );

  // ---- תופס שני נדחה ----
  const offer1 = await prisma.fridaySwap.findFirstOrThrow({
    where: { offeredPlanId: planA.id },
    select: { id: true },
  });
  let second = "";
  try {
    await claimFriday({ offerId: offer1.id, employeeId: b.id });
  } catch (e) {
    second = e instanceof FridaySwapError ? e.message : String(e);
  }
  check("תופס שני מקבל סירוב", second.length > 0, true);

  // ---- אישור מעביר ----
  await decideFridaySwap({ offerId: offer1.id, approve: true });
  check(
    "אישור מעביר את השיבוץ",
    (await prisma.fridayPlan.findUniqueOrThrow({ where: { id: planA.id } })).employeeId,
    c.id,
  );

  let twice = "";
  try {
    await decideFridaySwap({ offerId: offer1.id, approve: true });
  } catch (e) {
    twice = e instanceof FridaySwapError ? e.message : String(e);
  }
  check("אי אפשר להכריע פעמיים", twice.length > 0, true);

  // ---- החלפה: שתי השורות, או אף אחת ----
  await prisma.fridayPlan.update({
    where: { id: planA.id },
    data: { employeeId: a.id },
  });
  await offerFriday({ planId: planA.id, employeeId: a.id, mode: "trade" });
  const tradeOffer = await open(planA.id);
  await claimFriday({
    offerId: tradeOffer.id,
    employeeId: b.id,
    inReturnPlanId: planB.id,
  });
  await decideFridaySwap({ offerId: tradeOffer.id, approve: true });

  const [afterA, afterB] = await Promise.all([
    prisma.fridayPlan.findUniqueOrThrow({ where: { id: planA.id } }),
    prisma.fridayPlan.findUniqueOrThrow({ where: { id: planB.id } }),
  ]);
  check("החלפה: השישי של א׳ עבר לב׳", afterA.employeeId, b.id);
  check("החלפה: השישי של ב׳ עבר לא׳", afterB.employeeId, a.id);
  check("המיקום נשמר בהחלפה", [afterA.position, afterB.position], [1, 1]);

  // ---- ניקוי ----
  await prisma.fridaySwap.deleteMany({ where: { offeredPlan: marker } });
  await prisma.fridayPlan.deleteMany({ where: marker });

  console.log(failures === 0 ? "\nהכול עבר." : `\n${failures} בדיקות נכשלו.`);
  process.exitCode = failures === 0 ? 0 : 1;
  await prisma.$disconnect();

  /** ההצעה הפתוחה על שיבוץ נתון */
  async function open(planId: string) {
    return prisma.fridaySwap.findFirstOrThrow({
      where: { offeredPlanId: planId, status: "open" },
      select: { id: true },
    });
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
