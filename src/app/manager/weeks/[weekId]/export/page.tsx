import { notFound } from "next/navigation";
import { ScheduleTable } from "@/components/ScheduleTable";
import { requireManager } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { groupLinks } from "@/lib/settings";
import { addDays, formatDayMonth } from "@/lib/time";
import { ExportPanel } from "./ExportPanel";

export default async function ExportPage({
  params,
}: PageProps<"/manager/weeks/[weekId]/export">) {
  await requireManager();
  const { weekId } = await params;

  const [week, links] = await Promise.all([
    prisma.week.findUnique({
      where: { id: weekId },
      include: {
        slots: { orderBy: [{ dayOfWeek: "asc" }, { sortOrder: "asc" }] },
        assignments: { include: { employee: true } },
        trainees: { select: { slotId: true, employee: { select: { fullName: true } } } },
      },
    }),
    groupLinks(),
  ]);
  if (!week) notFound();

  const days = [...new Set(week.slots.map((s) => s.dayOfWeek))].sort((a, b) => a - b);

  const cells = week.assignments.map((a) => ({
    slotId: a.slotId,
    employeeId: a.employeeId,
    employeeName: a.employee.fullName,
    actualStart: a.actualStart,
    actualEnd: a.actualEnd,
    // מה שנשלח לצוות הוא מי עובד ומתי — בלי סימוני עבודה של המנהל (קיצור,
    // נעיצה, חריגה). האילוץ לא נכתב ליד השם, ראה ScheduleTable
    shortened: false,
    shortenedApproved: true,
    pinned: false,
    manualOverride: a.manualOverride,
    // הערה לעובד ("פותח קופה") — חלק ממה שהצוות צריך לדעת, ולכן גם בתמונה
    note: a.note,
  }));

  // המתלמדים — גם הם בתמונה, כדי שהצוות יידע מי מגיע לחפוף
  const trainees = Object.fromEntries(week.trainees.map((t) => [t.slotId, t.employee.fullName]));

  const weekLabel = `${formatDayMonth(week.weekStart)}–${formatDayMonth(addDays(week.weekStart, 5))}`;

  return (
    <>
      <div className="no-print">
        <ExportPanel
          backHref={`/manager/weeks/${weekId}`}
          // הסידור הולך לקבוצת העובדים — לקבוצת הברמנים לא (החלטה של רואי)
          groupLink={links.waiter ?? null}
          weekLabel={weekLabel}
          weekStart={week.weekStart.toISOString()}
          slots={week.slots}
          assignments={cells}
          days={days}
          trainees={trainees}
        />
      </div>

      {/* על המסך רואים את התמונה; הגיליון עצמו נשאר להדפסה */}
      <div className="hidden print:block">
        <ScheduleTable
          weekStart={week.weekStart.toISOString()}
          slots={week.slots}
          assignments={cells}
          days={days}
          trainees={trainees}
        />
      </div>
    </>
  );
}
