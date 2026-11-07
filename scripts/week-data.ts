/**
 * גיבוי ושחזור של ההגשות לשבוע.
 *
 * למה זה קיים: `deleteWeek` עושה `prisma.week.delete`, ו-`Availability`
 * ו-`Submission` תלויים בשבוע ב-Cascade. כלומר לחיצה אחת מוחקת לצמיתות את
 * כל מה שהעובדים סימנו. הדיאלוג אמנם מפרט מה יאבד, אבל אזהרה אינה גיבוי.
 *
 * (בנייה מחדש של הסידור, לעומת זאת, בטוחה: היא נוגעת רק ב-Assignment שאינם
 * נעוצים, ולא בהגשות בכלל.)
 *
 *   npm run week:backup                            השבוע הפתוח
 *   npm run week:backup -- --week 2026-08-23       שבוע לפי תאריך התחלה
 *   npm run week:restore -- backups/x.json         יבש, ברירת המחדל
 *   npm run week:restore -- backups/x.json --apply
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { prisma } from "@/lib/db";
import { formatPhone } from "@/lib/phone";
import { addDays, fromDateInputValue, toDateInputValue } from "@/lib/time";

/*
 * מפתחות טבעיים, לא מזהים.
 *
 * `Availability` מצביע על slotId, ו-WeekSlot נוצר מחדש עם cuid חדש בכל
 * פתיחת שבוע. גיבוי ששומר מזהים היה חסר ערך בדיוק בתרחיש שבשבילו הוא נבנה
 * — שבוע שנמחק ונפתח מחדש. הצירוף למטה יציב כי WeekSlot הוא העתק מוקפא של
 * TemplateSlot, ונשמר לפי [weekId, dayOfWeek, sortOrder].
 */
function slotKey(s: {
  dayOfWeek: number;
  role: string;
  startTime: string;
  endTime: string;
  sortOrder: number;
}): string {
  return [s.dayOfWeek, s.role, s.startTime, s.endTime, s.sortOrder].join("|");
}

type Backup = {
  version: 1;
  takenAt: string;
  week: {
    /** הרגע המדויק. זה מה שהשחזור משתמש בו — חסין לאזור זמן */
    weekStart: string;
    /** אותו יום בשעון ישראל, לתצוגה ול---week. ראה toDateInputValue */
    weekStartDate: string;
    deadline: string;
    status: string;
    closingTimes: string;
  };
  /** לזיהוי בעין בלבד — השחזור מסתמך על phone */
  employees: { phone: string; fullName: string }[];
  submissions: {
    phone: string;
    submittedAt: string | null;
    note: string | null;
  }[];
  marks: {
    phone: string;
    slot: string;
    state: string;
    earliestStart: string | null;
    latestEnd: string | null;
    note: string | null;
  }[];
};

/*
 * איתור שבוע לפי תאריך — או לפי הרגע המדויק מתוך הגיבוי.
 *
 * `exact` הוא ה-Date כפי שנשמר בקובץ. הוא מדויק לאלפית ולכן חסין לחלוטין
 * לאזור הזמן של התהליך, וזה המסלול המועדף.
 *
 * המסלול של `--week YYYY-MM-DD` עובר דרך `fromDateInputValue` ולא דרך
 * `new Date("…T00:00:00")`. זו לא קוסמטיקה: `weekStart` נוצר ב-`startOfWeek`
 * עם `setHours` מקומי, ולכן "אותו יום" תלוי בשעון שבו רץ התהליך. הגרסה
 * הראשונה שלי בנתה את התאריך בדרך אחרת מזו שבה הוא נשמר, וההשוואה נכשלה
 * בשלוש שעות בדיוק — ראה ההערה מעל toDateInputValue ב-src/lib/time.ts.
 */
async function findWeek(weekStart?: string, exact?: Date) {
  if (exact) {
    const week = await prisma.week.findUnique({ where: { weekStart: exact } });
    if (week) return week;
    console.error(
      `לא נמצא שבוע שמתחיל ב-${toDateInputValue(exact)}.\n` +
        `אם השבוע נמחק ונפתח מחדש, התאריך זהה אך הרגע המדויק שונה — ` +
        `הרץ עם --week ${toDateInputValue(exact)}.`,
    );
    process.exit(1);
  }

  if (weekStart) {
    const target = fromDateInputValue(weekStart);
    /*
     * טווח יום שלם ולא השוואה מדויקת. שבוע שנפתח מחדש עשוי לשבת על אותו
     * יום קלנדרי בשעה אחרת (למשל אם נוצר בעבר תחת שעון UTC), ואת זה
     * השוואה מדויקת הייתה מפספסת בשקט.
     */
    const week = await prisma.week.findFirst({
      where: { weekStart: { gte: target, lt: addDays(target, 1) } },
    });
    if (!week) {
      console.error(`לא נמצא שבוע שמתחיל ב-${weekStart}.`);
      process.exit(1);
    }
    return week;
  }
  const week = await prisma.week.findFirst({
    where: { status: "open" },
    orderBy: { weekStart: "asc" },
  });
  if (!week) {
    console.error("אין שבוע פתוח. יש לציין --week YYYY-MM-DD.");
    process.exit(1);
  }
  return week;
}

async function backup(args: string[]) {
  const week = await findWeek(
    args.includes("--week") ? args[args.indexOf("--week") + 1] : undefined,
  );

  const [slots, marks, submissions] = await Promise.all([
    prisma.weekSlot.findMany({
      where: { weekId: week.id },
      select: {
        id: true,
        dayOfWeek: true,
        role: true,
        startTime: true,
        endTime: true,
        sortOrder: true,
      },
    }),
    prisma.availability.findMany({
      where: { weekId: week.id },
      select: {
        slotId: true,
        state: true,
        earliestStart: true,
        latestEnd: true,
        note: true,
        employee: { select: { phone: true, fullName: true } },
      },
    }),
    prisma.submission.findMany({
      where: { weekId: week.id },
      select: {
        submittedAt: true,
        note: true,
        employee: { select: { phone: true, fullName: true } },
      },
    }),
  ]);

  const keyById = new Map(slots.map((s) => [s.id, slotKey(s)]));
  const people = new Map<string, string>();
  const noPhone: string[] = [];

  const remember = (e: { phone: string | null; fullName: string }) => {
    if (!e.phone) {
      if (!noPhone.includes(e.fullName)) noPhone.push(e.fullName);
      return null;
    }
    people.set(e.phone, e.fullName);
    return e.phone;
  };

  const data: Backup = {
    version: 1,
    takenAt: new Date().toISOString(),
    week: {
      weekStart: week.weekStart.toISOString(),
      weekStartDate: toDateInputValue(week.weekStart),
      deadline: week.deadline.toISOString(),
      status: week.status,
      closingTimes: week.closingTimes,
    },
    employees: [],
    submissions: [],
    marks: [],
  };

  for (const s of submissions) {
    const phone = remember(s.employee);
    if (!phone) continue;
    data.submissions.push({
      phone,
      submittedAt: s.submittedAt?.toISOString() ?? null,
      note: s.note,
    });
  }

  for (const m of marks) {
    const phone = remember(m.employee);
    const key = keyById.get(m.slotId);
    if (!phone || !key) continue;
    data.marks.push({
      phone,
      slot: key,
      state: m.state,
      earliestStart: m.earliestStart,
      latestEnd: m.latestEnd,
      note: m.note,
    });
  }

  data.employees = [...people].map(([phone, fullName]) => ({ phone, fullName }));

  const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const target =
    args.find((a) => a.endsWith(".json")) ??
    `backups/week-${data.week.weekStartDate}-${stamp}.json`;
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, `${JSON.stringify(data, null, 2)}\n`, "utf8");

  console.log(`שבוע ${data.week.weekStartDate} · סטטוס ${week.status}`);
  console.log(`  הגשות:   ${data.submissions.length}`);
  console.log(`  סימונים: ${data.marks.length}`);
  console.log(`  עובדים:  ${data.employees.length}`);
  if (noPhone.length > 0) {
    /*
     * עובד בלי טלפון אינו ניתן לשחזור — הטלפון הוא המפתח. הוא גם אינו יכול
     * להיכנס למערכת בכלל, ולכן זה מצב שלא אמור לקרות. אם קרה, עדיף לצעוק.
     */
    console.log(
      `\nלא נכללו — אין להם טלפון (${noPhone.length}): ${noPhone.join(", ")}`,
    );
  }
  console.log(`\nנשמר: ${target}`);
}

async function restore(args: string[]) {
  const file = args.find((a) => a.endsWith(".json"));
  if (!file) {
    console.error("שימוש: week:restore -- backups/<קובץ>.json [--apply]");
    process.exit(1);
  }
  const apply = args.includes("--apply");
  const data = JSON.parse(readFileSync(file, "utf8")) as Backup;
  if (data.version !== 1) {
    console.error(`גרסת קובץ לא מוכרת: ${data.version}`);
    process.exit(1);
  }

  /*
   * ברירת המחדל היא הרגע המדויק מהקובץ, לא תאריך. שבוע נמצא לפי `weekStart`
   * שהוא `@unique`, ולכן התאמה מדויקת היא הדרך הבטוחה — היא לא תלויה בשעון
   * שבו רץ התהליך. `--week` נשאר למקרה שהשבוע נפתח מחדש ברגע אחר באותו יום.
   */
  const week = args.includes("--week")
    ? await findWeek(args[args.indexOf("--week") + 1])
    : await findWeek(undefined, new Date(data.week.weekStart));

  const [slots, employees] = await Promise.all([
    prisma.weekSlot.findMany({
      where: { weekId: week.id },
      select: {
        id: true,
        dayOfWeek: true,
        role: true,
        startTime: true,
        endTime: true,
        sortOrder: true,
      },
    }),
    prisma.employee.findMany({ select: { id: true, phone: true } }),
  ]);

  const slotIdByKey = new Map(slots.map((s) => [slotKey(s), s.id]));
  const idByPhone = new Map(
    employees.flatMap((e) => (e.phone ? [[e.phone, e.id] as const] : [])),
  );
  const nameByPhone = new Map(data.employees.map((e) => [e.phone, e.fullName]));

  /*
   * מה שלא נמצא נספר ומדווח בשמו ולא נבלע. שחזור שקט שמפיל מאתיים סימונים
   * בלי לומר מילה גרוע מכשל: הוא נראה כהצלחה, והחוסר מתגלה רק כשהפותר בונה
   * סידור על נתונים חלקיים.
   */
  const missingPeople = new Set<string>();
  const missingSlots = new Set<string>();
  const marks = data.marks.filter((m) => {
    if (!idByPhone.has(m.phone)) {
      missingPeople.add(m.phone);
      return false;
    }
    if (!slotIdByKey.has(m.slot)) {
      missingSlots.add(m.slot);
      return false;
    }
    return true;
  });
  const subs = data.submissions.filter((s) => {
    if (!idByPhone.has(s.phone)) {
      missingPeople.add(s.phone);
      return false;
    }
    return true;
  });

  console.log(`מקור: ${file}`);
  console.log(`יעד:  שבוע ${toDateInputValue(week.weekStart)}\n`);
  console.log(`  הגשות לשחזור:   ${subs.length} מתוך ${data.submissions.length}`);
  console.log(`  סימונים לשחזור: ${marks.length} מתוך ${data.marks.length}`);

  if (missingPeople.size > 0) {
    console.log(`\nעובדים שלא נמצאו לפי טלפון (${missingPeople.size}):`);
    for (const phone of missingPeople) {
      console.log(`  ${formatPhone(phone)} — ${nameByPhone.get(phone) ?? "?"}`);
    }
    console.log("  ייתכן שהטלפון שונה מאז הגיבוי. יש לתקן ולהריץ שוב.");
  }
  if (missingSlots.size > 0) {
    console.log(`\nמשבצות שאין להן מקבילה בשבוע היעד (${missingSlots.size}):`);
    for (const key of missingSlots) console.log(`  ${key}`);
    console.log("  התבנית השבועית השתנתה מאז הגיבוי.");
  }

  if (!apply) {
    console.log("\nהרצה יבשה. להחלה: --apply");
    return;
  }

  for (const s of subs) {
    const employeeId = idByPhone.get(s.phone)!;
    const fields = {
      submittedAt: s.submittedAt ? new Date(s.submittedAt) : null,
      note: s.note,
    };
    await prisma.submission.upsert({
      where: { weekId_employeeId: { weekId: week.id, employeeId } },
      create: { weekId: week.id, employeeId, ...fields },
      update: fields,
    });
  }

  for (const m of marks) {
    const employeeId = idByPhone.get(m.phone)!;
    const slotId = slotIdByKey.get(m.slot)!;
    const fields = {
      state: m.state,
      earliestStart: m.earliestStart,
      latestEnd: m.latestEnd,
      note: m.note,
    };
    // upsert לפי המפתח הייחודי הקיים — הרצה חוזרת אינה משכפלת
    await prisma.availability.upsert({
      where: { employeeId_slotId: { employeeId, slotId } },
      create: { weekId: week.id, employeeId, slotId, ...fields },
      update: fields,
    });
  }

  console.log(`\nהוחל: ${subs.length} הגשות ו-${marks.length} סימונים שוחזרו.`);
}

async function main() {
  const [command, ...args] = process.argv.slice(2);
  switch (command) {
    case "backup":
      await backup(args);
      break;
    case "restore":
      await restore(args);
      break;
    default:
      console.log(
        [
          "פקודות:",
          "  backup [--week YYYY-MM-DD] [יעד.json]     שומר את ההגשות לקובץ",
          "  restore <קובץ.json> [--week …] [--apply]  מחזיר אותן",
        ].join("\n"),
      );
      process.exitCode = command ? 1 : 0;
  }
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
