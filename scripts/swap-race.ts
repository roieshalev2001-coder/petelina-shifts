/**
 * הוכחה שמנגנון "הראשון תופס" באמת עמיד למרוץ.
 *
 * הערובה יושבת ב-Postgres ולא ב-TypeScript, ולכן אי אפשר לבדוק אותה
 * ב-`npm test` — כל הבדיקות שם טהורות ואינן נוגעות במסד. הסקריפט הזה מריץ
 * את הקוד האמיתי מול מסד אמיתי.
 *
 * הרצה: SWAP_RACE_DB="postgres://…" npm run swap:race
 *
 * הסקריפט יוצר שבוע גרוטאה, מריץ עליו את הבדיקות, ומוחק אותו בסוף.
 * הוא מסרב לרוץ בלי SWAP_RACE_DB מפורש, ולעולם אינו נוגע ב-DATABASE_URL
 * של הסביבה — שהוא מסד הייצור.
 */
import "dotenv/config";

let failures = 0;

function check(name: string, ok: boolean, detail?: string) {
  console.log(`${ok ? "  ✔" : "  ✖"} ${name}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures++;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const url = process.env.SWAP_RACE_DB;
  if (!url) {
    throw new Error(
      'הסקריפט הזה כותב ומוחק נתונים. הרץ אותו רק מול מסד פיתוח:\n' +
        '  SWAP_RACE_DB="postgres://…" npm run swap:race',
    );
  }
  if (url === process.env.DATABASE_URL) {
    throw new Error("SWAP_RACE_DB זהה ל-DATABASE_URL — סירוב להריץ מול מסד הייצור");
  }

  // מפנים את שכבת המסד של האפליקציה למסד הגרוטאה *לפני* שהיא נטענת, כדי
  // שהבדיקה תריץ את הקוד האמיתי ולא עותק שלו.
  process.env.DATABASE_URL = url;

  const { prisma } = await import("../src/lib/db");
  const { claimSwapOffer, openSwapOffer, SwapError } = await import(
    "../src/lib/swap-board"
  );
  const { buildSchedule } = await import("../src/lib/weeks");

  const tag = `race-${Date.now()}`;
  let weekId = "";

  try {
    // --- שבוע גרוטאה: יום שלישי הבא, הרבה מעבר לחלון 24 השעות ---
    const weekStart = new Date();
    weekStart.setHours(0, 0, 0, 0);
    weekStart.setDate(weekStart.getDate() - weekStart.getDay() + 7);
    const tuesday = new Date(weekStart);
    tuesday.setDate(tuesday.getDate() + 2);
    const wednesday = new Date(weekStart);
    wednesday.setDate(wednesday.getDate() + 3);

    const week = await prisma.week.create({
      data: {
        weekStart,
        opensAt: new Date(),
        deadline: new Date(),
        status: "published",
        publishedAt: new Date(),
        slots: {
          create: [
            { date: tuesday, dayOfWeek: 2, role: "waiter", period: "evening", startTime: "16:00", endTime: "22:15", sortOrder: 0 },
            { date: tuesday, dayOfWeek: 2, role: "waiter", period: "evening", startTime: "17:30", endTime: "22:15", sortOrder: 1 },
            { date: wednesday, dayOfWeek: 3, role: "waiter", period: "evening", startTime: "16:00", endTime: "22:15", sortOrder: 2 },
          ],
        },
      },
      include: { slots: { orderBy: { sortOrder: "asc" } } },
    });
    weekId = week.id;
    const [slotA, slotB, slotC] = week.slots;

    const employees = await Promise.all(
      ["giver", "c1", "c2", "c3", "c4"].map((name, i) =>
        prisma.employee.create({
          data: {
            fullName: `${tag}-${name}`,
            roles: "waiter",
            token: `${tag}-${i}`,
            maxShifts: 6,
          },
        }),
      ),
    );
    const [giver, ...claimers] = employees;

    async function assign(slotId: string, employeeId: string, start: string, end: string) {
      await prisma.assignment.deleteMany({ where: { slotId } });
      await prisma.assignment.create({
        data: { weekId, slotId, employeeId, actualStart: start, actualEnd: end },
      });
    }

    // ---------------------------------------------------------------
    console.log("\n1. ארבעה עובדים תופסים את אותה משמרת באותו רגע");
    // ---------------------------------------------------------------
    await assign(slotA.id, giver.id, "16:00", "22:15");
    await openSwapOffer({ employeeId: giver.id, slotId: slotA.id });
    const offerA = (await prisma.swapOffer.findUniqueOrThrow({
      where: { openSlotId: slotA.id },
    })).id;

    const results = await Promise.allSettled(
      claimers.map((c) => claimSwapOffer({ employeeId: c.id, offerId: offerA })),
    );
    const won = results.filter((r) => r.status === "fulfilled");
    const lost = results.filter((r) => r.status === "rejected");

    check("בדיוק אחד הצליח", won.length === 1, `${won.length} מתוך ${results.length}`);
    check(
      "כל השאר נדחו עם שגיאת מרוץ",
      lost.length === 3 && lost.every((r) => (r as PromiseRejectedResult).reason instanceof SwapError),
      lost.map((r) => (r as PromiseRejectedResult).reason?.message).join(" | "),
    );

    const rowsA = await prisma.assignment.findMany({ where: { slotId: slotA.id } });
    check("למשבצת יש בדיוק שיבוץ אחד", rowsA.length === 1, `${rowsA.length}`);

    const finalOffer = await prisma.swapOffer.findUniqueOrThrow({ where: { id: offerA } });
    check("השיבוץ עבר למי שזכה", rowsA[0]?.employeeId === finalOffer.claimedById);
    check("ההצעה סומנה כנתפסה", finalOffer.status === "claimed");
    check("openSlotId שוחרר", finalOffer.openSlotId === null);
    check("השיבוץ ננעץ", rowsA[0]?.pinned === true);
    check(
      "השעות הן המשבצת המלאה ולא מקוצרות",
      rowsA[0]?.actualStart === "16:00" && rowsA[0]?.actualEnd === "22:15" && rowsA[0]?.shortened === false,
    );

    // ---------------------------------------------------------------
    console.log("\n2. שזירה דטרמיניסטית — השנייה נחסמת עד ה-commit של הראשונה");
    // ---------------------------------------------------------------
    await assign(slotB.id, giver.id, "17:30", "22:15");
    await openSwapOffer({ employeeId: giver.id, slotId: slotB.id });
    const offerB = (await prisma.swapOffer.findUniqueOrThrow({
      where: { openSlotId: slotB.id },
    })).id;

    let t1Cas: number | null = null;
    let release!: () => void;
    const gate = new Promise<void>((r) => { release = r; });

    const t1 = prisma.$transaction(
      async (tx) => {
        const r = await tx.swapOffer.updateMany({
          where: { id: offerB, status: "open" },
          data: { status: "claimed", claimedById: claimers[0].id, openSlotId: null },
        });
        t1Cas = r.count;
        await gate; // מחזיקים את הטרנזקציה פתוחה
        return r.count;
      },
      { timeout: 20_000 },
    );

    while (t1Cas === null) await sleep(10);
    check("הראשונה תפסה", t1Cas === 1);

    const t2 = prisma.$transaction(
      async (tx) => {
        const r = await tx.swapOffer.updateMany({
          where: { id: offerB, status: "open" },
          data: { status: "claimed", claimedById: claimers[1].id, openSlotId: null },
        });
        return r.count;
      },
      { timeout: 20_000 },
    );

    const raced = await Promise.race([t2.then(() => "settled"), sleep(700).then(() => "blocked")]);
    check("השנייה נחסמה על נעילת השורה", raced === "blocked", String(raced));

    release();
    await t1;
    check("אחרי ה-commit השנייה מקבלת count=0", (await t2) === 0);

    // ---------------------------------------------------------------
    console.log("\n3. אותו עובד, שתי לשוניות, שתי משמרות באותו יום");
    // ---------------------------------------------------------------
    // בלי הנעילה המייעצת שתיהן היו נכתבות: בדיקת ההתנגשות היא קריאה,
    // ו-READ COMMITTED לבדו אינו מגן עליה.
    await prisma.assignment.deleteMany({ where: { weekId } });
    await prisma.swapOffer.deleteMany({ where: { weekId } });

    const twin = await Promise.all(
      [slotA, slotB].map(async (s) => {
        await assign(s.id, giver.id, s.startTime, "22:15");
        await openSwapOffer({ employeeId: giver.id, slotId: s.id });
        return (await prisma.swapOffer.findUniqueOrThrow({ where: { openSlotId: s.id } })).id;
      }),
    );

    const sameDay = await Promise.allSettled(
      twin.map((offerId) => claimSwapOffer({ employeeId: claimers[0].id, offerId })),
    );
    const sameDayWon = sameDay.filter((r) => r.status === "fulfilled").length;
    check("רק אחת מהשתיים נתפסה", sameDayWon === 1, `${sameDayWon}`);

    const claimerDay = await prisma.assignment.count({
      where: { weekId, employeeId: claimers[0].id },
    });
    check("לעובד יש משמרת אחת באותו יום", claimerDay === 1, `${claimerDay}`);

    // ---------------------------------------------------------------
    console.log("\n4. חילוף שורד הרצה חוזרת של האלגוריתם");
    // ---------------------------------------------------------------
    await prisma.assignment.deleteMany({ where: { weekId } });
    await prisma.swapOffer.deleteMany({ where: { weekId } });
    await assign(slotC.id, giver.id, "16:00", "22:15");
    await openSwapOffer({ employeeId: giver.id, slotId: slotC.id });
    const offerC = (await prisma.swapOffer.findUniqueOrThrow({
      where: { openSlotId: slotC.id },
    })).id;
    await claimSwapOffer({ employeeId: claimers[2].id, offerId: offerC });

    try {
      await buildSchedule(weekId);
    } catch (e) {
      // אין תבנית/הגשות בשבוע הגרוטאה — לא מעניין. מה שחשוב הוא ה-deleteMany
      console.log(`     (buildSchedule: ${e instanceof Error ? e.message : e})`);
    }

    const survivor = await prisma.assignment.findFirst({ where: { slotId: slotC.id } });
    check("השיבוץ שנתפס שרד את בניית הסידור", survivor?.employeeId === claimers[2].id);

    // --- ניקוי ---
    await prisma.week.delete({ where: { id: weekId } }); // Cascade מנקה הכול
    await prisma.employee.deleteMany({ where: { fullName: { startsWith: tag } } });
    weekId = "";
  } finally {
    if (weekId) {
      await prisma.week.delete({ where: { id: weekId } }).catch(() => {});
      await prisma.employee.deleteMany({ where: { fullName: { startsWith: tag } } }).catch(() => {});
    }
    await prisma.$disconnect();
  }

  console.log(
    failures === 0 ? "\nכל הבדיקות עברו ✓\n" : `\n${failures} בדיקות נכשלו ✖\n`,
  );
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(`\n${e instanceof Error ? e.message : e}\n`);
  process.exit(1);
});
