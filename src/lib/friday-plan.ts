import { prisma } from "./db";
import { CLOSING, parseRoles } from "./domain";
import {
  arrivalAt,
  offSiteFridayCounts,
  plannedAheadCounts,
  planFridays,
  type RotationEntry,
  type RotationPerson,
  type RotationSlot,
} from "./fridays";
import { parseFridaySheet, type ImportPreview } from "./friday-import";
import { notify } from "./notify";
import {
  addDays,
  dateList,
  toDateInputValue,
  zonedMidnight,
  zonedTime,
} from "./time";

/**
 * שכבת המסד של סבב שישי.
 *
 * הלוגיקה עצמה טהורה ויושבת ב-src/lib/fridays.ts; כאן רק אספקת הקלט
 * ושמירת התוצאה.
 */

/** לאחמ"שים אין סבב — הם קבועים ואינם מתחלפים */
export const ROTATION_ROLES = ["waiter", "bartender"] as const;

/**
 * המקומות שיש בשישי — נגזר מהתבנית השבועית, ולא ממספר קבוע: אם תשנה את
 * התבנית, הסבב יעקוב מעצמו.
 *
 * הסגירה מזוהה לפי `endTime === "CLOSING"`, אותו סימון שהתבנית משתמשת בו
 * בכל מקום אחר — כך שהעברת משבצת ל"עד סגירה" מכניסה אותה לסבב הסגירה
 * בלי שום צעד נוסף.
 */
export async function fridaySlots(): Promise<
  { role: string; isClosing: boolean; position: number; startTime: string }[]
> {
  const slots = await prisma.templateSlot.findMany({
    where: { dayOfWeek: 5, active: true, role: { in: [...ROTATION_ROLES] } },
    select: { role: true, endTime: true, startTime: true },
    orderBy: { sortOrder: "asc" },
  });

  /*
   * המיקום נספר בתוך כל תפקיד בנפרד, לפי `sortOrder` — כלומר לפי שעת
   * ההתחלה. זה ההסכם היחיד בין הסבב לבין הזריעה, וגם מה שהופך את
   * "השניים האחרונים סוגרים" לנכון מעצמו: משבצות הסגירה אחרונות בתבנית.
   */
  const seen = new Map<string, number>();
  return slots.map((s) => {
    const position = (seen.get(s.role) ?? 0) + 1;
    seen.set(s.role, position);
    return {
      role: s.role,
      isClosing: s.endTime === CLOSING,
      position,
      startTime: s.startTime,
    };
  });
}

/** ספירה לפי תפקיד, לתצוגה */
export async function fridayCapacity(): Promise<Record<string, number>> {
  const out: Record<string, number> = {};
  for (const s of await fridaySlots()) out[s.role] = (out[s.role] ?? 0) + 1;
  return out;
}

/**
 * כמה שישיים כל עובד עבד בפועל, אי פעם.
 *
 * מההיסטוריה ולא ממונה שאנחנו מתחזקים: מי שהחליף משמרת או שמישהו לקח
 * ממנו חוזר מעצמו לראש התור, בלי שאיש יזכור לעדכן. ובנוסף — שישיים
 * שנוהלו בגיליון לפני שהשבוע שלהם היה באתר, ראה offSiteFridayCounts.
 */
export async function fridaysWorked(): Promise<Map<string, number>> {
  const [rows, offSite] = await Promise.all([
    prisma.assignment.groupBy({
      by: ["employeeId"],
      // שבוע מאורכב אינו נספר: המנהל הסיר אותו, ולכן הוא אינו "עבד"
      where: { slot: { dayOfWeek: 5 }, week: { deletedAt: null } },
      _count: { _all: true },
    }),
    loadOffSiteFridays(),
  ]);
  return addCounts(new Map(rows.map((r) => [r.employeeId, r._count._all])), offSite.worked);
}

/** שורות הסבב שנספרות כהיסטוריה למרות שאין להן שבוע באתר */
async function loadOffSiteFridays() {
  const today = zonedMidnight(new Date());
  const [rows, weeks] = await Promise.all([
    prisma.fridayPlan.findMany({
      where: { source: "manual", date: { lt: today } },
      select: { date: true, employeeId: true, isClosing: true, source: true },
    }),
    prisma.week.findMany({ where: { deletedAt: null }, select: { weekStart: true } }),
  ]);
  return offSiteFridayCounts({ rows, weekStarts: weeks.map((w) => w.weekStart), today });
}

function addCounts(a: Map<string, number>, b: Map<string, number>): Map<string, number> {
  const out = new Map(a);
  for (const [id, n] of b) out.set(id, (out.get(id) ?? 0) + n);
  return out;
}

/**
 * כמה שישיים כל עובד **סגר** בפועל.
 *
 * בנפרד מ-fridaysWorked: סגירה היא נטל אחר, ומונה משותף היה מרכז אותה
 * אצל מי שממילא עובד מעט שישיים.
 */
export async function fridayClosingsWorked(): Promise<Map<string, number>> {
  const [rows, offSite] = await Promise.all([
    prisma.assignment.groupBy({
      by: ["employeeId"],
      where: { slot: { dayOfWeek: 5, endTime: CLOSING }, week: { deletedAt: null } },
      _count: { _all: true },
    }),
    loadOffSiteFridays(),
  ]);
  return addCounts(new Map(rows.map((r) => [r.employeeId, r._count._all])), offSite.closed);
}

/**
 * המועמדים לסבב: פעילים, עם תפקיד שיש לו סבב.
 *
 * `before` = תחילת התקופה שבונים. השישיים שמתוכננים עד אליה (התקופה
 * הנוכחית, שעוד לא נעבדה) נספרים בהוגנות — ראה plannedAheadCounts.
 */
async function rotationPeople(before?: Date): Promise<RotationPerson[]> {
  const [employees, worked, closed, ahead] = await Promise.all([
    prisma.employee.findMany({
      where: { active: true },
      select: {
        id: true,
        fullName: true,
        roles: true,
        fridayLimit: true,
      },
      orderBy: { fullName: "asc" },
    }),
    fridaysWorked(),
    fridayClosingsWorked(),
    before ? loadPlannedAhead(before) : null,
  ]);

  return employees
    .map((e) => ({
      id: e.id,
      fullName: e.fullName,
      roles: parseRoles(e.roles) as string[],
      fridayLimit: e.fridayLimit,
      worked: (worked.get(e.id) ?? 0) + (ahead?.worked.get(e.id) ?? 0),
      closed: (closed.get(e.id) ?? 0) + (ahead?.closed.get(e.id) ?? 0),
    }))
    .filter((p) => p.roles.some((r) => (ROTATION_ROLES as readonly string[]).includes(r)));
}

async function loadPlannedAhead(before: Date) {
  const today = zonedMidnight(new Date());
  const [rows, weeks] = await Promise.all([
    prisma.fridayPlan.findMany({
      where: { date: { gte: today, lt: zonedMidnight(before) } },
      select: { date: true, employeeId: true, isClosing: true },
    }),
    prisma.week.findMany({ where: { deletedAt: null }, select: { weekStart: true } }),
  ]);
  return plannedAheadCounts({
    rows,
    weekStarts: weeks.map((w) => w.weekStart),
    today,
    before: zonedMidnight(before),
  });
}

export type FridayPlanRow = {
  date: string;
  role: string;
  isClosing: boolean;
  position: number | null;
  employeeId: string;
  fullName: string;
  source: string;
  /** null = העובד עדיין אינו רואה את השיבוץ */
  publishedAt: Date | null;
};

/** מפתח התאריך של רגע — הכל בשכבה הזאת מדבר במפתחות, לא ברגעים */
export function dateKey(date: Date): string {
  return toDateInputValue(date);
}

/** ההפך מ-dateKey: "YYYY-MM-DD" לחצות בשעון ישראל */
export function fromKey(key: string): Date {
  return zonedTime(
    Number(key.slice(0, 4)),
    Number(key.slice(5, 7)),
    Number(key.slice(8, 10)),
  );
}

/**
 * התוכנית השמורה לתאריכים שנתבקשו.
 *
 * החיפוש הוא בטווח מהמוקדם עד היום שאחרי המאוחר, ולא ברשימת רגעים
 * מדויקים. זו אותה מלכודת שהפילה את הזריעה: שורות שנוצרו בזמנים שונים
 * יכולות לשבת על חצות ישראל או על חצות UTC, אותו יום ושלוש שעות הפרש,
 * ו-`in` על רגעים היה מחזיר אפס בלי שגיאה ובלי סימן.
 */
export async function loadFridayPlan(dates: Date[]): Promise<FridayPlanRow[]> {
  if (dates.length === 0) return [];
  const wanted = new Set(dates.map(dateKey));
  const sorted = [...dates].sort((a, b) => a.getTime() - b.getTime());

  const rows = await prisma.fridayPlan.findMany({
    where: {
      date: {
        gte: zonedMidnight(sorted[0]),
        lt: addDays(zonedMidnight(sorted[sorted.length - 1]), 1),
      },
    },
    select: {
      date: true,
      role: true,
      isClosing: true,
      position: true,
      employeeId: true,
      source: true,
      publishedAt: true,
      employee: { select: { fullName: true } },
    },
    orderBy: [{ date: "asc" }, { role: "asc" }, { position: "asc" }],
  });

  return rows
    .map((r) => ({
      date: dateKey(r.date),
      role: r.role,
      isClosing: r.isClosing,
      position: r.position,
      employeeId: r.employeeId,
      fullName: r.employee.fullName,
      source: r.source,
      publishedAt: r.publishedAt,
    }))
    .filter((r) => wanted.has(r.date));
}

/**
 * מחליף עובד בשיבוץ קיים, ומסמן אותו כידני.
 *
 * הסימון הוא מה ששומר על התיקון: `generateFridayPlan` בונה מחדש רק את
 * האוטומטיים, ולוקח את הידניים כנתון.
 */
export async function setFridayAssignment(args: {
  date: string;
  role: string;
  isClosing: boolean;
  /** מקומו בסדר ההגעה — עובר עם המשבצת, לא עם האדם */
  position: number | null;
  fromEmployeeId: string;
  toEmployeeId: string;
}): Promise<void> {
  const date = fromKey(args.date);

  await prisma.$transaction(async (tx) => {
    await tx.fridayPlan.deleteMany({
      where: { date, employeeId: args.fromEmployeeId },
    });
    /*
     * upsert ולא create: `@@unique([date, employeeId])` מונע מאותו אדם
     * להופיע פעמיים באותו שישי, וללא זה החלפה לעובד שכבר משובץ באותו יום
     * הייתה נכשלת בשגיאת מסד במקום פשוט להזיז אותו.
     */
    await tx.fridayPlan.upsert({
      where: { date_employeeId: { date, employeeId: args.toEmployeeId } },
      create: {
        date,
        role: args.role,
        isClosing: args.isClosing,
        employeeId: args.toEmployeeId,
        position: args.position,
        source: "manual",
      },
      update: {
        role: args.role,
        isClosing: args.isClosing,
        position: args.position,
        source: "manual",
      },
    });
  });
}

/**
 * קובע מי במשבצת אחת בטבלת הסבב — או מרוקן אותה (`employeeId: null`).
 *
 * המשבצת מזוהה בתאריך+תפקיד+מיקום. מי שכבר משובץ באותו שישי במקום אחר
 * עובר לכאן (אותו אדם לא יכול להופיע פעמיים באותו שישי — @@unique).
 * השורה נשמרת כידנית, כך ש"סידור אוטומטי" לא ידרוס אותה, ולא מפורסמת עד
 * שהמנהל לוחץ "פרסום".
 *
 * מלצר שמיני הוא פשוט מיקום 8: הוספה = קביעה בו, הסרה = ריקון.
 */
export async function setFridayCell(args: {
  date: string;
  role: string;
  position: number;
  employeeId: string | null;
}): Promise<void> {
  const day = fromKey(args.date);
  const range = { gte: zonedMidnight(day), lt: addDays(zonedMidnight(day), 1) };
  const template = await fridaySlots();
  const isClosing =
    template.find((t) => t.role === args.role && t.position === args.position)?.isClosing ?? false;

  await prisma.$transaction(async (tx) => {
    await tx.fridayPlan.deleteMany({
      where: { date: range, role: args.role, position: args.position },
    });
    if (!args.employeeId) return;
    await tx.fridayPlan.deleteMany({ where: { date: range, employeeId: args.employeeId } });
    await tx.fridayPlan.create({
      data: {
        date: day,
        role: args.role,
        position: args.position,
        isClosing,
        employeeId: args.employeeId,
        source: "manual",
      },
    });
  });
}

/**
 * "התחלה מאפס": מרוקן את מה שטרם פורסם בתאריכים האלה.
 *
 * רק לא-מפורסם, בכוונה: שיבוץ שהעובד כבר ראה (ואולי כבר מסר או החליף
 * עליו) לא נעלם בלחיצה אחת. המסך מציע את זה רק לתקופה הבאה.
 */
export async function clearFridayPeriod(dates: Date[]): Promise<number> {
  const rows = await loadFridayPlanRaw(dates, { unpublishedOnly: true });
  if (rows.length === 0) return 0;
  const { count } = await prisma.fridayPlan.deleteMany({
    where: { id: { in: rows.map((r) => r.id) } },
  });
  return count;
}

/**
 * מייצר את הסבב לחודש ושומר אותו.
 *
 * שיבוצים שהמנהל שינה ידנית (`source = "manual"`) נלקחים כנתון ולא
 * נדרסים — אחרת כל לחיצה על "צור מחדש" הייתה מוחקת את התיקונים שלו.
 */
export async function generateFridayPlan(args: {
  dates: Date[];
  /** מגביל את היצירה לתפקידים מסוימים — הגיליון מכסה מלצרים, והברמנים נשארים אוטומטיים */
  roles?: readonly string[];
  /** "סידור אוטומטי" מעביר Math.random — כל לחיצה סידור אחר. ראה planFridays */
  random?: () => number;
}): Promise<{ created: number; unfilled: RotationSlot[] }> {
  if (args.dates.length === 0) return { created: 0, unfilled: [] };
  const roles = args.roles ?? ROTATION_ROLES;
  const first = [...args.dates].sort((a, b) => a.getTime() - b.getTime())[0];

  const [template, people, existing] = await Promise.all([
    fridaySlots(),
    rotationPeople(first),
    loadFridayPlan(args.dates),
  ]);

  const slots: RotationSlot[] = args.dates.flatMap((date) =>
    template
      .filter((t) => roles.includes(t.role))
      .map((t) => ({
        date: dateKey(date),
        role: t.role,
        isClosing: t.isClosing,
        position: t.position,
      })),
  );

  /*
   * ידני = הגיליון או תיקון של המנהל. נלקח כנתון ולא נדרס, אחרת כל
   * לחיצה על "יצירה מחדש" הייתה מוחקת את מה שיובא.
   */
  const locked: RotationEntry[] = existing
    .filter((r) => r.source === "manual")
    .map((r) => ({
      date: r.date,
      role: r.role,
      isClosing: r.isClosing,
      position: r.position ?? 0,
      employeeId: r.employeeId,
    }));

  const { entries, unfilled } = planFridays({ slots, people, locked, random: args.random });

  const sorted = [...args.dates].sort((a, b) => a.getTime() - b.getTime());

  await prisma.$transaction([
    // האוטומטיים נמחקים ונבנים מחדש; הידניים שורדים
    prisma.fridayPlan.deleteMany({
      where: {
        date: {
          gte: zonedMidnight(sorted[0]),
          lt: addDays(zonedMidnight(sorted[sorted.length - 1]), 1),
        },
        role: { in: [...roles] },
        source: "auto",
      },
    }),
    prisma.fridayPlan.createMany({
      data: entries
        .filter((e) => !locked.some((l) => l.date === e.date && l.employeeId === e.employeeId))
        .map((e) => ({
          date: fromKey(e.date),
          role: e.role,
          isClosing: e.isClosing,
          position: e.position,
          employeeId: e.employeeId,
          source: "auto",
        })),
      skipDuplicates: true,
    }),
  ]);

  return { created: entries.length, unfilled };
}

/**
 * קורא הדבקה מהגיליון מול העובדים והתבנית של היום. אינו כותב דבר.
 *
 * המלצרים הם הרשימה הראשית והברמנים הם הבלוק שבראש כל עמודה — כך בנוי
 * הגיליון. ראה parseFridaySheet.
 */
export async function previewFridayImport(text: string, now?: Date): Promise<ImportPreview> {
  const [employees, template] = await Promise.all([
    prisma.employee.findMany({
      where: { active: true },
      select: { id: true, fullName: true, roles: true },
      orderBy: { fullName: "asc" },
    }),
    fridaySlots(),
  ]);
  const rosterOf = (role: string) =>
    employees
      .filter((e) => (parseRoles(e.roles) as string[]).includes(role))
      .map((e) => ({ id: e.id, fullName: e.fullName }));
  const capacityOf = (role: string) => template.filter((t) => t.role === role).length;

  return parseFridaySheet({
    text,
    role: "waiter",
    roster: rosterOf("waiter"),
    capacity: capacityOf("waiter"),
    leading: {
      role: "bartender",
      roster: rosterOf("bartender"),
      capacity: capacityOf("bartender"),
    },
    // הצורה החדשה של הגיליון: הברמנים בתחתית, אחרי שורה ריקה
    trailing: {
      role: "bartender",
      roster: rosterOf("bartender"),
      capacity: capacityOf("bartender"),
    },
    now,
  });
}

/**
 * כותב סבב שיובא מהגיליון.
 *
 * נכתב כ-`manual`: זה הסבב האמיתי שהסידור עובד לפיו, ו"יצירה מחדש"
 * אסור לה לדרוס אותו. מה שנמחק תחילה הוא רק התאריכים והתפקידים שהיובא
 * באמת מכסה — שישי שלא הופיע בגיליון, ותפקיד שלא הופיע בעמודה (למשל
 * ברמנים בהדבקה של מלצרים בלבד), נשארים כמו שהם.
 */
export async function importFridayPlan(args: {
  columns: {
    date: string;
    entries: { role: string; position: number; employeeId: string | null }[];
  }[];
}): Promise<{ written: number; dates: string[] }> {
  const columns = args.columns.filter((c) => c.entries.some((e) => e.employeeId));
  if (columns.length === 0) return { written: 0, dates: [] };

  /*
   * `isClosing` נגזר מהתבנית ולא מהגיליון: הגיליון אומר רק מי מגיע ובאיזה
   * סדר, ומשבצות הסגירה הן האחרונות בתבנית. כך "האחרונים סוגרים" נשאר
   * נכון גם אם התבנית תשתנה.
   */
  const template = await fridaySlots();
  const closing = new Set(
    template.filter((t) => t.isClosing).map((t) => `${t.role}|${t.position}`),
  );

  const rows = columns.flatMap((c) =>
    c.entries
      .filter((e) => e.employeeId)
      .map((e) => ({
        date: fromKey(c.date),
        role: e.role,
        position: e.position,
        employeeId: e.employeeId!,
        isClosing: closing.has(`${e.role}|${e.position}`),
        source: "manual",
      })),
  );

  await prisma.$transaction([
    ...columns.map((c) =>
      prisma.fridayPlan.deleteMany({
        where: {
          date: fromKey(c.date),
          OR: [
            { role: { in: [...new Set(c.entries.map((e) => e.role))] } },
            /*
             * גם מי שיובא ויושב היום בתפקיד אחר באותו שישי. אחרת האילוץ
             * "אדם אחד פעם אחת בשישי" היה גורם ל-skipDuplicates להשמיט את
             * השורה החדשה בשקט, והגיליון לא היה נכתב כמו שהוא.
             */
            {
              employeeId: {
                in: c.entries.flatMap((e) => (e.employeeId ? [e.employeeId] : [])),
              },
            },
          ],
        },
      }),
    ),
    prisma.fridayPlan.createMany({ data: rows, skipDuplicates: true }),
  ]);

  return { written: rows.length, dates: columns.map((c) => c.date) };
}

/**
 * מפרסם את הסבב לעובדים.
 *
 * פעולה מפורשת ולא תוצאת לוואי של יצירת הסבב: המנהל מייבא, מתקן ומריץ
 * מחדש כמה פעמים שצריך, ורק כשהוא מסיים העובדים רואים משהו. אחרת כל
 * לחיצה על "השלמה אוטומטית" הייתה שולחת התראה על שיבוץ שעוד ישתנה.
 *
 * מפרסם רק את מה שטרם פורסם, ומודיע רק למי שיש לו שיבוץ חדש. לחיצה
 * שנייה בלי שינוי אינה שולחת דבר — זה מה שמאפשר ללחוץ בלי לחשוש.
 */
export async function publishFridayPlan(dates: Date[]): Promise<{
  published: number;
  notified: number;
}> {
  const rows = await loadFridayPlanRaw(dates, { unpublishedOnly: true });
  if (rows.length === 0) return { published: 0, notified: 0 };

  const now = new Date();
  await prisma.fridayPlan.updateMany({
    where: { id: { in: rows.map((r) => r.id) } },
    data: { publishedAt: now },
  });

  const byEmployee = new Map<string, Date[]>();
  for (const r of rows) {
    if (!byEmployee.has(r.employeeId)) byEmployee.set(r.employeeId, []);
    byEmployee.get(r.employeeId)!.push(r.date);
  }

  for (const [employeeId, days] of byEmployee) {
    await notify([employeeId], {
      kind: "friday-published",
      title: days.length === 1 ? "סבב שישי" : `סבב שישי — ${days.length} משמרות`,
      /*
       * `dateList` ולא `join`: תאריך הוא ריצת LTR, והפסיקים הנייטרליים
       * ביניהם הפכו את הרשימה כולה. ראה ההסבר ב-src/lib/time.ts.
       */
      body: `שובצת ל: ${dateList(days)}. אם אחד מהם לא מתאים, אפשר למסור או להחליף מהאזור האישי.`,
      url: "/me/fridays",
    });
  }

  return { published: rows.length, notified: byEmployee.size };
}

/** שורות גולמיות בטווח, עם אפשרות לסנן לפי פרסום */
async function loadFridayPlanRaw(
  dates: Date[],
  opts: { unpublishedOnly?: boolean; publishedOnly?: boolean } = {},
) {
  if (dates.length === 0) return [];
  const wanted = new Set(dates.map(dateKey));
  const sorted = [...dates].sort((a, b) => a.getTime() - b.getTime());

  const rows = await prisma.fridayPlan.findMany({
    where: {
      date: {
        gte: zonedMidnight(sorted[0]),
        lt: addDays(zonedMidnight(sorted[sorted.length - 1]), 1),
      },
      ...(opts.unpublishedOnly ? { publishedAt: null } : {}),
      ...(opts.publishedOnly ? { publishedAt: { not: null } } : {}),
    },
    select: { id: true, date: true, employeeId: true },
  });
  return rows.filter((r) => wanted.has(dateKey(r.date)));
}

/**
 * שעות הגעה ששונו לשישי מסוים בלבד, לתאריכים שנתבקשו.
 * מפתח: `${date}|${role}|${position}` — אותו מפתח כמו בטבלת הסבב.
 */
export async function loadFridayOverrides(dates: Date[]): Promise<Record<string, string>> {
  if (dates.length === 0) return {};
  const sorted = [...dates].sort((a, b) => a.getTime() - b.getTime());
  const rows = await prisma.fridayTimeOverride.findMany({
    where: {
      date: {
        gte: zonedMidnight(sorted[0]),
        lt: addDays(zonedMidnight(sorted[sorted.length - 1]), 1),
      },
    },
    select: { date: true, role: true, position: true, startTime: true },
  });
  return Object.fromEntries(
    rows.map((r) => [`${dateKey(r.date)}|${r.role}|${r.position}`, r.startTime]),
  );
}

export type PublishedFriday = {
  date: string;
  role: string;
  isClosing: boolean;
  position: number | null;
  /** שעת ההגעה, מהמשבצת שהמיקום ממפה אליה */
  startTime: string | null;
  employeeId: string;
  fullName: string;
};

/**
 * הסבב כפי שהעובדים רואים אותו: רק מה שפורסם, ורק מכאן והלאה.
 *
 * שעת ההגעה נגזרת מהתבנית דרך המיקום — זה מה שהופך את המספר למידע
 * שימושי לעובד במקום למספר סידורי חסר משמעות.
 */
export async function publishedRotation(dates: Date[]): Promise<PublishedFriday[]> {
  if (dates.length === 0) return [];
  const wanted = new Set(dates.map(dateKey));
  const sorted = [...dates].sort((a, b) => a.getTime() - b.getTime());

  const [rows, template, overrides] = await Promise.all([
    prisma.fridayPlan.findMany({
      where: {
        date: {
          gte: zonedMidnight(sorted[0]),
          lt: addDays(zonedMidnight(sorted[sorted.length - 1]), 1),
        },
        publishedAt: { not: null },
      },
      select: {
        date: true,
        role: true,
        isClosing: true,
        position: true,
        employeeId: true,
        employee: { select: { fullName: true } },
      },
      orderBy: [{ date: "asc" }, { role: "asc" }, { position: "asc" }],
    }),
    fridaySlots(),
    loadFridayOverrides(dates),
  ]);

  return rows
    .filter((r) => wanted.has(dateKey(r.date)))
    .map((r) => ({
      date: dateKey(r.date),
      role: r.role,
      isClosing: r.isClosing,
      position: r.position,
      startTime:
        r.position == null
          ? null
          : (overrides[`${dateKey(r.date)}|${r.role}|${r.position}`] ??
            arrivalAt(template, r.role, r.position)),
      employeeId: r.employeeId,
      fullName: r.employee.fullName,
    }));
}
