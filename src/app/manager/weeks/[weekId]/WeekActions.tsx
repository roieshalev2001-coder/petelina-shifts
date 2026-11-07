"use client";

import { useState, useTransition } from "react";
import { useConfirm } from "@/components/Dialog";
import { Button, LinkButton } from "@/components/ui";
import type { WeekStatus } from "@/lib/domain";

export function WeekActions({
  weekId,
  weekLabel,
  exportHref,
  status,
  deadlinePassed,
  hasAssignments,
  otherOpenWeeks,
  submissionCount,
  assignmentCount,
  actions,
}: {
  weekId: string;
  weekLabel: string;
  /** "ייצוא והדפסה" — חלק מהפעולות כדי שבטלפון ייכנס לתפריט */
  exportHref: string;
  /**
   * המצב האפקטיבי ולא הגולמי (ראה effectiveWeekStatus): שבוע שהמועד שלו
   * עבר מגיע לכאן כ-`closed`, ולכן מוצגים "פתיחה מחדש" ו"פרסום" ולא
   * "סגירת ההגשה" — פעולה שכבר קרתה בפועל.
   */
  status: WeekStatus;
  /** המועד האחרון עבר — פתיחה מחדש תזיז אותו ליממה מעכשיו */
  deadlinePassed: boolean;
  hasAssignments: boolean;
  /** שבועות אחרים שפתוחים כרגע להגשה, כתוויות — לאישור הפתיחה מחדש */
  otherOpenWeeks: string[];
  submissionCount: number;
  assignmentCount: number;
  actions: {
    runSolver: (weekId: string) => Promise<void>;
    closeSubmissions: (weekId: string) => Promise<void>;
    reopenSubmissions: (
      weekId: string,
      confirmed: boolean,
    ) => Promise<{ error: string } | void>;
    publishWeek: (weekId: string) => Promise<void>;
    unpublishWeek: (weekId: string) => Promise<void>;
    archiveWeek: (weekId: string) => Promise<void>;
  };
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [ask, dialog] = useConfirm();

  async function run(
    fn: () => Promise<void>,
    confirmText?: string,
    options?: Parameters<typeof ask>[1],
  ) {
    if (confirmText && !(await ask(confirmText, options))) return;
    setError(null);
    startTransition(async () => {
      try {
        await fn();
      } catch (e) {
        setError(e instanceof Error ? e.message : "הפעולה נכשלה");
      }
    });
  }

  /**
   * פתיחה מחדש להגשה.
   *
   * לא עוברת ב-`run`, כי האישור כאן תלוי במצב: כשכבר פתוח שבוע אחר,
   * הפתיחה הזו יוצרת שני שבועות פתוחים במקביל — וזה מה שצריך להיאמר
   * לפני הלחיצה, לא אחריה.
   */
  async function reopen() {
    const alsoOpen = otherOpenWeeks.length > 0;
    const extra = alsoOpen
      ? `\n\nכרגע פתוח גם ${otherOpenWeeks.join(", ")}. אחרי הפתיחה יהיו ${otherOpenWeeks.length + 1} שבועות פתוחים, והעובדים יבחרו לאיזה מהם להגיש.`
      : "";
    // reopenSubmissions מזיז מועד שעבר ליממה מעכשיו — שהמנהל ידע לפני
    const moved = deadlinePassed
      ? "\n\nהמועד האחרון כבר עבר, ולכן הוא יוזז ליממה מעכשיו. אפשר לשנות אותו אחר כך."
      : "";
    if (
      !(await ask(
        `לפתוח מחדש את ההגשה?\n\nהעובדים יוכלו שוב לשנות את הזמינות שלהם.${moved}${extra}`,
        { confirmLabel: "פתיחה מחדש" },
      ))
    ) {
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await actions.reopenSubmissions(weekId, alsoOpen);
      if (result?.error) setError(result.error);
    });
  }

  async function archive() {
    // האזהרה מפרטת בדיוק מה יאבד — מחיקה היא בלתי הפיכה
    const lost = [
      submissionCount > 0 && `${submissionCount} הגשות של עובדים`,
      assignmentCount > 0 && `${assignmentCount} שיבוצים`,
    ].filter(Boolean);

    /* כבר לא "יימחקו לצמיתות" — הכול חוזר עם השבוע מהארכיון */
    const detail = lost.length
      ? `\n\nיירדו איתו ${lost.join(" ו-")}, ויחזרו אם תחזיר אותו.`
      : "";

    if (
      !(await ask(
        `להעביר את ${weekLabel} לסידורי עבר?${detail}\n\nאפשר להחזיר אותו משם בכל רגע.`,
        { confirmLabel: "העברה לסידורי עבר", danger: true },
      ))
    ) {
      return;
    }

    // שבוע שפורסם כבר נמצא אצל העובדים — דורש אישור שני
    if (
      status === "published" &&
      !(await ask(
        "השבוע הזה כבר פורסם והעובדים רואים אותו.\n\nהוא ייעלם אצלם עד שתחזיר אותו. להמשיך?",
        { confirmLabel: "להמשיך", danger: true },
      ))
    ) {
      return;
    }

    run(() => actions.archiveWeek(weekId));
  }

  // חוזה האדום: פעולה ראשית אחת ואדומה במסך. כשאפשר לפרסם — הפרסום הוא
  // הצעד הבא, והבנייה מחדש יורדת לניטרלי.
  const canPublish = status === "closed" && hasAssignments;

  /*
   * הפעולות כרשימה ולא כ-JSX, כי הן מוצגות בשתי צורות:
   * במחשב — כולן בשורה. בטלפון — הראשית לבד ברוחב מלא, והשאר בתפריט
   * "פעולות נוספות". קודם בטלפון היו חמישה כפתורים בשלוש שורות לפני
   * הסידור, ו"פרסום" — הצעד שבשבילו נכנסים — ישב בפינה.
   */
  type Action = {
    key: string;
    label: string;
    variant: "primary" | "secondary" | "danger";
    onClick: () => void;
  };

  const build: Action | null =
    status !== "published"
      ? {
          key: "build",
          label: pending ? "בונה…" : hasAssignments ? "בנייה מחדש" : "בניית סידור",
          variant: canPublish ? "secondary" : "primary",
          onClick: () =>
            run(
              () => actions.runSolver(weekId),
              hasAssignments
                ? "לבנות מחדש?\n\nשיבוצים שאינם נעוצים יוחלפו. שישי לא משתנה."
                : status === "open"
                  ? "ההגשה עדיין פתוחה.\n\nעובדים עלולים להוסיף זמינות. לבנות טיוטה בכל זאת?"
                  : undefined,
              { confirmLabel: hasAssignments ? "בנייה מחדש" : "בנייה" },
            ),
        }
      : null;

  const publish: Action | null = canPublish
    ? {
        key: "publish",
        label: "פרסום",
        variant: "primary",
        onClick: () =>
          run(
            () => actions.publishWeek(weekId),
            "לפרסם את הסידור?\n\nהעובדים יראו את המשמרות שלהם.",
            { confirmLabel: "פרסום" },
          ),
      }
    : null;

  const primary = publish ?? (build?.variant === "primary" ? build : null);

  const secondary: Action[] = [
    status === "open" && {
      key: "close",
      label: "סגירת ההגשה",
      variant: "secondary" as const,
      onClick: () =>
        run(
          () => actions.closeSubmissions(weekId),
          "לסגור את ההגשה?\n\nהעובדים לא יוכלו לשנות יותר.",
          { confirmLabel: "סגירה" },
        ),
    },
    status === "closed" && {
      key: "reopen",
      label: "פתיחה מחדש להגשה",
      variant: "secondary" as const,
      onClick: reopen,
    },
    build && build !== primary && build,
    status === "published" && {
      key: "unpublish",
      label: "ביטול פרסום",
      variant: "secondary" as const,
      onClick: () =>
        run(() => actions.unpublishWeek(weekId), "לבטל את הפרסום ולחזור לעריכה?", {
          confirmLabel: "ביטול פרסום",
        }),
    },
    {
      key: "archive",
      label: "העברה לסידורי עבר",
      variant: "danger" as const,
      onClick: archive,
    },
  ].filter((a): a is Action => Boolean(a));

  return (
    <div className="flex w-full flex-wrap items-center gap-2 md:w-auto">
      {dialog}
      {error && <span role="alert" className="w-full text-sm text-amber-800 md:w-auto">{error}</span>}

      {/* מחשב: הכול בשורה, הראשית אחרונה (משמאל, ב-RTL — סוף השורה) */}
      <div className="hidden flex-wrap items-center gap-2 md:flex">
        <LinkButton href={exportHref}>ייצוא והדפסה</LinkButton>
        {secondary.map((a) => (
          <Button key={a.key} variant={a.variant} disabled={pending} onClick={a.onClick}>
            {a.label}
          </Button>
        ))}
        {primary && (
          <Button disabled={pending} onClick={primary.onClick}>
            {primary.label}
          </Button>
        )}
      </div>

      {/* טלפון: הראשית ברוחב מלא, והשאר בתפריט אחד */}
      <div className="flex w-full items-stretch gap-2 md:hidden">
        {primary && (
          <Button block disabled={pending} onClick={primary.onClick} className="flex-1">
            {primary.label}
          </Button>
        )}
        <details className={`group relative ${primary ? "" : "flex-1"}`}>
          <summary className="flex min-h-12 cursor-pointer list-none items-center justify-center gap-2 border border-ink/80 bg-surface px-4 text-[0.9375rem] font-semibold [&::-webkit-details-marker]:hidden">
            פעולות נוספות
            <span aria-hidden className="text-xs transition-transform duration-150 group-open:rotate-180">
              ▾
            </span>
          </summary>
          <div className="absolute left-0 z-30 mt-1 flex w-64 flex-col border border-ink/20 bg-surface p-2">
            <LinkButton href={exportHref} variant="ghost" className="justify-start text-ink">
              ייצוא והדפסה
            </LinkButton>
            {secondary.map((a) => (
              <Button
                key={a.key}
                variant={a.variant === "danger" ? "danger" : "ghost"}
                disabled={pending}
                onClick={(e) => {
                  // סוגר את התפריט לפני שהחלון נפתח, כדי שלא יישאר פתוח מאחוריו
                  (e.currentTarget.closest("details") as HTMLDetailsElement).open = false;
                  a.onClick();
                }}
                className={`justify-start ${a.variant === "danger" ? "mt-1 border-0" : "text-ink"}`}
              >
                {a.label}
              </Button>
            ))}
          </div>
        </details>
      </div>
    </div>
  );
}
