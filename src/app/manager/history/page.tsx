import Link from "next/link";
import { Badge, Card, EmptyState, Num, PageHeader } from "@/components/ui";
import { requireManager } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { WEEK_STATUS_LABEL, type WeekStatus } from "@/lib/domain";
import { addDays, formatDayMonth } from "@/lib/time";
import { RECENT_WEEKS, splitWeeks } from "@/lib/week";
import { restoreWeek } from "../weeks/[weekId]/actions";
import { RestoreButton } from "./RestoreButton";

/**
 * סידורי עבר.
 *
 * שני סוגים באותה רשימה, ובכוונה: סידורים ישנים שפשוט ירדו מהמסך הראשי
 * כדי שלא יבלעו את הפעיל, וסידורים שהמנהל הסיר. ההבדל ביניהם מסומן
 * בתגית, והסרה היא היחידה שאפשר לבטל.
 *
 * כל סידור כאן נפתח כרגיל — הארכיון אינו צילום אלא אותו מסך שבוע.
 */
export const metadata = { title: "סידורי עבר · ניהול" };

export default async function HistoryPage() {
  const [, weeks] = await Promise.all([
    requireManager(),
    prisma.week.findMany({
      orderBy: { weekStart: "desc" },
      include: { _count: { select: { slots: true, assignments: true } } },
    }),
  ]);

  const { archive } = splitWeeks(weeks);

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="סידורי עבר"
        subtitle={`המסך הראשי מציג את השבועות הפתוחים ואת ${RECENT_WEEKS} האחרונים. כאן נמצא כל השאר, וגם מה שהסרת.`}
      />

      {archive.length === 0 ? (
        <EmptyState
          title="אין עדיין סידורי עבר"
          hint={`סידור עובר לכאן כשהוא יוצא מ-${RECENT_WEEKS} האחרונים, או כשמסירים אותו.`}
        />
      ) : (
        <ul className="space-y-2">
          {archive.map((week) => {
            const status = week.status as WeekStatus;
            const removed = Boolean(week.deletedAt);

            return (
              <li key={week.id}>
                <Card className="flex flex-wrap items-center gap-x-3 gap-y-2">
                  <Link
                    href={`/manager/weeks/${week.id}`}
                    className="num text-lg font-bold underline-offset-4 hover:underline"
                  >
                    {formatDayMonth(week.weekStart)}–
                    {formatDayMonth(addDays(week.weekStart, 5))}
                  </Link>

                  {removed ? (
                    <Badge tone="amber">הוסר</Badge>
                  ) : (
                    <Badge>{WEEK_STATUS_LABEL[status]}</Badge>
                  )}

                  <span className="text-sm text-muted">
                    איוש{" "}
                    <Num>
                      {week._count.assignments}/{week._count.slots}
                    </Num>
                  </span>

                  {removed && (
                    <span className="mr-auto">
                      <RestoreButton
                        weekId={week.id}
                        weekLabel={`${formatDayMonth(week.weekStart)}–${formatDayMonth(addDays(week.weekStart, 5))}`}
                        action={restoreWeek}
                      />
                    </span>
                  )}
                </Card>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
