import Link from "next/link";
import { headers } from "next/headers";
import { resolveBaseUrl } from "@/lib/site-url";
import { notFound } from "next/navigation";
import {
  Badge,
  Card,
  LinkButton,
  Meter,
  Notice,
  Num,
  PageHeader,
  RoleDot,
} from "@/components/ui";
import { requireManager } from "@/lib/auth";
import { prisma } from "@/lib/db";
import {
  DAY_NAMES,
  ROLE_LABEL,
  ROLE_LABEL_PLURAL,
  type Role,
  type WeekStatus,
} from "@/lib/domain";
import { UNFILLED_REASON_LABEL } from "@/lib/scheduler/explain";
import { loadWeekSwaps } from "@/lib/swap-board";
import {
  addDays,
  formatDateTime,
  formatDayMonth,
  resolveEnd,
  zonedDayOfWeek,
  zonedParts,
} from "@/lib/time";
import { GROUP_ROLES, gapsMessage, groupLinks } from "@/lib/settings";
import {
  closingTimeFor,
  dayHeading,
  acceptingSubmissionsWhere,
  effectiveWeekStatus,
  isDeadlinePassed,
  isPastDay,
  nextReminderRun,
  overMaxSlotIds,
  personalShiftsText,
  type PersonalShift,
  reminderBlocked,
  scheduleBuilt,
  showsEndTime,
  waitersWithoutShift,
  weekStatusBadge,
} from "@/lib/week";
import { fridayRotationStatus, parseReport } from "@/lib/weeks";
import {
  approveOverMax,
  approveShortened,
  addBlock,
  assignCell,
  changeRowHours,
  changeSlotHours,
  closeSubmissions,
  decideSwap,
  archiveWeek,
  eligibleForSlot,
  nudgeMissing,
  previewSwap,
  publishWeek,
  reopenSubmissions,
  removeBlock,
  reseedFriday,
  restoreWeek,
  runSolver,
  setAssignmentNote,
  setTrainee,
  swapAssignments,
  togglePin,
  traineeOptions,
  unpublishWeek,
  updateDeadline,
} from "./actions";
import { DeadlineEditor } from "./DeadlineEditor";
import { Decide } from "./Decide";
import { FridayRotation } from "./FridayRotation";
import { Gaps } from "./Gaps";
import { Nudge } from "./Nudge";
import { PersonalSummaries } from "./PersonalSummaries";
import { ScheduleEditor } from "./ScheduleEditor";
import { WeekActions } from "./WeekActions";
import { RestoreButton } from "../../history/RestoreButton";

export default async function WeekPage({ params }: PageProps<"/manager/weeks/[weekId]">) {
  const { weekId } = await params;

  // השער והנתונים יחד — ראה ההסבר ב-src/app/manager/page.tsx
  const [, week, employees, swaps, links, fridayMarks, rotation] = await Promise.all([
    requireManager(),
    prisma.week.findUnique({
      where: { id: weekId },
      include: {
        slots: { orderBy: [{ dayOfWeek: "asc" }, { sortOrder: "asc" }] },
        assignments: { include: { employee: true } },
        submissions: { include: { employee: true } },
        trainees: {
          select: {
            slotId: true,
            employeeId: true,
            employee: { select: { fullName: true, phone: true } },
          },
        },
      },
    }),
    prisma.employee.findMany({
      where: { active: true },
      orderBy: { fullName: "asc" },
    }),
    loadWeekSwaps(weekId),
    groupLinks(),
    // הסימונים של שישי בלבד — לזיהוי מי שובץ בסבב בלי שסימן
    prisma.availability.findMany({
      where: { weekId, slot: { dayOfWeek: 5 } },
      select: { employeeId: true, slotId: true },
    }),
    fridayRotationStatus(weekId),
  ]);
  if (!week) notFound();

  /*
   * שבועות אחרים שפתוחים להגשה — כאלה שעוד מקבלים הגשות בפועל, אותו כלל
   * כמו השער ב-reopenSubmissions.
   *
   * נשלף בנפרד ואחרי השער: הוא נחוץ רק לאישור של "פתיחה מחדש", וצירופו
   * ל-Promise.all היה מזיז את כל האיברים שאחריו.
   */
  const otherOpenWeeks = (
    await prisma.week.findMany({
      where: { ...acceptingSubmissionsWhere(), id: { not: weekId } },
      select: { weekStart: true },
      orderBy: { weekStart: "asc" },
    })
  ).map((w) => `${formatDayMonth(w.weekStart)}–${formatDayMonth(addDays(w.weekStart, 5))}`);

  /*
   * התזכורות שכבר יצאו לשבוע הזה (ReminderLog) — כדי שהמנהל יראה מה נשלח
   * ומתי, ושהכפתור הידני לא יציע לשלוח שוב למי שקיבל ביממה האחרונה.
   * נשלף אחרי השער מאותה סיבה כמו otherOpenWeeks.
   */
  const reminders = await prisma.reminderLog.findMany({
    where: { weekId },
    select: { employeeId: true, stage: true, createdAt: true },
    orderBy: { createdAt: "desc" },
  });
  const lastNudge = reminders.find((r) => r.stage === "manual") ?? null;

  /*
   * התזכורות האוטומטיות: מה כבר יצא, ומה עוד יצא ומתי. "בסביבות" — השעון
   * של Vercel יכול לזוז עד שעה (ראה REMINDER_RUNS_UTC).
   */
  const autoReminders = (
    [
      ["day-before", "יום לפני"],
      ["last-hours", "כמה שעות לפני"],
    ] as const
  ).map(([stage, label]) => {
    const rows = reminders.filter((r) => r.stage === stage);
    const count = new Set(rows.map((r) => r.employeeId)).size;
    if (rows.length > 0) {
      return {
        label,
        status: `נשלחה ב-${formatDateTime(rows[0].createdAt)} ל-${count === 1 ? "עובד אחד" : `${count} עובדים`}`,
      };
    }
    const open = week.status === "open" && !week.deletedAt;
    const run = open ? nextReminderRun(stage, week.deadline, new Date()) : null;
    if (run) {
      const at = zonedParts(run);
      const time = `${at.hour}:${String(at.minute).padStart(2, "0")}`;
      return {
        label,
        status: `תצא ב${DAY_NAMES[zonedDayOfWeek(run)]} ${formatDayMonth(run)} בסביבות ${time}, למי שעוד לא יגיש`,
      };
    }
    return {
      label,
      status: open && week.deadline > new Date() ? "לא תצא: המועד קרוב מדי" : "לא נשלחה",
    };
  });

  /*
   * מי סימן משהו השבוע — בשביל "מלצר שהגיש ולא קיבל משמרת". נשלף אחרי
   * השער מאותה סיבה כמו otherOpenWeeks, ורק כשהסידור כבר נבנה.
   */
  const markedIds = scheduleBuilt(week)
    ? new Set(
        (
          await prisma.availability.findMany({
            // רק בלוקי מלצרים: מלצר שמתלמד בר וסימן רק בר לא ביקש משמרת מלצר
            where: { weekId, slot: { role: "waiter" } },
            select: { employeeId: true },
            distinct: ["employeeId"],
          })
        ).map((a) => a.employeeId),
      )
    : new Set<string>();

  const swapMarks: Record<string, "open" | "done"> = {};
  for (const o of swaps.done) swapMarks[o.slotId] = "done";
  for (const o of swaps.pending) swapMarks[o.slotId] = "open";

  const status = week.status as WeekStatus;
  const deadlinePassed = isDeadlinePassed(week);
  /** המצב כפי שהעובד חווה אותו — ממנו נגזרים התג, הכפתורים והתזכורת */
  const effective = effectiveWeekStatus(status, deadlinePassed);
  const statusBadge = weekStatusBadge(status, deadlinePassed);
  const report = parseReport(week.lastReport);
  const days = [...new Set(week.slots.map((s) => s.dayOfWeek))].sort((a, b) => a - b);

  const submittedIds = new Set(
    week.submissions.filter((s) => s.submittedAt).map((s) => s.employeeId),
  );
  const missing = employees.filter((e) => !submittedIds.has(e.id));

  const slotById = new Map(week.slots.map((s) => [s.id, s]));

  // משבצות ריקות שיש להן כיסוי חלקי — זה מה שהמנהל צריך לעבור עליו לפני פרסום.
  // הדוח משקף את ההרצה האחרונה, ולכן מסננים מולו את מה שהמנהל כבר שיבץ ידנית
  // מאז — אחרת תא שכבר טופל ימשיך להופיע ברשימה.
  const assignedSlotIds = new Set(week.assignments.map((a) => a.slotId));
  const emptyWithOptions =
    report?.unfilled.filter(
      (u) => u.partialOptions.length > 0 && !assignedSlotIds.has(u.slotId),
    ) ?? [];
  const partialCounts = Object.fromEntries(
    emptyWithOptions.map((u) => [u.slotId, u.partialOptions.length]),
  );

  /*
   * חריגה ממקסימום המשמרות.
   *
   * נגזרת כאן ולא נקראת מהדוח, מאותה סיבה כמו הכיסוי החלקי שמעל: הדוח
   * משקף את ההרצה האחרונה, והמנהל שיבץ ידנית מאז. מה שנספר הוא מה
   * שבאמת יש בלוח עכשיו.
   */
  const maxByEmployee = new Map(employees.map((e) => [e.id, e.maxShifts]));
  const shiftCounts = new Map<string, number>();
  for (const a of week.assignments) {
    shiftCounts.set(a.employeeId, (shiftCounts.get(a.employeeId) ?? 0) + 1);
  }
  const overMaxSlots = overMaxSlotIds(
    week.assignments.map((a) => ({
      slotId: a.slotId,
      employeeId: a.employeeId,
      pinned: a.pinned,
      dayOfWeek: slotById.get(a.slotId)?.dayOfWeek ?? 0,
      sortOrder: slotById.get(a.slotId)?.sortOrder ?? 0,
    })),
    maxByEmployee,
  );

  const cells = week.assignments.map((a) => ({
    slotId: a.slotId,
    employeeId: a.employeeId,
    employeeName: a.employee.fullName,
    actualStart: a.actualStart,
    actualEnd: a.actualEnd,
    shortened: a.shortened,
    shortenedApproved: a.shortenedApproved,
    pinned: a.pinned,
    manualOverride: a.manualOverride,
    overMax: overMaxSlots.has(a.slotId),
    overMaxApproved: a.overMaxApproved,
    /** לתווית "5 מתוך 3" — הצגה בלבד */
    shiftCount: shiftCounts.get(a.employeeId) ?? 0,
    maxShifts: maxByEmployee.get(a.employeeId) ?? 0,
    note: a.note,
  }));

  /** slotId → שם המתלמד שצורף לבלוק */
  const trainees = Object.fromEntries(week.trainees.map((t) => [t.slotId, t.employee.fullName]));

  /*
   * חריגות שטרם אושרו, לפי עובד.
   *
   * זו הודעה עצמאית ולא סעיף בפאנל הדוח המקופל: היא דורשת פעולה של
   * המנהל לפני פרסום, וסעיף שמתגלה רק אחרי לחיצה אינו דורש דבר. היא
   * גם נעלמת מעצמה ברגע שהכול אושר.
   */
  const pendingOverMax = employees
    .map((e) => {
      const slots = week.assignments
        .filter(
          (a) =>
            a.employeeId === e.id &&
            overMaxSlots.has(a.slotId) &&
            !a.overMaxApproved,
        )
        .map((a) => slotById.get(a.slotId))
        .filter((s) => s !== undefined)
        .sort((a, b) => a.dayOfWeek - b.dayOfWeek || a.sortOrder - b.sortOrder);

      return {
        employee: e,
        assigned: shiftCounts.get(e.id) ?? 0,
        max: e.maxShifts,
        slots,
      };
    })
    .filter((o) => o.slots.length > 0)
    .sort((a, b) => b.assigned - b.max - (a.assigned - a.max));

  /*
   * מלצרים שהגישו ונשארו בלי משמרת — ראה waitersWithoutShift. "הגישו" כמו
   * במסך ההגשות: אישרו את ההגשה, ולא רק השאירו סימונים.
   */
  const withoutShift = waitersWithoutShift({
    employees,
    markedIds: new Set([...markedIds].filter((id) => submittedIds.has(id))),
    shiftCounts,
  });

  const weekLabel = `${formatDayMonth(week.weekStart)}–${formatDayMonth(addDays(week.weekStart, 5))}`;

  /*
   * משבצות שנשארו בלי איש, מקובצות לפי תפקיד.
   *
   * לא נשען על דוח ההרצה האחרונה אלא על מה שבאמת חסר עכשיו: המנהל שיבץ
   * ידנית מאז, והדוח לא מעודכן. אחמ"ש אינו נכלל — אין לו קבוצה.
   *
   * ימים שכבר עברו לא נכנסים: "חסר מלצר ביום ראשון" ביום שלישי הוא
   * בקשה שאיש לא יכול למלא.
   */
  const gapGroups = GROUP_ROLES.flatMap((role) => {
    const gaps = week.slots
      .filter((s) => s.role === role && !assignedSlotIds.has(s.id) && !isPastDay(s.date))
      .map((s) => ({
        day: dayHeading(s.date),
        /*
         * סדר לוגי — התחלה ואז סיום — ולא formatRange.
         *
         * formatRange בנוי בכוונה הפוך, כדי שבטבלה RTL שעת ההתחלה תיפול
         * מימין. בהודעת טקסט שנשלחת לוואטסאפ אין את ההקשר הזה, והמחרוזת
         * "17:00 - 10:00" נקראת פשוט כטעות.
         */
        // בשישי רק שעת ההגעה — ראה showsEndTime
        time: showsEndTime(s.dayOfWeek)
          ? `${s.startTime}–${resolveEnd(s.endTime, closingTimeFor(week, s.dayOfWeek))}`
          : s.startTime,
      }));
    if (gaps.length === 0) return [];

    // ברבים: "חסרים מלצרים", "הודעה לקבוצת המלצרים"
    const roleLabel = ROLE_LABEL_PLURAL[role];
    return [
      {
        role,
        roleLabel,
        link: links[role] ?? null,
        gaps,
        message: gapsMessage({ roleLabel, weekLabel, gaps }),
      },
    ];
  });

  /*
   * מי שובץ בשישי בלי שסימן זמינות.
   *
   * נגזר מהמצב הנוכחי ולא מרגע הזריעה: המנהל שיבץ ידנית מאז, והתשובה
   * צריכה לשקף את מה שקיים עכשיו.
   */
  const fridayNoMark = (() => {
    const fridaySlotIds = new Set(
      week.slots.filter((s) => s.dayOfWeek === 5).map((s) => s.id),
    );
    const markedPairs = new Set(
      fridayMarks.map((a) => `${a.employeeId}|${a.slotId}`),
    );
    const names = week.assignments
      .filter(
        (a) =>
          fridaySlotIds.has(a.slotId) &&
          !markedPairs.has(`${a.employeeId}|${a.slotId}`),
      )
      .map((a) => a.employee.fullName);
    return [...new Set(names)];
  })();

  // הכתובת שבתזכורות לעובדים — תמיד הראשית בייצור, ראה src/lib/site-url.ts
  const baseUrl = resolveBaseUrl((await headers()).get("host"));

  /*
   * "המשמרות שלך השבוע" — הודעה אישית לכל מי שיש לו משמרת, רק אחרי
   * הפרסום. כולל משמרות כמתלמד, עם מי. ראה personalShiftsText.
   */
  const personal = (() => {
    if (status !== "published") return [];
    const people = new Map<
      string,
      { fullName: string; phone: string | null; shifts: PersonalShift[] }
    >();
    const add = (id: string, fullName: string, phone: string | null, shift: PersonalShift) => {
      const person = people.get(id) ?? { fullName, phone, shifts: [] };
      person.shifts.push(shift);
      people.set(id, person);
    };
    for (const a of week.assignments) {
      const slot = slotById.get(a.slotId);
      if (!slot) continue;
      add(a.employeeId, a.employee.fullName, a.employee.phone, {
        dayOfWeek: slot.dayOfWeek,
        actualStart: a.actualStart,
        actualEnd: a.actualEnd,
        timeDisplay: slot.timeDisplay,
        role: slot.role,
        note: a.note,
      });
    }
    const workerBySlot = new Map(week.assignments.map((a) => [a.slotId, a.employee.fullName]));
    for (const t of week.trainees) {
      const slot = slotById.get(t.slotId);
      if (!slot) continue;
      add(t.employeeId, t.employee.fullName, t.employee.phone, {
        dayOfWeek: slot.dayOfWeek,
        actualStart: slot.startTime,
        actualEnd: resolveEnd(slot.endTime, closingTimeFor(week, slot.dayOfWeek)),
        timeDisplay: slot.timeDisplay,
        role: slot.role,
        traineeWith: workerBySlot.get(t.slotId) ?? null,
      });
    }
    return [...people]
      .map(([id, p]) => ({
        id,
        fullName: p.fullName,
        phone: p.phone,
        count: p.shifts.length,
        message: personalShiftsText({
          fullName: p.fullName,
          weekLabel,
          shifts: p.shifts,
          link: `${baseUrl}/me`,
        }),
      }))
      .sort((a, b) => a.fullName.localeCompare(b.fullName, "he"));
  })();

  return (
    <>
      <PageHeader
        // הטווח בתוך Num — מחוץ לבידוד הוא התהפך ל-"16/10–11/10"
        title={
          <>
            שבוע <Num>{weekLabel}</Num>
          </>
        }
        subtitle={
          <>
            {/* אותו כלל כמו ברשימת השבועות — ראה weekStatusBadge */}
            <Badge tone={statusBadge.tone}>{statusBadge.label}</Badge>{" "}
            · <Num>{week.assignments.length}</Num> מתוך{" "}
            <Num>{week.slots.length}</Num> משבצות מאוישות
          </>
        }
        action={
          <div className="no-print flex w-full flex-wrap gap-2 md:w-auto">
            {/* שבוע שהוסר נקרא בלבד: לפרסם או לבנות סידור שאיש אינו רואה
                זו פעולה בלי משמעות. קודם מחזירים אותו. */}
            {week.deletedAt ? (
              <LinkButton href={`/manager/weeks/${weekId}/export`}>
                ייצוא והדפסה
              </LinkButton>
            ) : (
            <WeekActions
              weekId={weekId}
              weekLabel={`שבוע ${weekLabel}`}
              exportHref={`/manager/weeks/${weekId}/export`}
              // אפקטיבי ולא גולמי: אחרי המועד "סגירת ההגשה" כבר קרתה בפועל
              status={effective}
              deadlinePassed={deadlinePassed}
              hasAssignments={week.assignments.length > 0}
              otherOpenWeeks={otherOpenWeeks}
              submissionCount={submittedIds.size}
              assignmentCount={week.assignments.length}
              actions={{
                runSolver,
                closeSubmissions,
                reopenSubmissions,
                publishWeek,
                unpublishWeek,
                archiveWeek,
              }}
            />
            )}
          </div>
        }
      />

      {week.deletedAt && (
        <div className="mb-5">
          <Notice
            title="הסידור הזה הוסר"
            action={
              <RestoreButton
                weekId={weekId}
                weekLabel={`שבוע ${weekLabel}`}
                action={restoreWeek}
              />
            }
          >
            <p className="text-sm">
              הוא אינו מופיע אצל העובדים, אינו נספר בסבב שישי, ואי אפשר
              לערוך אותו. הנתונים נשמרו — החזרה מחזירה הכול.
            </p>
          </Notice>
        </div>
      )}

      <div className="space-y-5">
        {/* משמרת שעובד אמר שלא יגיע אליה ואף אחד עוד לא לקח — הדבר הדחוף
            ביותר במסך, ולכן ראשון. */}
        {swaps.pending.length > 0 && (
          <Notice collapsible title={`משמרות שנמסרו וטרם נתפסו (${swaps.pending.length})`}>
            <p className="mb-3 text-sm">
              העובדים האלה הודיעו שהם לא יכולים להגיע. המשמרת עדיין רשומה על
              שמם עד שמישהו יתפוס, ואם אף אחד לא יתפוס עד{" "}
              <strong>24 שעות לפני</strong> — היא נשארת אצלם. שים לב שבנייה
              מחדש של הסידור עלולה להזיז אותן.
            </p>
            <ul className="space-y-1.5 text-sm">
              {swaps.pending.map((o) => (
                <li key={o.id} className="flex flex-wrap items-center gap-2">
                  <RoleDot role={o.role} />
                  <span className="font-medium">{DAY_NAMES[o.dayOfWeek]}</span>
                  <span className="num">
                    {o.start}–{o.end}
                  </span>
                  <span className="text-muted">{ROLE_LABEL[o.role]}</span>
                  <span className="mr-auto">{o.offeredBy}</span>
                  <Badge tone="amber">{`נסגר בעוד ${o.hoursLeft} שעות`}</Badge>
                </li>
              ))}
            </ul>
          </Notice>
        )}

        {/* חילוף שעקף כלל שהאלגוריתם היה אוכף. לא חוסמים — המסירה מסננת
            במכוון רק לפי תפקיד והתנגשות — אבל המנהל צריך לדעת. */}
        {swaps.done.some((o) => o.risks.length > 0) && (
          <Notice collapsible title="חילופים שדורשים מבט">
            <ul className="space-y-1.5 text-sm">
              {swaps.done
                .filter((o) => o.risks.length > 0)
                .map((o) => (
                  <li key={o.id} className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{DAY_NAMES[o.dayOfWeek]}</span>
                    <span className="num">
                      {o.start}–{o.end}
                    </span>
                    <span>{o.to}</span>
                    {o.risks.map((r, i) => (
                      <Badge key={i} tone="amber">
                        {r}
                      </Badge>
                    ))}
                  </li>
                ))}
            </ul>
          </Notice>
        )}

        {/*
          פער בין הסבב לבין מה שיושב בסידור. שקט כשאין פער, ולכן הוא
          מופיע רק כשיש מה לעשות.
        */}
        <FridayRotation
          planned={rotation.planned}
          inPlace={rotation.inPlace}
          unmatched={rotation.unmatched}
          reseed={reseedFriday.bind(null, weekId)}
        />

        {/*
          סבב שישי משבץ בלי קשר להגשה — זו ההגדרה שלו. אבל זה חייב להיות
          גלוי למנהל לפני הפרסום, ולא הפתעה לעובד שפותח את המסך שלו.
        */}
        {fridayNoMark.length > 0 && (
          <Notice collapsible title={`${fridayNoMark.length} שובצו בשישי בלי שסימנו זמינות`}>
            <p className="text-sm">
              שישי הוא סבב חובה, ולכן הם שובצו לפי התור. אם מישהו מהם באמת
              לא יכול — הוא יכול למסור את המשמרת מהאזור האישי שלו.
            </p>
            <p className="mt-1 text-sm text-muted">{fridayNoMark.join(", ")}</p>
          </Notice>
        )}

        {/*
          חריגה ממקסימום המשמרות.

          האלגוריתם חורג רק כשהחלופה היחידה הייתה משבצת ריקה, ולכן זו אינה
          תקלה אלא החלטה שהועברה למנהל. היא יושבת כאן, מעל הלוח, כי היא
          דורשת אישור לפני פרסום — ולא בפאנל הדוח שנפתח בלחיצה.
        */}
        {/* המינימום המקובל הוא משמרת אחת לכל מלצר שהגיש — מה שלא הסתדר,
            באדום ופתוח, לא מקופל: זה בדיוק מה שרואי ביקש לראות */}
        {withoutShift.length > 0 && (
          <Notice
            tone="red"
            title={`מלצרים שהגישו ולא קיבלו משמרת (${withoutShift.length})`}
          >
            <p className="text-sm">
              {withoutShift.map((e) => e.fullName).join(", ")}.{" "}
              <Link
                href={`/manager/weeks/${weekId}/submissions`}
                className="underline underline-offset-2"
              >
                מה כל אחד הגיש
              </Link>
            </p>
          </Notice>
        )}

        {pendingOverMax.length > 0 && (
          <Notice
            collapsible
            title={`חריגה ממקסימום המשמרות (${pendingOverMax.length})`}
          >
            <p className="mb-3 text-sm">
              לא היה אף מועמד אחר למשבצות האלה, ולכן הן אוישו בכל זאת. אישור
              החריגה נעשה מתוך התא בלוח.
            </p>
            <ul className="space-y-1.5 text-sm">
              {pendingOverMax.map((o) => (
                <li key={o.employee.id} className="flex flex-wrap gap-2">
                  <span className="font-medium">{o.employee.fullName}</span>
                  {/* מחרוזת אחת ולא Num: מילה עברית בתוך בידוד LTR מתהפכת,
                      ו"3 מתוך 1" היה נקרא "1 מתוך 3" — ההפך מהאמת */}
                  <span>{`${o.assigned} מתוך ${o.max}`}</span>
                  <span className="text-muted">
                    —{" "}
                    {o.slots
                      .map(
                        (s) =>
                          `${DAY_NAMES[s.dayOfWeek]} ${s.startTime}`,
                      )
                      .join(", ")}
                  </span>
                </li>
              ))}
            </ul>
          </Notice>
        )}

        {/* ההכרעה קודמת לכול: עד שלא לוחצים, המשמרת לא זזה */}
        <Decide awaiting={swaps.awaiting} decide={decideSwap} />

        {/* אין לזה אף מועמד — ולכן זה קודם למשבצות שיש להן אפשרויות */}
        <Gaps groups={gapGroups} />

        {/* מה שדורש החלטה — לפני הכול, ובענבר: זה לא אדום כי אין כאן פעולה
            הרסנית, אלא משהו שצריך לעבור עליו. */}
        {report && emptyWithOptions.length > 0 && (
          <Notice collapsible title={`משבצות ריקות שיש להן אפשרויות (${emptyWithOptions.length})`}>
            <p className="mb-3 text-sm">
              לא נמצא אף אחד שמתאים למשמרת המלאה, אבל יש מי שיכול לכסות חלק
              ממנה. האלגוריתם לא בוחר במקומך — לחץ על התא בטבלה כדי לראות את
              האפשרויות ולהחליט.
            </p>
            <ul className="space-y-2">
              {emptyWithOptions.map((u) => {
                const slot = slotById.get(u.slotId)!;
                return (
                  <li
                    key={u.slotId}
                    className="flex flex-wrap items-center gap-2 bg-surface p-2.5 text-sm"
                  >
                    <RoleDot role={slot.role as Role} />
                    <span className="font-medium">
                      {DAY_NAMES[slot.dayOfWeek]}{" "}
                      <span className="num">
                        {slot.startTime}–
                        {slot.endTime === "CLOSING" ? "סגירה" : slot.endTime}
                      </span>
                    </span>
                    <span className="text-muted">
                      {ROLE_LABEL[slot.role as Role]}
                    </span>
                    <span className="mr-auto flex flex-wrap gap-1">
                      {u.partialOptions.slice(0, 3).map((o) => (
                        <Badge
                          key={o.employeeId}
                          // ענבר כשהאפשרות פוגעת בפתיחה או בסגירה עצמן
                          tone={o.breaksOpening || o.breaksClosing ? "amber" : "neutral"}
                        >
                          {employees.find((e) => e.id === o.employeeId)?.fullName}{" "}
                          <span className="num">
                            {o.start}–{o.end}
                          </span>
                          {o.breaksOpening && " · פותח באיחור"}
                          {o.breaksClosing && " · לא נשאר לסגירה"}
                        </Badge>
                      ))}
                      {u.partialOptions.length > 3 && (
                        <Badge>+{u.partialOptions.length - 3}</Badge>
                      )}
                    </span>
                  </li>
                );
              })}
            </ul>
          </Notice>
        )}

        {report && report.coverageGaps.length > 0 && (
          <Notice collapsible title={`חורים ברצפת האיוש (${report.coverageGaps.length})`}>
            <p className="mb-3 text-sm">
              בשעות האלה יהיו פחות מלצרים במקביל ממה שהתבנית מתכננת — בגלל
              משבצות שנשארו ריקות, או שיבוץ חלקי שבחרת. אפשר לפרסם ככה, אבל
              כדאי לעבור על התאים הריקים קודם.
            </p>
            <ul className="space-y-1 text-sm">
              {report.coverageGaps.map((gap, i) => (
                <li key={i} className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{DAY_NAMES[gap.dayOfWeek]}</span>
                  <span className="num">
                    {gap.from}–{gap.to}
                  </span>
                  {/* בלי Num בתוך הבאדג' — בידוד ה-LTR בולע את הרווחים סביב
                      המילה העברית ומדביק את המספרים אליה */}
                  <Badge tone="amber">{`${gap.actual} במקום ${gap.required}`}</Badge>
                </li>
              ))}
            </ul>
          </Notice>
        )}

        <Card>
          <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-2">
            <h2 className="font-semibold">
              הגשות: <Num>{submittedIds.size}</Num> מתוך{" "}
              <Num>{employees.length}</Num>
            </h2>
            {missing.length > 0 ? (
              <Badge tone="amber">{`${missing.length} טרם הגישו`}</Badge>
            ) : (
              <Badge tone="green">כולם הגישו ✓</Badge>
            )}
            <LinkButton
              href={`/manager/weeks/${weekId}/submissions`}
              size="sm"
              className="mr-auto"
            >
              מה כל אחד הגיש
            </LinkButton>
          </div>

          <Meter value={submittedIds.size} max={employees.length} />

          <div className="mt-3">
            <DeadlineEditor
              weekId={weekId}
              deadline={week.deadline.toISOString()}
              passed={isDeadlinePassed(week)}
              action={updateDeadline}
            />
          </div>

          <Nudge
            weekId={weekId}
            missing={missing.map((e) => ({ id: e.id, fullName: e.fullName, phone: e.phone }))}
            weekLabel={weekLabel}
            deadline={formatDateTime(week.deadline)}
            loginUrl={`${baseUrl}/login`}
            // אותו תנאי שבו טופס ההגשה נפתח לעובד — ראה src/lib/submissions.ts
            canSubmit={effective === "open"}
            lastNudge={lastNudge ? formatDateTime(lastNudge.createdAt) : null}
            autoReminders={autoReminders}
            // מי שכבר קיבל התראה ידנית ביממה האחרונה — לא יקבל שוב עכשיו
            recentlyNudged={missing
              .filter((e) =>
                reminderBlocked({
                  stage: "manual",
                  previous: reminders.filter((r) => r.employeeId === e.id),
                  now: new Date(),
                }),
              )
              .map((e) => e.id)}
            nudgeAll={nudgeMissing}
          />
        </Card>

        {week.assignments.length > 0 ? (
          <ScheduleEditor
            weekId={weekId}
            weekStart={week.weekStart.toISOString()}
            slots={week.slots}
            assignments={cells}
            days={days}
            readOnly={status === "published"}
            partialCounts={partialCounts}
            swapMarks={swapMarks}
            trainees={trainees}
            actions={{
              eligible: eligibleForSlot,
              traineeOptions,
              setTrainee,
              assign: assignCell,
              changeHours: changeSlotHours,
              changeRowHours,
              addBlock,
              removeBlock,
              setNote: setAssignmentNote,
              togglePin,
              approveShortened,
              approveOverMax,
              previewSwap,
              swap: swapAssignments,
            }}
          />
        ) : (
          <Card>
            <p className="text-sm text-muted">
              עדיין לא נבנה סידור לשבוע הזה. אחרי שההגשות ייסגרו, לחץ על{" "}
              <strong>בניית סידור</strong>.
            </p>
          </Card>
        )}

        {personal.length > 0 && (
          <Card>
            <PersonalSummaries weekId={weekId} people={personal} />
          </Card>
        )}

        {/* חילופים שהושלמו — עובדה, לא בעיה, ולכן נייטרלי ומקופל */}
        {swaps.done.length > 0 && (
          <Card flush>
            <details>
              <summary className="cursor-pointer px-5 py-4 font-semibold">
                חילופים שבוצעו
                <span className="mr-2 text-sm font-normal text-muted">
                  {swaps.done.length}
                </span>
              </summary>
              <ul className="space-y-2 border-t border-line p-5 text-sm">
                {swaps.done.map((o) => (
                  <li key={o.id} className="flex flex-wrap items-center gap-2">
                    <RoleDot role={o.role} />
                    <span className="font-medium">{DAY_NAMES[o.dayOfWeek]}</span>
                    <span className="num">
                      {o.start}–{o.end}
                    </span>
                    <span className="text-muted">
                      {o.from} ← {o.to}
                    </span>
                    {o.risks.map((r, i) => (
                      <Badge key={i} tone="amber">
                        {r}
                      </Badge>
                    ))}
                  </li>
                ))}
              </ul>
            </details>
          </Card>
        )}

        {/* פירוט ההרצה — מידע משני, מתקפל כדי לא להתחרות בטבלה */}
        {report &&
          (report.unfilled.length > 0 ||
            report.shortfalls.length > 0 ||
            report.softViolations.length > 0) && (
            <Card flush>
              <details>
                <summary className="cursor-pointer px-5 py-4 font-semibold">
                  פירוט ההרצה האחרונה
                  <span className="mr-2 text-sm font-normal text-muted">
                    {[
                      report.unfilled.length && `${report.unfilled.length} ריקות`,
                      report.shortfalls.length &&
                        `${report.shortfalls.length} מתחת למכסה`,
                      report.softViolations.length &&
                        `${report.softViolations.length} אזהרות`,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                </summary>

                <div className="grid gap-6 border-t border-line p-5 lg:grid-cols-2">
                  {report.unfilled.length > 0 && (
                    <div>
                      <h3 className="mb-2 text-sm font-semibold">
                        משבצות ריקות ({report.unfilled.length})
                      </h3>
                      <ul className="space-y-1.5 text-sm">
                        {report.unfilled.map((u) => {
                          const slot = slotById.get(u.slotId);
                          if (!slot) return null;
                          return (
                            <li key={u.slotId} className="flex flex-wrap gap-2">
                              <span className="font-medium">
                                {DAY_NAMES[slot.dayOfWeek]}{" "}
                                <span className="num">{slot.startTime}</span>{" "}
                                {ROLE_LABEL[slot.role as Role]}
                              </span>
                              <span className="text-muted">
                                — {UNFILLED_REASON_LABEL[u.reason]}
                              </span>
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  )}

                  {report.shortfalls.length > 0 && (
                    <div>
                      <h3 className="mb-2 text-sm font-semibold">
                        עובדים מתחת למכסה ({report.shortfalls.length})
                      </h3>
                      <ul className="space-y-1.5 text-sm">
                        {report.shortfalls.map((s) => {
                          const employee = employees.find(
                            (e) => e.id === s.employeeId,
                          );
                          return (
                            <li key={s.employeeId}>
                              <span className="font-medium">
                                {employee?.fullName}
                              </span>{" "}
                              <Num>
                                {s.assigned}/{s.required}
                              </Num>{" "}
                              <span className="text-muted">
                                — סימן <Num>{s.marked}</Num> משבצות
                                {s.marked <= s.required &&
                                  " (סימן מעט מדי כדי להגיע ליעד)"}
                              </span>
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  )}

                  {report.softViolations.length > 0 && (
                    <div>
                      <h3 className="mb-2 text-sm font-semibold">אזהרות</h3>
                      <ul className="list-disc space-y-1 ps-5 text-sm text-amber-900 marker:text-amber-500">
                        {report.softViolations.map((v, i) => (
                          <li key={i}>{v.detail}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              </details>
            </Card>
          )}
      </div>
    </>
  );
}
