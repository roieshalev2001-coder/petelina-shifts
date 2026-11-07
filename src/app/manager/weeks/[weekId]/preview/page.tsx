import Link from "next/link";
import { notFound } from "next/navigation";
import { LinkButton, Notice, Num, PageHeader } from "@/components/ui";
import { requireManager } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { submitRolesOf } from "@/lib/domain";
import { loadSubmissionForm } from "@/lib/submissions";
import { addDays, formatDate, formatDateTime, formatDayMonth } from "@/lib/time";
import { SubmitForm } from "@/app/me/submit/SubmitForm";

/**
 * תצוגה מקדימה של טופס ההגשה של עובד מסוים — מה שהוא רואה, עם הסימונים
 * שלו וה"שבוע הרגיל" שלו. בשביל "מה הוא רואה אצלו?" בלי לבקש צילום מסך.
 *
 * אותו SubmitForm בדיוק, במצב `preview`: אין שליחה ואין שמירה. הפעולות
 * שמועברות לו כאן מסרבות בכל מקרה, גם אם משהו ינסה לקרוא להן.
 */
export default async function PreviewPage({
  params,
  searchParams,
}: PageProps<"/manager/weeks/[weekId]/preview">) {
  const { weekId } = await params;
  const { employee: employeeParam } = await searchParams;
  const employeeId = typeof employeeParam === "string" ? employeeParam : null;

  const [, week, employees] = await Promise.all([
    requireManager(),
    prisma.week.findUnique({
      where: { id: weekId },
      select: { id: true, weekStart: true, deadline: true, status: true },
    }),
    prisma.employee.findMany({
      where: { active: true },
      select: { id: true, fullName: true, roles: true },
      orderBy: { fullName: "asc" },
    }),
  ]);
  if (!week) notFound();

  // רק מי שיש לו טופס בכלל — אחמ"ש בלבד, למשל, מגיש גם הוא
  const people = employees.filter((e) => submitRolesOf(e.roles).length > 0);
  const chosen = people.find((e) => e.id === employeeId) ?? null;
  const data = chosen ? await loadSubmissionForm(weekId, chosen.id) : null;

  async function refuse() {
    "use server";
    await requireManager();
    return { ok: false, error: "תצוגה מקדימה — שום דבר לא נשמר" };
  }

  const range = `${formatDayMonth(week.weekStart)}–${formatDayMonth(addDays(week.weekStart, 5))}`;
  const backHref = `/manager/weeks/${weekId}/submissions`;

  return (
    <>
      <PageHeader
        title="תצוגה מקדימה של טופס ההגשה"
        subtitle={
          <>
            שבוע <Num>{range}</Num> · בוחרים עובד ורואים את הטופס בדיוק כמו אצלו.
          </>
        }
        action={<LinkButton href={backHref}>חזרה להגשות</LinkButton>}
      />

      {/* מקופל כשכבר נבחר עובד — בטלפון 36 שמות דוחפים את הטופס הרחק למטה */}
      <details open={!chosen} className="mb-5">
        <summary className="cursor-pointer text-sm font-medium">
          {chosen ? `עובד: ${chosen.fullName} · החלפה` : "בחירת עובד"}
        </summary>
        <ul className="mt-2 flex flex-wrap gap-1.5">
          {people.map((e) => (
            <li key={e.id}>
              <Link
                href={`/manager/weeks/${weekId}/preview?employee=${e.id}`}
                aria-current={e.id === chosen?.id ? "page" : undefined}
                className={`inline-block border px-3 py-1.5 text-sm transition hover:bg-paper ${
                  e.id === chosen?.id ? "border-ink bg-ink text-on-band hover:bg-ink" : "border-line bg-surface"
                }`}
              >
                {e.fullName}
              </Link>
            </li>
          ))}
        </ul>
      </details>

      {!chosen || !data ? (
        <p className="text-sm text-muted">בחר עובד כדי לראות את הטופס שלו.</p>
      ) : (
        <>
          {!data.isOpen && (
            <Notice tone="neutral" title="ההגשה לשבוע הזה סגורה">
              <p className="text-sm">
                {chosen.fullName} רואה עכשיו רק את מה שהגיש, בלי אפשרות לשנות. כאן מוצג
                הטופס עצמו, כפי שנראה כשההגשה הייתה פתוחה.
              </p>
            </Notice>
          )}
          <SubmitForm
            key={chosen.id}
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
            save={refuse}
            saveUsualWeek={refuse}
            preview={{ name: chosen.fullName, backHref }}
          />
        </>
      )}
    </>
  );
}
