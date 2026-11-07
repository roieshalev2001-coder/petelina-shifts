import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge, Card, EmptyState, LinkButton, Num, PageHeader } from "@/components/ui";
import { currentUser, requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { DAY_NAMES } from "@/lib/domain";
import { loadSubmissionForm, saveSubmission } from "@/lib/submissions";
import { pickSubmitWeek } from "@/lib/week";
import { addDays, formatDate, formatDateTime, formatDayMonth } from "@/lib/time";
import { templateFromForm } from "@/lib/availability-template";
import { SubmitForm } from "./SubmitForm";

/**
 * טופס ההגשה.
 *
 * `?week=` ולא "השבוע הפתוח": אפשר שיהיו כמה שבועות פתוחים במקביל (ראה
 * openNextWeek). קודם הדף שלף `findFirst` לפי `status:"open"`, ולכן עם
 * שני שבועות פתוחים **כל** ההגשות היו נכנסות למוקדם מביניהם בשקט.
 *
 * בלי פרמטר: שבוע פתוח אחד — נכנסים ישר אליו, כמו תמיד. כמה — מוצגת
 * בחירה, כי אי אפשר לנחש לאיזה מהם העובד התכוון.
 */
export default async function SubmitPage({
  searchParams,
}: PageProps<"/me/submit">) {
  const employee = await requireUser();
  const requested = (await searchParams).week;

  const openWeeks = await prisma.week.findMany({
    where: { status: "open", deletedAt: null },
    orderBy: { weekStart: "asc" },
    select: {
      id: true,
      weekStart: true,
      deadline: true,
      submissions: {
        where: { employeeId: employee.id },
        select: { submittedAt: true },
      },
    },
  });

  if (openWeeks.length === 0) {
    return (
      <EmptyState
        title="אין כרגע שבוע פתוח להגשה"
        hint="המנהל יפתח שבוע ותקבל הודעה."
      />
    );
  }

  const weekId = pickSubmitWeek(
    requested,
    openWeeks.map((w) => w.id),
  );

  if (!weekId) {
    return (
      <>
        <PageHeader
          title="לאיזה שבוע להגיש?"
          subtitle={`${openWeeks.length} שבועות פתוחים כרגע. אפשר להגיש לכולם, כל אחד בתורו.`}
        />
        <ul className="space-y-2">
          {openWeeks.map((week) => (
            <li key={week.id}>
              <Link
                href={`/me/submit?week=${week.id}`}
                className="block transition hover:bg-paper"
              >
                <Card className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                  <span className="num font-semibold">
                    {formatDayMonth(week.weekStart)}–
                    {formatDayMonth(addDays(week.weekStart, 5))}
                  </span>
                  {week.submissions[0]?.submittedAt ? (
                    <Badge tone="green">הוגש ✓</Badge>
                  ) : (
                    <Badge tone="amber">טרם הוגש</Badge>
                  )}
                  <span className="num mr-auto text-xs text-muted">
                    עד {formatDateTime(week.deadline)}
                  </span>
                </Card>
              </Link>
            </li>
          ))}
        </ul>
      </>
    );
  }

  const data = await loadSubmissionForm(weekId, employee.id);
  if (!data) notFound();

  const range = `${formatDayMonth(data.week.weekStart)}–${formatDayMonth(addDays(data.week.weekStart, 5))}`;

  /*
   * אחרי המועד: מה שהגשת, לקריאה בלבד.
   *
   * קודם זה היה מבוי סתום — שורה "מועד ההגשה חלף", קישור "חזרה", והסרגל
   * התחתון נעלם. העובד לא יכול היה אפילו לבדוק מה הוא סימן. עכשיו הסרגל
   * נשאר (אין כאן `.submit-bar`) והסימונים מוצגים כמו שנשלחו.
   */
  if (!data.isOpen) {
    const slotById = new Map(data.slots.map((s) => [s.id, s]));
    const byDay = new Map<number, { time: string; preferred: boolean; sort: string }[]>();
    for (const mark of data.marks) {
      const slot = slotById.get(mark.slotId);
      if (!slot) continue;
      const list = byDay.get(slot.dayOfWeek) ?? [];
      list.push({
        time: `${slot.startTime}–${slot.isClosing ? "סגירה" : slot.endTime}`,
        preferred: mark.state === "preferred",
        sort: slot.startTime,
      });
      byDay.set(slot.dayOfWeek, list);
    }
    const days = [...byDay.entries()].sort((a, b) => a[0] - b[0]);

    return (
      <>
        <PageHeader
          title="ההגשה נסגרה"
          subtitle={
            <>
              שבוע <Num>{range}</Num> · המועד היה <Num>{formatDateTime(data.week.deadline)}</Num>.
              לשינויים יש לפנות למנהל.
            </>
          }
        />
        {days.length === 0 ? (
          <EmptyState title="לא סימנת משמרות לשבוע הזה" />
        ) : (
          <section>
            <h2 className="section-title">מה הגשת</h2>
            <ul className="divide-y divide-line border-b border-line">
              {days.map(([day, list]) => (
                <li key={day} className="flex flex-wrap items-baseline gap-x-4 gap-y-1 py-3">
                  <span className="w-16 shrink-0 font-bold">{DAY_NAMES[day]}</span>
                  <span className="flex flex-wrap gap-x-4 gap-y-1">
                    {list
                      .sort((a, b) => a.sort.localeCompare(b.sort))
                      .map((m) => (
                        <span key={m.time}>
                          <span className="num">{m.time}</span>
                          {m.preferred && <span className="mr-1 text-brand" aria-label="מעדיף">★</span>}
                        </span>
                      ))}
                  </span>
                </li>
              ))}
            </ul>
            {data.submission?.note && (
              <p className="mt-4 text-sm">
                <span className="font-bold">הערה למנהל: </span>
                {data.submission.note}
              </p>
            )}
          </section>
        )}
        <LinkButton href="/me" variant="secondary" className="mt-6">
          חזרה לבית
        </LinkButton>
      </>
    );
  }

  async function save(payload: {
    marks: {
      slotId: string;
      state: "available" | "preferred";
      earliestStart: string | null;
      latestEnd: string | null;
    }[];
    note: string | null;
  }) {
    "use server";
    // אימות מחדש בצד השרת — לא סומכים על מזהה שהגיע מהלקוח
    const me = await currentUser();
    if (!me) return { ok: false, error: "פג תוקף החיבור — יש להיכנס מחדש" };

    try {
      await saveSubmission({
        weekId: weekId!,
        employeeId: me.id,
        marks: payload.marks,
        note: payload.note,
        finalize: true,
      });
      return { ok: true };
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error.message : "השמירה נכשלה",
      };
    }
  }

  /*
   * "שמירה כשבוע הרגיל שלי". הלקוח שולח מזהי משבצות, והשרת ממיר אותם
   * ליום, תפקיד ושעות מתוך המשבצות של השבוע הזה — לא סומכים על הלקוח
   * לגבי השעות. ראה src/lib/availability-template.ts.
   */
  async function saveUsualWeek(payload: {
    marks: { slotId: string; state: "available" | "preferred" }[];
    windows: { dayOfWeek: number; earliestStart: string; latestEnd: string }[];
  }) {
    "use server";
    const me = await currentUser();
    if (!me) return { ok: false, error: "פג תוקף החיבור — יש להיכנס מחדש" };
    const form = await loadSubmissionForm(weekId!, me.id);
    if (!form) return { ok: false, error: "השבוע לא נמצא" };

    const data = templateFromForm(form.slots, payload.marks, payload.windows);
    const savedAt = new Date();
    await prisma.availabilityTemplate.upsert({
      where: { employeeId: me.id },
      create: { employeeId: me.id, data: JSON.stringify(data), savedAt },
      update: { data: JSON.stringify(data), savedAt },
    });
    return { ok: true, savedAt: formatDate(savedAt) };
  }

  return (
    <>
      {/*
        טווח התאריכים בתוך `Num` ולא בתוך מחרוזת הכותרת: מחוץ לבידוד LTR
        הוא התהפך ל-"23/10–18/10", בזמן שבבית אותו שבוע הוצג "18/10–23/10".
      */}
      <PageHeader
        title="הגשת משמרות"
        subtitle={
          <>
            <span className="font-bold text-ink">
              שבוע <Num>{range}</Num>
            </span>
            {" · "}
            בחר את השעות שאתה פנוי בהן, והמשמרות שמתאימות יסומנו לבד. סמן כמה
            שיותר — ככה יש סיכוי טוב יותר שתקבל את מה שביקשת.
          </>
        }
      />
      <SubmitForm
        weekStart={data.week.weekStart.toISOString()}
        slots={data.slots}
        existing={data.marks}
        existingNote={data.submission?.note ?? null}
        alreadySubmitted={Boolean(data.submission?.submittedAt)}
        deadline={formatDateTime(data.week.deadline)}
        usualWeek={
          data.usualWeek
            ? { data: data.usualWeek.data, savedAt: formatDate(data.usualWeek.savedAt) }
            : null
        }
        save={save}
        saveUsualWeek={saveUsualWeek}
      />
    </>
  );
}
