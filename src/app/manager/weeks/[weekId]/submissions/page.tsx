import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge, Card, LinkButton, Notice, Num, PageHeader } from "@/components/ui";
import { requireManager } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { DAY_NAMES, parseRoles, roleLabelsOf } from "@/lib/domain";
import { addDays, formatDateTime, formatDayMonth, resolveEnd } from "@/lib/time";
import { closingTimeFor, scheduleBuilt, waitersWithoutShift } from "@/lib/week";

export default async function SubmissionsPage({
  params,
}: PageProps<"/manager/weeks/[weekId]/submissions">) {
  const { weekId } = await params;

  // השער והנתונים יחד — ראה ההסבר ב-src/app/manager/page.tsx
  const [, week, employees] = await Promise.all([
    requireManager(),
    prisma.week.findUnique({
      where: { id: weekId },
      include: {
        slots: { orderBy: [{ dayOfWeek: "asc" }, { sortOrder: "asc" }] },
        submissions: true,
        availabilities: true,
        assignments: { select: { employeeId: true } },
        trainees: { select: { employeeId: true } },
      },
    }),
    prisma.employee.findMany({
      where: { active: true },
      orderBy: { fullName: "asc" },
    }),
  ]);
  if (!week) notFound();
  const loaded = week;

  const slotById = new Map(week.slots.map((s) => [s.id, s]));

  /*
   * כמה ימים יש בשבוע הזה בכלל — ולא 6 קבוע.
   *
   * זה המכנה של "סימן 4 מתוך 6 ימים". שבוע שנפתח מתבנית חלקית יכול
   * להחזיק פחות ימים, ומספר קשיח היה הופך את התגית לשקר שקט.
   */
  const weekDays = new Set(week.slots.map((s) => s.dayOfWeek)).size;
  const submissionByEmployee = new Map(
    week.submissions.map((s) => [s.employeeId, s]),
  );

  const marksByEmployee = new Map<string, typeof loaded.availabilities>();
  for (const a of week.availabilities) {
    marksByEmployee.set(a.employeeId, [
      ...(marksByEmployee.get(a.employeeId) ?? []),
      a,
    ]);
  }

  const assignedCount = new Map<string, number>();
  for (const a of week.assignments) {
    assignedCount.set(a.employeeId, (assignedCount.get(a.employeeId) ?? 0) + 1);
  }
  const traineeCount = new Map<string, number>();
  for (const t of week.trainees) {
    traineeCount.set(t.employeeId, (traineeCount.get(t.employeeId) ?? 0) + 1);
  }

  /*
   * מלצר שהגיש ולא קיבל אף משמרת — הכרטיס שלו אדום וראשון ברשימה.
   * רק אחרי שהסידור נבנה, אחרת כולם באפס. ראה waitersWithoutShift.
   */
  const noShift = new Set(
    scheduleBuilt(week)
      ? waitersWithoutShift({
          employees,
          // רק סימונים על בלוקי מלצרים: מלצר שמתלמד בר וסימן רק בר לא
          // ביקש משמרת מלצר
          markedIds: new Set(
            week.availabilities
              .filter((a) => slotById.get(a.slotId)?.role === "waiter")
              .map((a) => a.employeeId),
          ),
          shiftCounts: assignedCount,
        }).map((e) => e.id)
      : [],
  );

  const submitted = employees
    .filter((e) => submissionByEmployee.get(e.id)?.submittedAt)
    // sort יציב: בתוך כל קבוצה נשאר הסדר האלפביתי
    .sort((a, b) => Number(noShift.has(b.id)) - Number(noShift.has(a.id)));
  const pending = employees.filter(
    (e) => !submissionByEmployee.get(e.id)?.submittedAt,
  );

  /** מקבץ את הסימונים של עובד לימים, עם האילוץ של אותו יום */
  function byDay(marks: typeof loaded.availabilities) {
    const days = new Map<
      number,
      {
        earliestStart: string | null;
        latestEnd: string | null;
        slots: { label: string; preferred: boolean; sortOrder: number }[];
      }
    >();

    for (const m of marks) {
      const slot = slotById.get(m.slotId);
      if (!slot) continue;

      const end = resolveEnd(slot.endTime, closingTimeFor(loaded, slot.dayOfWeek));
      const entry = days.get(slot.dayOfWeek) ?? {
        // האילוץ נקבע ברמת יום בטופס ולכן זהה בכל שורות אותו יום
        earliestStart: m.earliestStart,
        latestEnd: m.latestEnd,
        slots: [],
      };
      entry.slots.push({
        label: `${slot.startTime}–${slot.endTime === "CLOSING" ? "סגירה" : end}`,
        preferred: m.state === "preferred",
        sortOrder: slot.sortOrder,
      });
      days.set(slot.dayOfWeek, entry);
    }

    for (const entry of days.values()) {
      entry.slots.sort((a, b) => a.sortOrder - b.sortOrder);
    }
    return [...days.entries()].sort((a, b) => a[0] - b[0]);
  }

  return (
    <>
      <PageHeader
        title={
          <>
            הגשות · שבוע{" "}
            <Num>
              {formatDayMonth(week.weekStart)}–{formatDayMonth(addDays(week.weekStart, 5))}
            </Num>
          </>
        }
        subtitle={
          <>
            <Num>{submitted.length}</Num> מתוך <Num>{employees.length}</Num>{" "}
            עובדים הגישו. לחיצה על עובד פותחת את מה שהוא סימן ואת האילוצים שלו.
          </>
        }
        action={
          <div className="flex flex-wrap gap-2">
            {/* מה עובד רואה אצלו — בלי לבקש ממנו צילום מסך */}
            <LinkButton href={`/manager/weeks/${weekId}/preview`} variant="secondary">
              איך הטופס נראה אצל עובד
            </LinkButton>
            <LinkButton href={`/manager/weeks/${weekId}`}>חזרה לסידור</LinkButton>
          </div>
        }
      />

      <div className="space-y-6">
        {pending.length > 0 && (
          <Notice title={`טרם הגישו (${pending.length})`}>
            {/*
              רשימה שקטה ולא 36 תגיות ענבר: ההודעה עצמה כבר אומרת "שימו לב",
              ושלושים ושש תוויות צבעוניות בתוכה הפכו לקיר שאי אפשר לסרוק.
            */}
            <ul className="grid gap-x-6 gap-y-1.5 text-sm sm:grid-cols-2">
              {pending.map((e) => (
                <li key={e.id} className="flex items-baseline gap-2">
                  <span className="font-semibold">{e.fullName}</span>
                  <span className="text-xs text-muted">
                    {roleLabelsOf(e.roles).join(" / ")}
                  </span>
                </li>
              ))}
            </ul>
          </Notice>
        )}

        {submitted.length === 0 ? (
          <Card>
            <p className="text-sm text-muted">עדיין אף אחד לא הגיש.</p>
          </Card>
        ) : (
          <div className="space-y-2">
            {submitted.map((employee) => {
              const submission = submissionByEmployee.get(employee.id)!;
              const marks = marksByEmployee.get(employee.id) ?? [];
              const days = byDay(marks);
              const got = assignedCount.get(employee.id) ?? 0;
              const empty = noShift.has(employee.id);

              return (
                // אדום לכל הכרטיס, ולא רק לתג: כך ביקש רואי — לראות במבט
                <Card key={employee.id} flush accent={empty ? "red" : undefined}>
                  {/* rose-100 ולא 50: באדום ברור, והטקסט האפור עליו עדיין 5.35:1 */}
                  <details className={empty ? "bg-rose-100" : undefined}>
                    <summary className="flex cursor-pointer flex-wrap items-center gap-2 p-4">
                      <span className="font-medium">{employee.fullName}</span>
                      <span className="text-xs text-muted">
                        {roleLabelsOf(employee.roles).join(" · ")}
                      </span>
                      {/* בלי Num בתוך הבאדג' — בידוד ה-LTR בולע רווחים סביב מילים עבריות */}
                      {/* ימים ולא משבצות: שלוש משמרות ביום אחד אינן שלושה
                          ימים פנויים, וזה מה שהמנהל צריך לראות */}
                      <Badge>{`סימן ${days.length} מתוך ${weekDays} ימים`}</Badge>
                      {/* הטקסט אומר את זה במפורש — הצבע לבדו אינו מספיק */}
                      {parseRoles(employee.roles).length === 0 ? (
                        // מתלמד בלבד: אין לו מכסה, רק בלוקים שצירפו אותו אליהם
                        <Badge>
                          {(() => {
                            const n = traineeCount.get(employee.id) ?? 0;
                            return n === 0
                              ? "עוד לא צורף לבלוק"
                              : n === 1
                                ? "צורף לבלוק אחד"
                                : `צורף ל-${n} בלוקים`;
                          })()}
                        </Badge>
                      ) : empty ? (
                        <Badge tone="red">לא קיבל אף משמרת</Badge>
                      ) : (
                        <Badge tone={got >= employee.requiredShifts ? "neutral" : "amber"}>
                          {`קיבל ${got} מתוך ${employee.requiredShifts}`}
                        </Badge>
                      )}
                      {marks.some((m) => m.earliestStart || m.latestEnd) && (
                        <Badge tone="blue">אילוץ שעות</Badge>
                      )}
                      <span className="mr-auto text-xs text-muted">
                        <Num>
                          {submission.submittedAt &&
                            formatDateTime(submission.submittedAt)}
                        </Num>
                      </span>
                    </summary>

                    <div className="border-t border-line p-4">
                      {submission.note && (
                        <p className="mb-3 bg-paper p-2.5 text-sm">
                          <strong>הערה:</strong> {submission.note}
                        </p>
                      )}

                      {days.length === 0 ? (
                        <p className="text-sm text-muted">
                          הגיש בלי לסמן אף משמרת.
                        </p>
                      ) : (
                        <ul className="space-y-3">
                          {days.map(([day, entry]) => (
                            <li key={day}>
                              <div className="mb-1 flex flex-wrap items-center gap-2">
                                <span className="font-medium">
                                  {DAY_NAMES[day]}{" "}
                                  <Num>
                                    {formatDayMonth(addDays(week.weekStart, day))}
                                  </Num>
                                </span>
                                {(entry.earliestStart || entry.latestEnd) && (
                                  <Badge tone="blue">
                                    {entry.earliestStart && (
                                      <>
                                        מגיע מ-
                                        <span className="num">
                                          {entry.earliestStart}
                                        </span>
                                      </>
                                    )}
                                    {entry.earliestStart && entry.latestEnd && " · "}
                                    {entry.latestEnd && (
                                      <>
                                        חייב לרדת עד{" "}
                                        <span className="num">
                                          {entry.latestEnd}
                                        </span>
                                      </>
                                    )}
                                  </Badge>
                                )}
                              </div>
                              <div className="flex flex-wrap gap-1">
                                {entry.slots.map((s, i) => (
                                  <span
                                    key={i}
                                    className={`num border px-2 py-0.5 text-xs ${
                                      s.preferred
                                        ? "border-brand bg-brand/[0.07] font-semibold"
                                        : "border-line bg-surface text-muted"
                                    }`}
                                  >
                                    <span aria-hidden>{s.preferred ? "★ " : "✓ "}</span>
                                    {s.preferred && <span className="sr-only">העדפה: </span>}
                                    {s.label}
                                  </span>
                                ))}
                              </div>
                            </li>
                          ))}
                        </ul>
                      )}
                      <Link
                        href={`/manager/weeks/${weekId}/preview?employee=${employee.id}`}
                        className="mt-3 inline-block text-sm underline underline-offset-2"
                      >
                        איך הטופס נראה אצל {employee.fullName}
                      </Link>
                    </div>
                  </details>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
}
