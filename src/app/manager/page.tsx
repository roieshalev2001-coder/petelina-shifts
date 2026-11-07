import Link from "next/link";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  Badge,
  Card,
  EmptyState,
  Meter,
  Notice,
  Num,
  PageHeader,
} from "@/components/ui";
import { requireManager } from "@/lib/auth";
import { prisma } from "@/lib/db";
import type { WeekStatus } from "@/lib/domain";
import {
  addDays,
  defaultDeadlineFor,
  formatDateTime,
  formatDayMonth,
  nextAvailableWeekStart,
  zonedParts,
  zonedTime,
} from "@/lib/time";
import { createWeek, seedFridayPlan } from "@/lib/weeks";
import {
  acceptingSubmissionsWhere,
  effectiveWeekStatus,
  isDeadlinePassed,
  splitWeeks,
  weekStatusBadge,
} from "@/lib/week";
import { OpenWeekButton } from "./OpenWeekButton";

/**
 * פותח את יום ראשון הפנוי הקרוב ביותר. אין בחירת תאריך בכוונה: השבוע חייב
 * להתחיל בראשון, וכל תאריך אחר היה מייצר שבוע שהעמודות שלו לא תואמות לימים.
 */
async function openNextWeek(confirmed: boolean) {
  "use server";
  await requireManager();

  /*
   * כמה שבועות פתוחים — אבל רק באישור מפורש.
   *
   * פעם זו הייתה חסימה: מסך ההגשה של העובד שלף `findFirst` לפי
   * status:"open", ולכן עם שני שבועות פתוחים **כל** ההגשות היו נכנסות
   * למוקדם מביניהם בשקט. היום מסך ההגשה מקבל `?week=` ומציג בחירה,
   * ולכן אפשר לפתוח שניים — אבל זו עדיין החלטה שצריך לקחת ביודעין.
   *
   * השער כאן ולא רק בדיאלוג שבדפדפן: `confirm` הוא הסבר למשתמש, לא
   * אכיפה. ראה OpenWeekButton.
   *
   * נספרים רק שבועות שעוד מקבלים הגשות: שבוע שהמועד שלו עבר אינו אפשרות
   * לבחירה בשביל העובד. אותו כלל כמו הרשימה במסך — אילו השער כאן ספר אותו
   * והמסך לא, השרת היה מסרב לפתיחה בלי שהמנהל ראה שאלה.
   */
  const open = await prisma.week.findMany({
    where: acceptingSubmissionsWhere(),
    select: { weekStart: true },
    orderBy: { weekStart: "asc" },
  });
  if (open.length > 0 && !confirmed) {
    return {
      error: `כבר פתוח שבוע להגשה (${open[0].weekStart.toLocaleDateString("he-IL")}). פתיחת שבוע נוסף דורשת אישור.`,
    };
  }

  const existing = await prisma.week.findMany({ select: { weekStart: true } });
  const weekStart = nextAvailableWeekStart(existing.map((w) => w.weekStart));

  const week = await createWeek({
    weekStart,
    deadline: defaultDeadlineFor(weekStart),
  });

  /*
   * סבב שישי נזרע מיד עם פתיחת השבוע, ולא בבניית הסידור.
   *
   * שישי אינו נגזר מההגשות אלא נקבע מראש, ולכן הוא צריך להיות שם עוד
   * לפני שהעובדים מתחילים לסמן — כדי שמי שכבר משובץ יראה את זה ויוכל
   * למסור אם צריך, במקום לגלות בסוף.
   */
  /*
   * ערך ההחזרה אינו נבדק כאן במכוון: אחרי ה-redirect אין לאן להציג אותו,
   * ומצב הסבב נגזר ממילא מחדש במסך השבוע (FridayRotation) — שם הוא גם
   * נשאר נכון אם הסבב ישתנה אחרי הפתיחה.
   */
  await seedFridayPlan(week.id);

  revalidatePath("/manager");
  redirect(`/manager/weeks/${week.id}`);
}

export default async function ManagerHome() {
  /*
   * השער והנתונים יוצאים יחד ולא בזה אחר זה.
   *
   * `requireManager` הוא שאילתה למסד בפני עצמה, ו-`await` לפניה עצר את
   * הדף עד שהיא חוזרת — סבב רשת שלם לפני שהשאילתות של המסך בכלל התחילו,
   * בכל ניווט. ההרשאה נשארת קובעת: `redirect` זורק, והתוצאות שנשלפו
   * במקביל נזרקות איתו ולא מגיעות לאיש.
   */
  const [, weeks, fridayPlanned] = await Promise.all([
    requireManager(),
    prisma.week.findMany({
      orderBy: { weekStart: "desc" },
      include: { _count: { select: { slots: true, assignments: true } } },
      take: 20,
    }),
    /*
     * האם כבר נוצר סבב לחודש הבא. אין קרון ואין תהליך רקע (זו הסיבה שגם
     * לפקיעת החילופים אין אחד), ולכן התזכורת היא באנר מה-15 בחודש —
     * ובדיוק כמו כל דבר אחר כאן, היא נעלמת מרגע שהמשימה בוצעה.
     */
    (async () => {
      const now = zonedParts(new Date());
      if (now.day < 15) return true;
      const next =
        now.month === 12
          ? { year: now.year + 1, month: 1 }
          : { year: now.year, month: now.month + 1 };
      const count = await prisma.fridayPlan.count({
        where: {
          date: {
            gte: zonedTime(next.year, next.month, 1),
            lt: zonedTime(next.year, next.month + 1, 1),
          },
        },
      });
      return count > 0;
    })(),
  ]);

  const nextStart = nextAvailableWeekStart(weeks.map((w) => w.weekStart));
  const nextDeadline = defaultDeadlineFor(nextStart);
  /*
   * כמה שבועות יכולים להיות פתוחים במקביל — ראה ההסבר ב-openNextWeek.
   * הרשימה עולה ולא יורדת כמו `weeks`: הקרוב ביותר נקרא ראשון, כי הוא
   * זה שהמועד האחרון שלו מתקרב.
   */
  const { recent, archive } = splitWeeks(weeks);
  // רק מה שעוד מקבל הגשות — ראה effectiveWeekStatus והשער ב-openNextWeek
  const openWeeks = recent
    .filter(
      (w) => effectiveWeekStatus(w.status as WeekStatus, isDeadlinePassed(w)) === "open",
    )
    .sort((a, b) => a.weekStart.getTime() - b.weekStart.getTime());
  const weekLabel = (start: Date) =>
    `${formatDayMonth(start)}–${formatDayMonth(addDays(start, 5))}`;

  return (
    <div className="mx-auto max-w-3xl">
      {!fridayPlanned && (
        <Notice title="סבב שישי לחודש הבא טרם נוצר">
          <p className="text-sm">
            אמצע החודש — זה הזמן לבנות את הסבב, כדי שהצוות יידע מראש.{" "}
            <Link href="/manager/fridays" className="underline">
              למסך הסבב
            </Link>
          </p>
        </Notice>
      )}

      <PageHeader
        title="שבועות"
        subtitle="פתיחת שבוע מעתיקה את התבנית הנוכחית ומאפשרת לעובדים להגיש עד המועד האחרון."
      />

      <div className="space-y-4">
        <Card className="flex flex-wrap items-center gap-x-6 gap-y-4">
          <div className="min-w-0">
            <h2 className="font-semibold">פתיחת שבוע להגשה</h2>
            {openWeeks.length > 0 ? (
              <p className="mt-1 text-sm">
                פתוח להגשה:{" "}
                <span className="num">
                  {openWeeks.map((w) => weekLabel(w.weekStart)).join(", ")}
                </span>
                . אפשר לפתוח גם שבוע נוסף במקביל — העובדים יראו את כולם
                ויבחרו לאיזה מהם הם מגישים.
              </p>
            ) : (
              <p className="mt-1 text-sm text-muted">
                השבוע תמיד מתחיל ביום ראשון. המועד האחרון ייקבע ל
                <span className="num">{formatDateTime(nextDeadline)}</span>{" "}
                וניתן לשנות אותו אחר כך.
              </p>
            )}
          </div>
          <OpenWeekButton
            action={openNextWeek}
            openLabels={openWeeks.map((w) => weekLabel(w.weekStart))}
            label={
              <>
                פתיחת השבוע של{" "}
                <span className="num">{weekLabel(nextStart)}</span>
              </>
            }
          />
        </Card>

        {recent.length === 0 && (
          <EmptyState
            title="עדיין לא נפתח אף שבוע"
            hint="פתח שבוע כדי לשלוח לעובדים קישורי הגשה."
          />
        )}

        {recent.map((week) => {
          const status = week.status as WeekStatus;
          // אדום כשהמועד עבר, גם אם השבוע עוד "פתוח" — ראה weekStatusBadge
          const badge = weekStatusBadge(status, isDeadlinePassed(week));
          const filled = week._count.assignments;
          const total = week._count.slots;

          return (
            <Link
              key={week.id}
              href={`/manager/weeks/${week.id}`}
              className="block transition hover:-translate-y-px"
            >
              <Card accent={badge.tone} className="hover:border-stone-300">
                <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                  <span className="num text-xl font-bold">
                    {formatDayMonth(week.weekStart)}–
                    {formatDayMonth(addDays(week.weekStart, 5))}
                  </span>
                  <Badge tone={badge.tone}>{badge.label}</Badge>
                  <span className="mr-auto text-xs text-muted">
                    הגשה עד <Num>{formatDateTime(week.deadline)}</Num>
                  </span>
                </div>

                <div className="mt-3">
                  <Meter
                    value={filled}
                    max={total}
                    label={
                      <>
                        <span>איוש</span>
                        <span className="num">
                          {filled}/{total}
                        </span>
                      </>
                    }
                  />
                </div>
              </Card>
            </Link>
          );
        })}

        {/* הקישור מופיע רק כשיש מה לראות שם */}
        {archive.length > 0 && (
          <Link
            href="/manager/history"
            className="block border border-line bg-surface p-4 text-sm transition hover:bg-paper"
          >
            סידורי עבר
            <span className="text-muted">
              {" · "}
              {archive.length === 1 ? "סידור אחד" : `${archive.length} סידורים`}
            </span>
            <span aria-hidden className="mr-auto float-left text-muted">
              ‹
            </span>
          </Link>
        )}
      </div>
    </div>
  );
}
