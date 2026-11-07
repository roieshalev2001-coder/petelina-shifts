import { prisma } from "./db";
import { addDays, resolveEnd, toHHMM, toMinutes, zonedMidnight } from "./time";
import { CLOSING } from "./domain";
import { closingTimeFor, insertionSortOrder } from "./week";
import { matchRotationToSlots } from "./fridays";
import { buildSolverInput } from "./scheduler/adapter";
import { solve } from "./scheduler/solve";
import type { SolverReport } from "./scheduler/types";

/**
 * פותח שבוע חדש: מעתיק את התבנית הקבועה למשבצות של השבוע הזה.
 * מרגע זה שינויים בתבנית לא ישפיעו על השבוע — מה שמונע קריסה של הגשות קיימות.
 */
export async function createWeek(args: {
  weekStart: Date;
  deadline: Date;
  opensAt?: Date;
}) {
  const template = await prisma.templateSlot.findMany({
    where: { active: true },
    orderBy: [{ dayOfWeek: "asc" }, { sortOrder: "asc" }],
  });

  if (template.length === 0) {
    throw new Error("התבנית השבועית ריקה — יש להגדיר משבצות לפני פתיחת שבוע");
  }

  return prisma.week.create({
    data: {
      weekStart: args.weekStart,
      opensAt: args.opensAt ?? new Date(),
      deadline: args.deadline,
      status: "open",
      slots: {
        create: template.map((t) => ({
          date: addDays(args.weekStart, t.dayOfWeek),
          dayOfWeek: t.dayOfWeek,
          role: t.role,
          period: t.period,
          startTime: t.startTime,
          endTime: t.endTime,
          label: t.label,
          sortOrder: t.sortOrder,
          fixedStart: t.fixedStart,
          timeDisplay: t.timeDisplay,
          fixedEnd: t.fixedEnd,
          standby: t.standby,
        })),
      },
    },
    include: { slots: true },
  });
}

/**
 * זורע את סבב שישי לשבוע שנפתח, כשיבוצים נעוצים.
 *
 * **נעוצים בכוונה**: שישי הוא סבב חובה, והוא נקבע מראש ולא נגזר מההגשות.
 * בלי הנעיצה, `buildSchedule` היה מוחק אותם בהרצה הראשונה — הוא מוחק כל
 * שיבוץ שאינו נעוץ — ומשבץ מחדש לפי מי שסימן, כלומר בדיוק ההפך מהכוונה.
 *
 * מי ששובץ ולא סימן זמינות מסומן ב-`manualOverride`, וכך הדוח יכול
 * להצביע עליו: זה גלוי למנהל לפני הפרסום, ולא הפתעה לעובד.
 *
 * מחזיר כמה נזרעו, ואת מי ששובץ בלי שסימן.
 */
export async function seedFridayPlan(weekId: string): Promise<{
  seeded: number;
  withoutAvailability: string[];
  /** מי שלא הצליח להיכנס לשום משבצת — הסיבה היחידה שהסבב נראה חסר */
  unmatched: string[];
}> {
  const fridaySlotsOf = () =>
    prisma.weekSlot.findMany({
      where: { weekId, dayOfWeek: 5 },
      select: {
        id: true, date: true, role: true, period: true, startTime: true, endTime: true, sortOrder: true,
      },
      orderBy: { sortOrder: "asc" },
    });
  let slots = await fridaySlotsOf();
  if (slots.length === 0) return { seeded: 0, withoutAvailability: [], unmatched: [] };

  /*
   * התאמה לפי היום הקלנדרי בישראל, לא לפי רגע מדויק.
   *
   * `FridayPlan.date` נבנה ב-zonedTime (חצות ישראל), בעוד ש-`WeekSlot.date`
   * של שבוע שנוצר לפני תיקון השעון יושב על חצות UTC — אותו יום, שלוש שעות
   * הפרש. השוואה מדויקת החזירה אפס שורות, בלי שגיאה ובלי סימן, והסבב פשוט
   * לא נכנס לסידור. אותה מלכודת בדיוק כמו ב-scripts/week-data.ts.
   */
  const from = zonedMidnight(slots[0].date);
  const plan = await prisma.fridayPlan.findMany({
    where: { date: { gte: from, lt: addDays(from, 1) } },
    select: {
      role: true,
      isClosing: true,
      position: true,
      employeeId: true,
      employee: { select: { fullName: true } },
    },
    orderBy: [{ role: "asc" }, { position: "asc" }],
  });
  if (plan.length === 0) {
    return { seeded: 0, withoutAvailability: [], unmatched: [] };
  }

  /*
   * שישי עם יותר מקומות מהתבנית (מלצר שמיני בסבב, כשהתבנית מחזיקה שבעה):
   * המשבצת החסרה נוצרת בשבוע הזה בלבד, רבע שעה אחרי האחרונה מאותו
   * תפקיד — ראה arrivalAt. בלי זה המלצר השמיני היה "לא נכנס" בשקט.
   */
  let added = false;
  for (const role of new Set(plan.map((p) => p.role))) {
    const ofRole = slots.filter((s) => s.role === role);
    const need = Math.max(0, ...plan.filter((p) => p.role === role).map((p) => p.position ?? 0));
    const last = ofRole[ofRole.length - 1];
    if (!last) continue;
    for (let n = ofRole.length + 1; n <= need; n++) {
      await addWeekSlot({
        weekId,
        dayOfWeek: 5,
        role,
        period: last.period,
        startTime: toHHMM(toMinutes(last.startTime) + 15 * (n - ofRole.length)),
        endTime: last.endTime,
      });
      added = true;
    }
  }
  if (added) slots = await fridaySlotsOf();

  const week = await prisma.week.findUniqueOrThrow({
    where: { id: weekId },
    select: { closingTimes: true },
  });

  const marked = new Set(
    (
      await prisma.availability.findMany({
        where: { weekId, slotId: { in: slots.map((s) => s.id) } },
        select: { employeeId: true, slotId: true },
      })
    ).map((a) => `${a.employeeId}|${a.slotId}`),
  );

  /*
   * ההתאמה עצמה טהורה ויושבת ב-src/lib/fridays.ts — היא הכלל שהסידור
   * עובד לפיו, ולכן היא צריכה להיות ניתנת לבדיקה בלי מסד.
   */
  const slotById = new Map(slots.map((s) => [s.id, s]));
  const { pairs, unmatched } = matchRotationToSlots(
    plan,
    slots.map((s) => ({ id: s.id, role: s.role, isClosing: s.endTime === CLOSING })),
  );

  const withoutAvailability: string[] = [];
  let seeded = 0;

  // שעות הגעה ששונו לשישי הזה בלבד ("רק בשישי הזה") — גוברות על התבנית
  const overrides = await prisma.fridayTimeOverride.findMany({
    where: { date: { gte: from, lt: addDays(from, 1) } },
    select: { role: true, position: true, startTime: true },
  });

  for (const { entry, slotId } of pairs) {
    const slot = slotById.get(slotId)!;

    const override = overrides.find(
      (o) => o.role === entry.role && o.position === entry.position,
    )?.startTime;
    if (override && override !== slot.startTime) {
      await prisma.weekSlot.update({ where: { id: slot.id }, data: { startTime: override } });
    }
    const start = override ?? slot.startTime;

    const end = resolveEnd(slot.endTime, closingTimeFor(week, 5));
    await prisma.assignment.upsert({
      where: { slotId: slot.id },
      create: {
        weekId,
        slotId: slot.id,
        employeeId: entry.employeeId,
        actualStart: start,
        actualEnd: end,
        manualOverride: true,
        pinned: true,
      },
      update: {
        employeeId: entry.employeeId,
        actualStart: start,
        actualEnd: end,
        manualOverride: true,
        pinned: true,
      },
    });
    seeded++;
    if (!marked.has(`${entry.employeeId}|${slot.id}`)) {
      withoutAvailability.push(entry.employee.fullName);
    }
  }

  return {
    seeded,
    withoutAvailability: [...new Set(withoutAvailability)],
    unmatched: [...new Set(unmatched.map((e) => e.employee.fullName))],
  };
}

/**
 * מיישר את שישי בסידור השבועי לפי טבלת הסבב, בשבועות שכבר נפתחו.
 *
 * הסבב הוא המקור של שישי — בניית הסידור לא נוגעת בו — ולכן שינוי בטבלת
 * הסבב חייב להגיע גם לסידור, אחרת שני המסכים מראים אנשים שונים. מלצרים
 * וברמנים משתקפים בדיוק: מקום שהתרוקן בסבב מתרוקן גם בסידור, ומי שזז
 * ממקום למקום לא נשאר כפול. אחמ"שים — אין להם סבב — לא נוגעים.
 */
export async function syncFridayToWeeks(dates: Date[]): Promise<void> {
  for (const date of dates) {
    const from = zonedMidnight(date);
    const range = { gte: from, lt: addDays(from, 1) };
    const slots = await prisma.weekSlot.findMany({
      where: { dayOfWeek: 5, date: range, week: { deletedAt: null } },
      select: { id: true, weekId: true, role: true, endTime: true, assignment: { select: { id: true } } },
      orderBy: { sortOrder: "asc" },
    });
    if (slots.length === 0) continue;

    const plan = await prisma.fridayPlan.findMany({
      where: { date: range },
      select: { role: true, isClosing: true, position: true },
    });
    const rotation = slots.filter((s) => s.role === "waiter" || s.role === "bartender");
    const { pairs } = matchRotationToSlots(
      plan,
      rotation.map((s) => ({ id: s.id, role: s.role, isClosing: s.endTime === CLOSING })),
    );
    const filled = new Set(pairs.map((p) => p.slotId));
    const vacated = rotation.filter((s) => !filled.has(s.id) && s.assignment).map((s) => s.id);
    if (vacated.length) {
      await prisma.assignment.deleteMany({ where: { slotId: { in: vacated } } });
    }
    await seedFridayPlan(slots[0].weekId);
  }
}

/**
 * "שינוי שעת הגעה" בטבלת סבב שישי.
 *
 * `date` — רק בשישי הזה: נשמר כחריג (FridayTimeOverride), כי ייתכן שהשבוע
 * שלו עוד לא נפתח ואין משבצת לשנות. אם הוא כבר פתוח, המשבצת מתעדכנת עכשיו.
 *
 * `always` — המיקום הזה בתבנית של שישי, ובנוסף משבצות השישי של השבועות
 * שכבר נפתחו, מהיום והלאה. שישי שיש לו חריג משלו נשאר עם החריג.
 *
 * מיקום מעבר לתבנית (מלצר שמיני) אין לו שעה קבועה, ולכן רק `date`.
 */
export async function setFridayArrival(args: {
  date: Date;
  role: string;
  position: number;
  startTime: string;
  scope: "date" | "always";
}): Promise<{ error?: string }> {
  const from = zonedMidnight(args.date);
  const range = { gte: from, lt: addDays(from, 1) };

  if (args.scope === "date") {
    await prisma.fridayTimeOverride.upsert({
      where: { date_role_position: { date: from, role: args.role, position: args.position } },
      create: { date: from, role: args.role, position: args.position, startTime: args.startTime },
      update: { startTime: args.startTime },
    });
    await moveFridayArrival({ dates: range, role: args.role, position: args.position, startTime: args.startTime });
    return {};
  }

  const template = await prisma.templateSlot.findMany({
    where: { dayOfWeek: 5, role: args.role, active: true },
    orderBy: { sortOrder: "asc" },
  });
  const slot = template[args.position - 1];
  if (!slot) return { error: "למקום הזה אין שעה קבועה בתבנית — אפשר לשנות רק לשישי הזה" };
  await prisma.templateSlot.update({ where: { id: slot.id }, data: { startTime: args.startTime } });

  // שבועות שכבר נפתחו, מהיום והלאה — חוץ משישיים שיש להם חריג משלהם
  const today = zonedMidnight(new Date());
  const exceptions = await prisma.fridayTimeOverride.findMany({
    where: { role: args.role, position: args.position, date: { gte: today } },
    select: { date: true },
  });
  await moveFridayArrival({
    dates: { gte: today },
    role: args.role,
    position: args.position,
    startTime: args.startTime,
    skip: exceptions.map((e) => zonedMidnight(e.date).getTime()),
  });
  return {};
}

/** משבצת השישי במיקום הזה, בכל שבוע פתוח בטווח: שעת ההגעה, וגם של מי שבה */
async function moveFridayArrival(args: {
  dates: { gte: Date; lt?: Date };
  role: string;
  position: number;
  startTime: string;
  skip?: number[];
}) {
  const slots = await prisma.weekSlot.findMany({
    where: { dayOfWeek: 5, role: args.role, date: args.dates, week: { deletedAt: null } },
    select: { id: true, weekId: true, date: true, startTime: true, assignment: { select: { id: true, actualStart: true } } },
    orderBy: { sortOrder: "asc" },
  });
  const byWeek = new Map<string, typeof slots>();
  for (const s of slots) {
    if (!byWeek.has(s.weekId)) byWeek.set(s.weekId, []);
    byWeek.get(s.weekId)!.push(s);
  }
  for (const list of byWeek.values()) {
    const slot = list[args.position - 1];
    if (!slot || args.skip?.includes(zonedMidnight(slot.date).getTime())) continue;
    await prisma.weekSlot.update({ where: { id: slot.id }, data: { startTime: args.startTime } });
    // מי שהגיע בשעת המשבצת זז איתה; שעה אישית אחרת נשארת
    if (slot.assignment && slot.assignment.actualStart === slot.startTime) {
      await prisma.assignment.update({
        where: { id: slot.assignment.id },
        data: { actualStart: args.startTime },
      });
    }
  }
}

/**
 * מוסיף משבצת לשבוע אחד בלבד — התבנית הקבועה לא משתנה.
 *
 * המשבצת נכנסת לפי שעת ההתחלה שלה, בתוך הקבוצה שלה (ראה
 * insertionSortOrder), והמשבצות שאחריה זזות מקום אחד. `sortOrder` הוא סדר התצוגה
 * וגם המפתח של סבב שישי (מיקום i = המשבצת ה-i של התפקיד), ולכן הוא חייב
 * להישאר רציף ונכון ולא סתם "גדול מכולם".
 */
export async function addWeekSlot(args: {
  weekId: string;
  dayOfWeek: number;
  role: string;
  period: string;
  startTime: string;
  endTime: string;
  label?: string | null;
}): Promise<{ id: string }> {
  return prisma.$transaction(async (tx) => {
    const day = await tx.weekSlot.findMany({
      where: { weekId: args.weekId, dayOfWeek: args.dayOfWeek },
      select: { role: true, period: true, startTime: true, sortOrder: true, date: true },
      orderBy: { sortOrder: "asc" },
    });
    // לפי שעת ההתחלה, בתוך הקבוצה שלו — ראה insertionSortOrder
    const sortOrder = insertionSortOrder(day, args);

    let date = day[0]?.date;
    if (!date) {
      const week = await tx.week.findUniqueOrThrow({
        where: { id: args.weekId },
        select: { weekStart: true },
      });
      date = addDays(zonedMidnight(week.weekStart), args.dayOfWeek);
    }

    await tx.weekSlot.updateMany({
      where: { weekId: args.weekId, dayOfWeek: args.dayOfWeek, sortOrder: { gte: sortOrder } },
      data: { sortOrder: { increment: 1 } },
    });
    return tx.weekSlot.create({
      data: {
        weekId: args.weekId,
        date,
        dayOfWeek: args.dayOfWeek,
        role: args.role,
        period: args.period,
        startTime: args.startTime,
        endTime: args.endTime,
        label: args.label ?? null,
        sortOrder,
        // נוסף לשבוע הזה — ולכן, ורק לכן, אפשר גם להסיר אותו
        extra: true,
      },
      select: { id: true },
    });
  });
}

/** כל מה שצריך כדי להריץ את הפותר או להציג את הסידור. */
export async function loadWeek(weekId: string) {
  const week = await prisma.week.findUnique({
    where: { id: weekId },
    include: {
      slots: { orderBy: [{ dayOfWeek: "asc" }, { sortOrder: "asc" }] },
      assignments: true,
      availabilities: true,
      submissions: { include: { employee: true } },
    },
  });
  if (!week) return null;

  const [employees, constraints] = await Promise.all([
    prisma.employee.findMany({ where: { active: true }, orderBy: { fullName: "asc" } }),
    prisma.pairConstraint.findMany(),
  ]);

  return { week, employees, constraints };
}

/**
 * ימים שהבנייה לא נוגעת בהם — היום רק שישי.
 *
 * הסידור של שישי נקבע בנפרד: סבב שישי שמיובא מהגיליון, או שיבוץ ידני
 * (החלטה של רואי). מה שיש בו נשאר כמו שהוא ונספר במכסה השבועית, ומשבצת
 * ריקה בו נשארת ריקה — ראה fixedDays ב-buildSolverInput.
 */
const DAYS_OUTSIDE_BUILD = [5];

/**
 * מריץ את הפותר על השבוע ושומר את התוצאה.
 * שיבוצים נעוצים נשמרים, וכך גם כל שישי (DAYS_OUTSIDE_BUILD); כל השאר
 * נמחקים ונבנים מחדש.
 */
export async function buildSchedule(weekId: string): Promise<SolverReport> {
  const loaded = await loadWeek(weekId);
  if (!loaded) throw new Error("השבוע לא נמצא");
  const { week, employees, constraints } = loaded;

  const input = buildSolverInput({
    week,
    slots: week.slots,
    employees,
    availabilities: week.availabilities,
    constraints,
    existingAssignments: week.assignments,
    fixedDays: DAYS_OUTSIDE_BUILD,
  });

  const { assignments, report } = solve(input);

  // createMany ולא create בלולאה: לשבוע מלא יש ~93 משבצות, וכתיבה אחת לכל
  // אחת מהן היא ~93 הלוך-חזור לפרנקפורט. מול SQLite המקומי זה היה מיידי,
  // אבל מול Prisma Postgres זה חצה את תקרת 5 השניות של הטרנזקציה והפעולה
  // נכשלה כולה — כלומר "בניית סידור" לא עבדה על שבוע אמיתי.
  await prisma.$transaction([
    prisma.assignment.deleteMany({
      where: { weekId, pinned: false, slot: { dayOfWeek: { notIn: DAYS_OUTSIDE_BUILD } } },
    }),
    prisma.assignment.createMany({
      data: assignments
        .filter((a) => !a.pinned)
        .map((a) => ({
          weekId,
          slotId: a.slotId,
          employeeId: a.employeeId,
          actualStart: toHHMM(a.actualStart),
          actualEnd: toHHMM(a.actualEnd),
          shortened: a.shortened,
        })),
    }),
    // בכוונה לא משנים כאן את הסטטוס: בניית טיוטה היא פעולה שהמנהל עשוי
    // לעשות כדי להציץ באמצע השבוע, ואסור שהיא תנעל את העובדים בלי שביקש.
    // סגירת ההגשה היא פעולה נפרדת ומפורשת.
    prisma.week.update({
      where: { id: weekId },
      data: { lastReport: JSON.stringify(report) },
    }),
  ]);

  return report;
}

export function parseReport(json: string | null): SolverReport | null {
  if (!json) return null;
  try {
    return JSON.parse(json) as SolverReport;
  } catch {
    return null;
  }
}

/**
 * האם סבב שישי של השבוע יושב בסידור, ומה חסר.
 *
 * נגזר מהמצב הנוכחי ולא נשמר: הזריעה קורית פעם אחת בפתיחת השבוע, ומאז
 * הסבב יכול להשתנות — יובא מהגיליון, תוקן ידנית, או שהשבוע נפתח לפני
 * שהסבב בכלל נוצר. בלי החישוב הזה הפער היה שקט, וזה בדיוק מה שקרה.
 */
export async function fridayRotationStatus(weekId: string): Promise<{
  planned: number;
  inPlace: number;
  unmatched: string[];
}> {
  const slots = await prisma.weekSlot.findMany({
    where: { weekId, dayOfWeek: 5 },
    select: { id: true, date: true, role: true, endTime: true },
    orderBy: { sortOrder: "asc" },
  });
  if (slots.length === 0) return { planned: 0, inPlace: 0, unmatched: [] };

  // אותה התאמה ליום קלנדרי כמו בזריעה — ראה ההסבר שם
  const from = zonedMidnight(slots[0].date);
  const [plan, assignments] = await Promise.all([
    prisma.fridayPlan.findMany({
      where: { date: { gte: from, lt: addDays(from, 1) } },
      select: {
        role: true,
        isClosing: true,
        position: true,
        employeeId: true,
        employee: { select: { fullName: true } },
      },
      orderBy: [{ role: "asc" }, { position: "asc" }],
    }),
    prisma.assignment.findMany({
      where: { weekId, slotId: { in: slots.map((s) => s.id) } },
      select: { slotId: true, employeeId: true },
    }),
  ]);
  if (plan.length === 0) return { planned: 0, inPlace: 0, unmatched: [] };

  const { pairs, unmatched } = matchRotationToSlots(
    plan,
    slots.map((s) => ({ id: s.id, role: s.role, isClosing: s.endTime === CLOSING })),
  );
  const current = new Map(assignments.map((a) => [a.slotId, a.employeeId]));
  const inPlace = pairs.filter(
    (p) => current.get(p.slotId) === p.entry.employeeId,
  ).length;

  return {
    planned: plan.length,
    inPlace,
    unmatched: [...new Set(unmatched.map((e) => e.employee.fullName))],
  };
}
