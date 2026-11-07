import Link from "next/link";
import { revalidatePath } from "next/cache";
import { ConfirmSubmit } from "@/components/ConfirmSubmit";
import { Badge, Button, Card, Notice, PageHeader } from "@/components/ui";
import { requireManager } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { parseRoles } from "@/lib/domain";
import {
  ROTATION_ROLES,
  clearFridayPeriod,
  fridayCapacity,
  fridaySlots,
  fridaysWorked,
  fromKey,
  generateFridayPlan,
  importFridayPlan,
  loadFridayOverrides,
  loadFridayPlan,
  previewFridayImport,
  publishFridayPlan,
  setFridayCell,
} from "@/lib/friday-plan";
import {
  FRIDAY_LIMIT_LABEL,
  arrivalAt,
  rotationPeriods,
  type FridayLimit,
} from "@/lib/fridays";
import type { ImportPreview } from "@/lib/friday-import";
import {
  FridaySwapError,
  decideFridaySwap,
  loadFridaySwaps,
} from "@/lib/friday-swap-board";
import { DECISION_BLOCK_LABEL } from "@/lib/friday-swaps";
import { formatDayMonth, toDateInputValue } from "@/lib/time";
import { setFridayArrival, syncFridayToWeeks } from "@/lib/weeks";
import { DecideSwaps } from "./DecideSwaps";
import { FridayGrid, type FridayCell, type FridayPerson } from "./FridayGrid";
import { ImportRotation } from "./ImportRotation";

/**
 * סבב שישי.
 *
 * שישי הוא משמרת חובה, והסבב קובע — לא ההגשה. מי שתורו הגיע משובץ גם אם
 * לא סימן, והפטור היחיד הוא המדרגה שבפרופיל. מי שלא יכול בפועל מוסר את
 * המשמרת דרך החילופים.
 *
 * המסך בנוי כמו הגיליון של רואי: תקופות של 8 שישיים (ראה rotationPeriods),
 * "החודשיים הקרובים" שכבר מוכנים ו"החודשיים הבאים" שעובדים עליהם.
 */

type Period = "current" | "next";

const periodOf = (value: unknown): Period => (value === "next" ? "next" : "current");

/** כל התאריכים שמותר לגעת בהם מהמסך — שתי התקופות, לא יותר */
const editableDates = () => {
  const { current, next } = rotationPeriods();
  return new Set([...current, ...next].map(toDateInputValue));
};

function revalidateFridays() {
  revalidatePath("/manager/fridays");
  revalidatePath("/me/fridays");
  // שינוי בשישי שהשבוע שלו פתוח מגיע גם לסידור השבועי — ראה syncFridayToWeeks
  revalidatePath("/manager", "layout");
}

/** משבצת אחת בטבלה: קביעה, החלפה או ריקון. */
async function setCell(date: string, role: string, position: number, employeeId: string | null) {
  "use server";
  await requireManager();
  if (!(ROTATION_ROLES as readonly string[]).includes(role)) return;
  if (!Number.isInteger(position) || position < 1 || position > 12) return;
  if (!editableDates().has(date)) return;

  await setFridayCell({ date, role, position, employeeId });
  await syncFridayToWeeks([fromKey(date)]);
  revalidateFridays();
}

/** "שינוי שעת הגעה": רק בשישי הזה, או בכל שישי מעכשיו */
async function changeArrival(
  date: string,
  role: string,
  position: number,
  startTime: string,
  scope: "date" | "always",
): Promise<{ error?: string }> {
  "use server";
  await requireManager();
  if (!(ROTATION_ROLES as readonly string[]).includes(role)) return { error: "תפקיד לא מוכר" };
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(startTime)) return { error: "השעה לא תקינה" };
  if (!Number.isInteger(position) || position < 1 || position > 12) return { error: "מקום לא תקין" };
  if (!editableDates().has(date)) return { error: "התאריך מחוץ לתקופות שבמסך" };

  const result = await setFridayArrival({ date: fromKey(date), role, position, startTime, scope });
  if (!result.error) {
    revalidateFridays();
    revalidatePath("/manager/template");
  }
  return result;
}

/** "סידור אוטומטי" — ממלא את הריקים, הוגן ואקראי. מה שנקבע ידנית נשאר. */
async function autoFill(period: Period) {
  "use server";
  await requireManager();
  const dates = rotationPeriods()[period];
  await generateFridayPlan({ dates, random: Math.random });
  await syncFridayToWeeks(dates);
  revalidateFridays();
}

/** "התחלה מאפס" — רק לתקופה הבאה, ורק מה שלא פורסם. */
async function clearNext() {
  "use server";
  await requireManager();
  await clearFridayPeriod(rotationPeriods().next);
  revalidateFridays();
}

/**
 * מפרסם את התקופה לעובדים.
 *
 * נפרד מהעריכה בכוונה: המנהל מתקן ומריץ מחדש כמה פעמים שצריך, ורק
 * כשהוא מסיים העובדים רואים משהו ומקבלים התראה.
 */
async function publish(period: Period) {
  "use server";
  await requireManager();
  await publishFridayPlan(rotationPeriods()[period]);
  revalidateFridays();
}

/** הכרעה על חילוף שישי. כשל מוצג במסך ולא מפיל אותו. */
async function decideSwap(offerId: string, approve: boolean) {
  "use server";
  await requireManager();
  try {
    await decideFridaySwap({ offerId, approve });
  } catch (e) {
    if (e instanceof FridaySwapError) {
      return {
        error:
          DECISION_BLOCK_LABEL[e.message as keyof typeof DECISION_BLOCK_LABEL] ??
          e.message,
      };
    }
    throw e;
  }
  revalidateFridays();
  return {};
}

/** קורא את ההדבקה ומראה מה יקרה. אינו כותב דבר. */
async function previewImport(text: string): Promise<ImportPreview> {
  "use server";
  await requireManager();
  return previewFridayImport(text);
}

/**
 * כותב את מה שהוצג.
 *
 * מפרסר מחדש ולא מקבל את התוצאה מהדפדפן: הלקוח אינו מקור אמת לשיבוצים,
 * והפרסור טהור ולכן אותו טקסט נותן אותה תוצאה.
 */
async function applyImport(text: string) {
  "use server";
  await requireManager();
  const preview = await previewImport(text);
  const written = await importFridayPlan({ columns: preview.columns });
  await syncFridayToWeeks(written.dates.map(fromKey));
  revalidateFridays();
  return written;
}

export default async function FridaysPage({ searchParams }: PageProps<"/manager/fridays">) {
  const period = periodOf((await searchParams).period);
  const periods = rotationPeriods();
  const dates = periods[period];

  const [, plan, capacity, template, worked, employees, swaps, overrides] = await Promise.all([
    requireManager(),
    loadFridayPlan(dates),
    fridayCapacity(),
    fridaySlots(),
    fridaysWorked(),
    prisma.employee.findMany({
      where: { active: true },
      select: { id: true, fullName: true, roles: true, fridayLimit: true },
      orderBy: { fullName: "asc" },
    }),
    loadFridaySwaps(),
    loadFridayOverrides(dates),
  ]);

  const dayFormat: Record<string, string> = {};
  for (const f of [...periods.current, ...periods.next]) {
    dayFormat[toDateInputValue(f)] = formatDayMonth(f);
  }

  const cap = { waiter: capacity.waiter ?? 0, bartender: capacity.bartender ?? 0 };
  const cells: Record<string, FridayCell> = {};
  const inPeriod = new Map<string, number>();
  for (const r of plan) {
    if (r.position == null) continue;
    cells[`${r.date}|${r.role}|${r.position}`] = {
      employeeId: r.employeeId,
      fullName: r.fullName,
      published: Boolean(r.publishedAt),
    };
    inPeriod.set(r.employeeId, (inPeriod.get(r.employeeId) ?? 0) + 1);
  }

  // שעות ההגעה עד 12 מקומות — הרבה מעבר לכל שישי אמיתי
  const arrivals = {
    waiter: Array.from({ length: 12 }, (_, i) => arrivalAt(template, "waiter", i + 1)),
    bartender: Array.from({ length: 12 }, (_, i) => arrivalAt(template, "bartender", i + 1)),
  };

  const people: FridayPerson[] = employees
    .map((e) => ({
      id: e.id,
      fullName: e.fullName,
      roles: (parseRoles(e.roles) as string[]).filter((r) =>
        (ROTATION_ROLES as readonly string[]).includes(r),
      ),
      limit:
        e.fridayLimit === "unlimited"
          ? null
          : (FRIDAY_LIMIT_LABEL[e.fridayLimit as FridayLimit] ?? e.fridayLimit),
      worked: worked.get(e.id) ?? 0,
      inPeriod: inPeriod.get(e.id) ?? 0,
    }))
    .filter((p) => p.roles.length > 0);

  const keys = dates.map(toDateInputValue);
  const missing = keys.reduce(
    (n, key) =>
      n +
      (["waiter", "bartender"] as const).reduce((m, role) => {
        let empty = 0;
        for (let p = 1; p <= cap[role]; p++) if (!cells[`${key}|${role}|${p}`]) empty++;
        return m + empty;
      }, 0),
    0,
  );
  const unpublished = plan.filter((r) => !r.publishedAt).length;
  const range = (list: Date[]) =>
    `${formatDayMonth(list[0])}–${formatDayMonth(list[list.length - 1])}`;

  const inRotation = employees.filter((e) =>
    parseRoles(e.roles).some((r) => (ROTATION_ROLES as readonly string[]).includes(r)),
  );

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title="סבב שישי"
        subtitle="שישי הוא משמרת חובה. כל תקופה היא 8 שישיים, והסדר בכל עמודה הוא סדר ההגעה."
      />

      {/* ההכרעה קודמת לכול: עד שלא לוחצים, שום שיבוץ לא זז */}
      <DecideSwaps awaiting={swaps.awaiting} decide={decideSwap} format={dayFormat} />

      <nav aria-label="תקופה" className="mb-4 flex border-b border-line">
        {(
          [
            ["current", "החודשיים הקרובים", periods.current],
            ["next", "החודשיים הבאים", periods.next],
          ] as const
        ).map(([key, label, list]) => (
          <Link
            key={key}
            href={key === "next" ? "/manager/fridays?period=next" : "/manager/fridays"}
            aria-current={period === key ? "page" : undefined}
            className={`-mb-px border-b-2 px-4 py-2.5 text-sm font-semibold transition-colors ${
              period === key ? "border-brand text-ink" : "border-transparent text-muted hover:text-ink"
            }`}
          >
            {label}
            <span className="num block text-xs font-normal">{range(list)}</span>
          </Link>
        ))}
      </nav>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        {unpublished > 0 ? (
          <form action={publish.bind(null, period)}>
            <Button type="submit">פרסום לעובדים ({unpublished})</Button>
          </form>
        ) : (
          plan.length > 0 && <Badge tone="green">הכול פורסם ✓</Badge>
        )}
        <form action={autoFill.bind(null, period)}>
          <Button type="submit" variant="secondary">
            סידור אוטומטי
          </Button>
        </form>
        {period === "next" && plan.length > 0 && (
          <form action={clearNext}>
            <ConfirmSubmit
              variant="ghost"
              danger
              confirmLabel="ריקון"
              message={
                "לרוקן את החודשיים הבאים?\n\nכל מה שעוד לא פורסם בתקופה הזו יימחק, ותוכל לבנות אותה מאפס. מה שכבר פורסם נשאר."
              }
            >
              התחלה מאפס
            </ConfirmSubmit>
          </form>
        )}
      </div>

      <p className="mb-4 text-sm text-muted">
        &quot;סידור אוטומטי&quot; ממלא את המקומות הריקים בהוגנות — מי שעבד הכי מעט
        שישיים קודם — ובכל לחיצה בסדר אחר. מה שקבעת ידנית נשאר. שינוי בשישי
        שהשבוע שלו כבר פתוח מתעדכן גם בסידור השבועי.
      </p>

      {missing > 0 && (
        <Notice title={`${missing} מקומות עוד לא שובצו`}>
          <p className="text-sm">
            מסומנים בצהוב בטבלה. לחיצה על משבצת לשיבוץ, או &quot;סידור אוטומטי&quot;.
          </p>
        </Notice>
      )}

      <div className="mt-4">
        <FridayGrid
          dates={keys.map((key, i) => ({ key, label: formatDayMonth(dates[i]) }))}
          capacity={cap}
          arrivals={arrivals}
          cells={cells}
          people={people}
          overrides={overrides}
          setCell={setCell}
          changeArrival={changeArrival}
        />
      </div>

      <details className="mt-6">
        <summary className="cursor-pointer text-sm font-medium">ייבוא מהגיליון</summary>
        <div className="mt-3">
          <ImportRotation preview={previewImport} apply={applyImport} />
        </div>
      </details>

      <Card className="mt-6">
        <h2 className="mb-2 font-semibold">כמה שישיים כל אחד עבד</h2>
        <p className="mb-2 text-xs text-muted">
          נספר מהשיבוצים בפועל, ולכן מי שהחליף משמרת חוזר מעצמו לראש התור.
        </p>
        <ul className="divide-y divide-line text-sm">
          {inRotation
            .slice()
            .sort((a, b) => (worked.get(a.id) ?? 0) - (worked.get(b.id) ?? 0))
            .map((e) => (
              <li key={e.id} className="flex items-center gap-2 py-1.5">
                <span>{e.fullName}</span>
                {e.fridayLimit !== "unlimited" && (
                  <Badge tone="amber">
                    {FRIDAY_LIMIT_LABEL[e.fridayLimit as FridayLimit] ?? e.fridayLimit}
                  </Badge>
                )}
                <span className="num mr-auto text-muted">{worked.get(e.id) ?? 0}</span>
              </li>
            ))}
        </ul>
      </Card>
    </div>
  );
}
