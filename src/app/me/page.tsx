import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { LinkButton, Num } from "@/components/ui";
import { currentUser, requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { newCalendarToken } from "@/lib/calendar-feed";
import { resolveBaseUrl } from "@/lib/site-url";
import {
  claimSwapOffer,
  cancelSwapOffer,
  loadSwapBoard,
  openSwapOffer,
} from "@/lib/swap-board";
import { DAY_NAMES } from "@/lib/domain";
import { notify, swapAudience } from "@/lib/notify";
import { publishedRotation } from "@/lib/friday-plan";
import { nextFridays } from "@/lib/fridays";
import { dayLabel, firstNameOf, greetingFor, timeLeftParts } from "@/lib/hero";
import {
  addDays,
  formatDateTime,
  formatDayMonth,
  fromDateInputValue,
  zonedMidnight,
  zonedParts,
} from "@/lib/time";
import { Hero, type HeroFocus } from "./Hero";
import { MyShifts } from "./MyShifts";
import { WeekRows } from "./WeekRows";
import { SwapBoard } from "./SwapBoard";

export default async function EmployeeHome() {
  const employee = await requireUser();

  const [openWeeks, publishedWeek, rotation] = await Promise.all([
    // כמה שבועות יכולים להיות פתוחים במקביל — ראה openNextWeek
    prisma.week.findMany({
      // שבוע מאורכב אינו קיים בשביל העובד — ראה archiveWeek
      where: { status: "open", deletedAt: null },
      orderBy: { weekStart: "asc" },
      include: {
        submissions: { where: { employeeId: employee.id } },
        // ספירה ולא שליפה: הערך היחיד שנצרך ממנו הוא המספר, וקודם נשלפו
        // עד 93 שורות מהמסד רק כדי לעשות עליהן .length
        _count: {
          select: { availabilities: { where: { employeeId: employee.id } } },
        },
      },
    }),
    prisma.week.findFirst({
      where: { status: "published", deletedAt: null },
      orderBy: { weekStart: "desc" },
      select: { id: true, weekStart: true },
    }),
    publishedRotation(nextFridays(8)),
  ]);

  const myFridays = rotation.filter((r) => r.employeeId === employee.id);

  const board = publishedWeek
    ? await loadSwapBoard({
        weekId: publishedWeek.id,
        employeeId: employee.id,
        roles: employee.roles,
      })
    : null;

  const now = new Date();
  const weekLabel = (start: Date) =>
    `${formatDayMonth(start)}–${formatDayMonth(addDays(start, 5))}`;

  /*
   * שבוע פתוח שהמועד שלו עבר אינו פתוח בשביל העובד — הטופס נעול (ראה
   * src/lib/submissions.ts). קודם הוא קיבל כפתור אדום "למילוי ההגשה"
   * שהוביל לטופס נעול. עכשיו הוא יורד לשורה שקטה עם "מה הגשתי".
   */
  const weeks = openWeeks.map((week) => ({
    id: week.id,
    label: weekLabel(week.weekStart),
    myMarks: week._count.availabilities,
    submitted: Boolean(week.submissions[0]?.submittedAt),
    deadline: week.deadline,
    accepting: week.deadline.getTime() > now.getTime(),
  }));
  const accepting = weeks.filter((w) => w.accepting);
  const closed = weeks.filter((w) => !w.accepting);

  /*
   * המשמרת הבאה מהסידור שפורסם. השבוע מתחיל בחצות ישראל של יום ראשון,
   * ולכן התאריך של משמרת הוא פשוט יום ראשון + היום בשבוע.
   */
  const today = zonedMidnight(now);
  const nextShift = publishedWeek
    ? (board?.myShifts ?? [])
        .map((shift) => {
          const date = addDays(zonedMidnight(publishedWeek.weekStart), shift.dayOfWeek);
          const daysAhead = Math.round((date.getTime() - today.getTime()) / 86_400_000);
          return { shift, date, daysAhead };
        })
        .filter((x) => x.daysAhead >= 0)
        .sort(
          (a, b) =>
            a.daysAhead - b.daysAhead ||
            a.shift.actualStart.localeCompare(b.shift.actualStart),
        )[0]
    : undefined;

  /** הדבר האחד שחשוב עכשיו — ראה ההסבר ב-Hero.tsx */
  const pending = accepting.find((w) => !w.submitted);
  const sent = accepting.find((w) => w.submitted);
  const focus: HeroFocus = pending
    ? {
        kind: "deadline",
        weekId: pending.id,
        weekLabel: pending.label,
        ...timeLeftParts(pending.deadline.getTime() - now.getTime()),
      }
    : nextShift
      ? {
          kind: "next-shift",
          day: dayLabel(nextShift.daysAhead, DAY_NAMES[nextShift.shift.dayOfWeek]),
          date: formatDayMonth(nextShift.date),
          hours: `${nextShift.shift.actualStart}–${nextShift.shift.actualEnd}`,
          submitted: sent ? { weekId: sent.id, weekLabel: sent.label } : undefined,
        }
      : sent
        ? { kind: "submitted", weekId: sent.id, weekLabel: sent.label, marks: sent.myMarks }
        : { kind: "calm" };

  /** שבועות פתוחים נוספים — כל מה שלא נכנס לגיבור */
  const otherAccepting = accepting.filter(
    (w) =>
      !(focus.kind === "deadline" && w.id === focus.weekId) &&
      !(focus.kind === "submitted" && w.id === focus.weekId) &&
      !(focus.kind === "next-shift" && w.id === focus.submitted?.weekId),
  );

  /*
   * שלוש הפעולות של מסירת המשמרות.
   *
   * כולן קוראות את הסשן מחדש בשרת — מזהה העובד לעולם אינו פרמטר, ולכן
   * אין מה לזייף מהלקוח. מחזירות {ok,error} במקום לזרוק,
   * כדי ש"מישהו הקדים אותך" יוצג בשורה ולא יפיל את המסך.
   */
  async function offer(slotId: string) {
    "use server";
    const me = await currentUser();
    if (!me) return { ok: false as const, error: "פג תוקף החיבור — יש להיכנס מחדש" };
    try {
      await openSwapOffer({ employeeId: me.id, slotId });

      /*
       * מי מקבל: כל מי שכשיר לתפקיד, וכל המנהלים.
       *
       * ההתראה נשלחת אחרי שההצעה כבר נשמרה, ו-notify עוטף את הדחיפה כך
       * שכשל שלה לא יפיל את המסירה — משמרת שלא נמסרה כי שרת הדחיפה של
       * גוגל לא ענה היא באג גרוע בהרבה מהתראה שלא הגיעה.
       */
      const slot = await prisma.weekSlot.findUnique({
        where: { id: slotId },
        select: { role: true, dayOfWeek: true, date: true, startTime: true },
      });
      if (slot) {
        const { eligible, managers } = await swapAudience({
          role: slot.role,
          excludeId: me.id,
        });
        await notify([...eligible, ...managers], {
          kind: "swap-offered",
          title: "משמרת פנויה",
          body: `${me.fullName} מוסר ${DAY_NAMES[slot.dayOfWeek]} ${formatDayMonth(slot.date)} מ-${slot.startTime}. הראשון שלוקח מקבל אותה.`,
          url: "/me",
        });
      }

      revalidatePath("/me");
      return { ok: true as const };
    } catch (error) {
      return {
        ok: false as const,
        error: error instanceof Error ? error.message : "הפעולה נכשלה",
      };
    }
  }

  async function cancel(offerId: string) {
    "use server";
    const me = await currentUser();
    if (!me) return { ok: false as const, error: "פג תוקף החיבור — יש להיכנס מחדש" };
    try {
      await cancelSwapOffer({ employeeId: me.id, offerId });
      revalidatePath("/me");
      return { ok: true as const };
    } catch (error) {
      return {
        ok: false as const,
        error: error instanceof Error ? error.message : "הפעולה נכשלה",
      };
    }
  }

  /*
   * הקישור למנוי היומן האישי (ראה src/lib/calendar-feed.ts). נוצר בפעם
   * הראשונה שהעובד פותח "הוספה ליומן" ולא בכל טעינה של הדף — רוב העובדים
   * אף פעם לא ייגעו בזה. הזהות מה-session, כמו בכל פעולה כאן.
   */
  async function calendarLink(renew: boolean): Promise<string | null> {
    "use server";
    const me = await currentUser();
    if (!me) return null;
    let token = renew
      ? null
      : (await prisma.employee.findUnique({ where: { id: me.id }, select: { calendarToken: true } }))
          ?.calendarToken ?? null;
    if (!token) {
      token = newCalendarToken();
      await prisma.employee.update({ where: { id: me.id }, data: { calendarToken: token } });
    }
    const base = resolveBaseUrl((await headers()).get("host"));
    return `${base}/api/calendar/${token}.ics`;
  }

  async function claim(offerId: string) {
    "use server";
    const me = await currentUser();
    if (!me) return { ok: false as const, error: "פג תוקף החיבור — יש להיכנס מחדש" };
    try {
      const { weekId, slotId } = await claimSwapOffer({ employeeId: me.id, offerId });

      /*
       * רק המנהלים. ההצעה נסגרה לאחרים ברגע התפיסה, ואין להם מה לעשות
       * עם ההודעה — למנהל דווקא יש: בלי האישור שלו כלום לא קורה.
       */
      const slot = await prisma.weekSlot.findUnique({
        where: { id: slotId },
        select: { dayOfWeek: true, date: true, startTime: true },
      });
      const managers = await prisma.employee.findMany({
        where: { active: true, canManage: true },
        select: { id: true },
      });
      if (slot) {
        await notify(
          managers.map((m) => m.id),
          {
            kind: "swap-claimed",
            title: "חילוף ממתין לאישורך",
            body: `${me.fullName} לקח את ${DAY_NAMES[slot.dayOfWeek]} ${formatDayMonth(slot.date)} מ-${slot.startTime}. המשמרת לא תעבור עד שתאשר.`,
            url: `/manager/weeks/${weekId}`,
          },
        );
      }

      revalidatePath("/me");
      revalidatePath(`/manager/weeks/${weekId}`);
      return { ok: true as const };
    } catch (error) {
      return {
        ok: false as const,
        error: error instanceof Error ? error.message : "הפעולה נכשלה",
      };
    }
  }

  return (
    <div>
      {/* לקורא מסך: כותרת לעמוד. הגיבור עצמו הוא פסקאות ולא כותרות */}
      <h1 className="sr-only">האזור האישי</h1>
      <Hero
        greeting={greetingFor(zonedParts(now).hour)}
        firstName={firstNameOf(employee.fullName)}
        focus={focus}
      />

      <div className="rise space-y-8">
        <WeekRows
          rows={[
            ...otherAccepting.map((w) => ({
              id: w.id,
              label: w.label,
              accepting: true,
              submitted: w.submitted,
              myMarks: w.myMarks,
              deadline: formatDateTime(w.deadline),
            })),
            ...closed.map((w) => ({
              id: w.id,
              label: w.label,
              accepting: false,
              submitted: w.submitted,
              myMarks: w.myMarks,
              deadline: formatDateTime(w.deadline),
            })),
          ]}
        />

        {publishedWeek && board && (board.myShifts.length > 0 || board.givenAway.length > 0) && (
          <MyShifts
            weekLabel={weekLabel(publishedWeek.weekStart)}
            shifts={board.myShifts}
            givenAway={board.givenAway}
            calendarHref="/me/calendar"
            calendarLink={calendarLink}
            actions={{ offer, cancel }}
          />
        )}

        {/*
          סבב שישי חי מחוץ לשבוע: הוא מתפרסם שמונה שישיים קדימה, הרבה לפני
          שהשבוע נפתח. לכן הכניסה אליו כאן ואינה תלויה בשבוע פתוח.
        */}
        {myFridays.length > 0 && (
          <section>
            <h2 className="section-title">סבב שישי</h2>
            <p className="mt-3">
              שובצת ל<Num>{myFridays.length}</Num>{" "}
              {myFridays.length === 1 ? "שישי" : "שישיים"}:{" "}
              {/*
                `<bdi>` לכל תאריך: בלעדיו הפסיקים הנייטרליים מצרפים את
                הרשימה לריצת LTR אחת והיא נקראת הפוך. ראה dateList
                ב-src/lib/time.ts — שם אותו תיקון בתווי יוניקוד, לטקסט
                של ההתראה שאינו HTML.
              */}
              {myFridays.slice(0, 4).map((f, i) => (
                <span key={f.date}>
                  {i > 0 && ", "}
                  <bdi className="num font-semibold">
                    {formatDayMonth(fromDateInputValue(f.date))}
                  </bdi>
                </span>
              ))}
              {myFridays.length > 4 && <span className="text-muted"> ועוד</span>}
            </p>
            <LinkButton href="/me/fridays" variant="secondary" size="sm" className="mt-3">
              לסבב המלא
            </LinkButton>
          </section>
        )}

        {board && <SwapBoard offers={board.openOffers} actions={{ claim }} />}
      </div>
    </div>
  );
}
