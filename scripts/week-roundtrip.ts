/**
 * מוכיח שגיבוי ההגשות שורד **מחיקת שבוע ופתיחה מחדש**.
 *
 * זה התרחיש היחיד שבשבילו נבנו המפתחות הטבעיים ב-scripts/week-data.ts:
 * `Availability` מצביע על `slotId`, וכל פתיחת שבוע מייצרת `WeekSlot` חדשים
 * עם `cuid` חדש. גיבוי ששומר מזהים היה נראה תקין בבדיקה רגילה ונכשל בדיוק
 * ברגע שבו זקוקים לו.
 *
 * הסקריפט מוחק שבוע ובונה אותו מחדש, ולכן הוא עובר דרך אותו שער כמו
 * db:seed ו-test:e2e ומסרב לרוץ מול DATABASE_URL:
 *
 *   ROUNDTRIP_DB="postgres://…" npm run test:roundtrip
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
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
  const url = requireDevDatabase("ROUNDTRIP_DB", "npm run test:roundtrip");
  process.env.DATABASE_URL = url;

  const { prisma } = await import("@/lib/db");
  const { createWeek } = await import("@/lib/weeks");
  const { defaultDeadlineFor, startOfWeek, addDays } = await import("@/lib/time");

  const dir = mkdtempSync(join(tmpdir(), "roundtrip-"));
  const file = join(dir, "backup.json");
  const run = (...args: string[]) =>
    execFileSync("npx", ["tsx", "scripts/week-data.ts", ...args], {
      env: { ...process.env, DATABASE_URL: url },
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });

  try {
    // ---- הכנה: שבוע נקי עם סימונים סינתטיים ----
    await prisma.week.deleteMany({});
    const weekStart = addDays(startOfWeek(new Date()), 7);
    const week = await createWeek({
      weekStart,
      deadline: defaultDeadlineFor(weekStart),
    });

    /*
     * הטלפון הוא המפתח של הגיבוי, ולעובדי מסד הפיתוח אין טלפונים. בלי
     * ההשמה הזו הבדיקה רצה על אפס שורות ומדווחת ירוק על כלום — בדיוק
     * הכשל השקט שהיא אמורה לתפוס.
     */
    const picked = await prisma.employee.findMany({
      where: { active: true },
      select: { id: true, roles: true },
      orderBy: { fullName: "asc" },
      take: 6,
    });
    if (picked.length === 0) throw new Error("אין עובדים פעילים במסד הפיתוח");
    for (const [i, e] of picked.entries()) {
      await prisma.employee.update({
        where: { id: e.id },
        data: { phone: `97250000${String(100 + i)}` },
      });
    }
    const employees = picked;
    const slots = await prisma.weekSlot.findMany({
      where: { weekId: week.id },
      select: { id: true, role: true },
    });

    let made = 0;
    for (const e of employees) {
      const mine = slots.filter((s) => e.roles.includes(s.role)).slice(0, 5);
      for (const [i, s] of mine.entries()) {
        await prisma.availability.create({
          data: {
            weekId: week.id,
            employeeId: e.id,
            slotId: s.id,
            state: i % 2 === 0 ? "preferred" : "available",
            // ערכים לא-null, כדי שהשוואה שטחית לא תעבור בטעות
            earliestStart: i === 1 ? "09:30" : null,
            latestEnd: i === 2 ? "17:45" : null,
            note: i === 3 ? "הערה לבדיקה" : null,
          },
        });
        made++;
      }
      await prisma.submission.create({
        data: { weekId: week.id, employeeId: e.id, submittedAt: new Date(), note: "הגשה" },
      });
    }
    console.log(`הוכנו ${made} סימונים ו-${employees.length} הגשות\n`);

    // ---- גיבוי ----
    run("backup", file);
    const before = await prisma.availability.findMany({
      where: { weekId: week.id },
      select: { state: true, earliestStart: true, latestEnd: true, note: true },
      orderBy: [{ employeeId: "asc" }, { slotId: "asc" }],
    });

    // ---- מחיקה ופתיחה מחדש: כאן כל ה-slotId מתחלפים ----
    const oldSlotIds = new Set(slots.map((s) => s.id));
    await prisma.week.delete({ where: { id: week.id } });
    check("המחיקה מחקה גם את הסימונים", await prisma.availability.count(), 0);
    check("והגשות", await prisma.submission.count(), 0);

    const fresh = await createWeek({
      weekStart,
      deadline: defaultDeadlineFor(weekStart),
    });
    const newSlots = await prisma.weekSlot.findMany({
      where: { weekId: fresh.id },
      select: { id: true },
    });
    check(
      "מזהי המשבצות אכן התחלפו",
      newSlots.some((s) => oldSlotIds.has(s.id)),
      false,
    );

    // ---- שחזור ----
    const dry = run("restore", file);
    check("הרצה יבשה לא כותבת", await prisma.availability.count(), 0);
    if (!dry.includes(`${made} מתוך ${made}`)) {
      failures++;
      console.log(`✗ ההרצה היבשה לא דיווחה ${made} סימונים`);
    } else {
      console.log(`✓ ההרצה היבשה מצאה ${made} מתוך ${made}`);
    }

    run("restore", file, "--apply");
    check("כל הסימונים חזרו", await prisma.availability.count(), made);
    check("כל ההגשות חזרו", await prisma.submission.count(), employees.length);

    const after = await prisma.availability.findMany({
      where: { weekId: fresh.id },
      select: { state: true, earliestStart: true, latestEnd: true, note: true },
      orderBy: [{ employeeId: "asc" }, { slotId: "asc" }],
    });
    check("השדות זהים לגמרי, לא רק הכמות", after, before);

    // ---- אידמפוטנטיות ----
    run("restore", file, "--apply");
    check("שחזור חוזר אינו משכפל", await prisma.availability.count(), made);

    // ---- טלפון שהשתנה מדווח ולא נשתל על אדם אחר ----
    const victim = employees[0];
    await prisma.availability.deleteMany({ where: { employeeId: victim.id } });
    await prisma.employee.update({
      where: { id: victim.id },
      data: { phone: "972500000077" },
    });
    const out = run("restore", file);
    check(
      "עובד שהטלפון שלו השתנה מדווח כלא-נמצא",
      out.includes("עובדים שלא נמצאו לפי טלפון"),
      true,
    );
    check(
      "והסימונים שלו אינם משוחזרים לאדם אחר",
      await prisma.availability.count({ where: { employeeId: victim.id } }),
      0,
    );

    await prisma.week.deleteMany({});
    console.log(failures === 0 ? "\nהכול עבר." : `\n${failures} בדיקות נכשלו.`);
    process.exitCode = failures === 0 ? 0 : 1;
  } finally {
    rmSync(dir, { recursive: true, force: true });
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
