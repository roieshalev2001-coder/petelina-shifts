"use client";

import { useCallback, useState, useTransition } from "react";
import { useConfirm } from "@/components/Dialog";
import { Button } from "@/components/ui";
import { whatsappUrl } from "@/lib/whatsapp";
import { useSentMarks } from "./sent-marks";

type NudgeResult = { error: string } | { sent: number; withPush: number; skipped: number };

/**
 * תזכורת למי שטרם הגיש — שתי דרכים, אחת אחרי השנייה.
 *
 * 1. **התראה מהאתר** לכל מי שלא הגיש, בלחיצה אחת. מגיעה לטלפון רק למי
 *    שרשום להתראות; השאר רואים אותה בפעמון כשהם נכנסים.
 * 2. **וואטסאפ אחד-אחד** לכל מי שלא הגיש — גם למי שקיבל התראה. וואטסאפ
 *    לא מאפשר לאתר לשלוח לכמה אנשים (ראה src/lib/settings.ts), ולכן המנהל
 *    לוחץ "שלח" בעצמו; האתר פותח את הצ'אט הבא עם ההודעה מוכנה ומסמן ✓.
 *
 * ההודעה מנוסחת פר-אדם ונושאת את המועד האחרון ואת כתובת הכניסה, כי
 * "תגיש משמרות" בלי מתי ובלי איפה מייצר בדיוק את השאלות שהוא בא למנוע.
 */
export function Nudge({
  weekId,
  missing,
  weekLabel,
  deadline,
  loginUrl,
  canSubmit,
  lastNudge,
  recentlyNudged,
  autoReminders,
  nudgeAll,
}: {
  weekId: string;
  missing: { id: string; fullName: string; phone: string | null }[];
  weekLabel: string;
  deadline: string;
  loginUrl: string;
  /** השבוע פתוח והמועד לא עבר — אחרת תזכורת מובילה לטופס נעול */
  canSubmit: boolean;
  /** מתי נשלחה לאחרונה התראה ידנית לשבוע הזה, מעוצב לתצוגה */
  lastNudge: string | null;
  /**
   * מי מבין אלה שלא הגישו כבר קיבל התראה ידנית ביממה האחרונה. הוא לא
   * יקבל שוב עכשיו — ראה reminderBlocked ב-src/lib/week.ts.
   */
  recentlyNudged: string[];
  /** "יום לפני" ו"כמה שעות לפני": מה יצא, או מתי ייצא */
  autoReminders: { label: string; status: string }[];
  nudgeAll: (weekId: string) => Promise<NudgeResult>;
}) {
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<NudgeResult | null>(null);
  const [ask, dialog] = useConfirm();

  const sentKey = useCallback(() => storageKey(weekId), [weekId]);
  const { ready, marked, mark, reset } = useSentMarks(sentKey);

  if (missing.length === 0) return null;

  /*
   * התזכורות שיוצאות לבד — מוצגות גם כשההגשה נסגרה, כדי שיהיה ברור מה
   * יצא. "תצא ב..." למי שעוד לא יגיש: מי שיגיש עד אז לא יקבל.
   */
  const auto = (
    <div>
      <p className="mb-1 font-medium">תזכורות אוטומטיות</p>
      <ul className="space-y-0.5 text-xs">
        {autoReminders.map((r) => (
          <li key={r.label}>
            <span className="font-semibold">{r.label}:</span>{" "}
            <span className="text-muted">{r.status}</span>
          </li>
        ))}
      </ul>
    </div>
  );

  if (!canSubmit) {
    return (
      <div className="mt-3 space-y-3 text-sm">
        <p className="text-muted">
          {missing.length === 1 ? "עובד אחד לא הגיש" : `${missing.length} לא הגישו`}.
          ההגשה סגורה, ולכן אין כאן תזכורת: מי שילחץ על הקישור יגיע לטופס נעול.
        </p>
        {auto}
      </div>
    );
  }

  const message = (fullName: string) =>
    `היי ${fullName}, עוד לא הגשת משמרות לשבוע ${weekLabel}.\n\n` +
    `המועד האחרון: ${deadline}\n` +
    `להגשה: ${loginUrl}\n\n` +
    `מי שלא מגיש עלול לא לקבל משמרות השבוע.`;

  const withPhone = missing.filter((e) => whatsappUrl(e.phone, "") !== null);
  const withoutPhone = missing.filter((e) => whatsappUrl(e.phone, "") === null);
  const next = withPhone.find((e) => !marked.has(e.id));
  const doneCount = withPhone.filter((e) => marked.has(e.id)).length;

  /** מי יקבל עכשיו: מי שלא הגיש ולא קיבל התראה ידנית ביממה האחרונה */
  const recent = new Set(recentlyNudged);
  const sendable = missing.filter((e) => !recent.has(e.id)).length;

  async function sendAll() {
    const n = sendable;
    const ok = await ask(
      n === 1
        ? "לשלוח התראה לעובד אחד שטרם הגיש?"
        : `לשלוח התראה ל-${n} עובדים שטרם הגישו?`,
      { confirmLabel: "שליחה" },
    );
    if (!ok) return;
    setResult(null);
    startTransition(async () => setResult(await nudgeAll(weekId)));
  }

  return (
    <div className="mt-4 space-y-5 border-t border-line pt-4 text-sm">
      {dialog}
      {auto}
      {/* 1 — התראה מהאתר */}
      <div>
        <p className="mb-2 font-medium">1. התראה מהאתר</p>
        {/* md ולא sm: כפתור עצמאי שנלחץ בטלפון — יעד מגע של 44px */}
        <Button variant="secondary" disabled={pending || sendable === 0} onClick={sendAll}>
          {pending ? "שולח…" : `התראה לכל מי שלא הגיש (${sendable})`}
        </Button>
        {/* מי שקיבל ביממה האחרונה לא מקבל שוב — כדי שלא יקבל שתי התראות זהות */}
        {recent.size > 0 && (
          <p className="mt-2 text-xs text-muted">
            {sendable === 0
              ? "כל מי שלא הגיש כבר קיבל התראה ב-24 השעות האחרונות. אפשר לשלוח שוב אחרי יממה."
              : recent.size === 1
                ? "עובד אחד כבר קיבל התראה ב-24 השעות האחרונות ולא יקבל שוב עכשיו."
                : `${recent.size} כבר קיבלו התראה ב-24 השעות האחרונות ולא יקבלו שוב עכשיו.`}
          </p>
        )}
        <p role="status" className="mt-2 text-xs">
          {result && ("error" in result ? (
            <span className="text-amber-800">{result.error}</span>
          ) : (
            describeResult(result)
          ))}
        </p>
        {lastNudge && (
          <p className="text-xs text-muted">התראה אחרונה נשלחה: {lastNudge}</p>
        )}
      </div>

      {/* 2 — וואטסאפ אחד-אחד */}
      <div>
        <p className="mb-2 font-medium">2. וואטסאפ אחד-אחד</p>

        {!ready ? (
          <span className="inline-flex min-h-11 items-center border border-line px-4 py-2 text-muted">
            טוען…
          </span>
        ) : next ? (
          <a
            href={whatsappUrl(next.phone, message(next.fullName))!}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => mark(next.id)}
            // משני ולא ראשי: במסך הזה הפעולה הראשית היא בניית הסידור, והאדום
            // אחד למסך (ראה variants ב-src/components/ui.tsx). גובה 44px — יעד מגע
            className="inline-flex min-h-11 items-center justify-center border border-line bg-surface px-4 py-2 font-medium text-ink transition-transform duration-150 active:scale-[0.97] hover:bg-paper"
          >
            הבא בתור: {next.fullName}
          </a>
        ) : (
          <p className="font-medium">שלחת לכולם ✓</p>
        )}

        <p className="mt-2 text-xs text-muted">
          {ready && `נשלח ל-${doneCount} מתוך ${withPhone.length}. `}
          כל לחיצה פותחת וואטסאפ עם ההודעה מוכנה; לוחצים שם &quot;שלח&quot; וחוזרים לכאן.
          {doneCount > 0 && (
            <>
              {" "}
              <button
                type="button"
                onClick={reset}
                className="underline underline-offset-2"
              >
                איפוס
              </button>
            </>
          )}
        </p>

        <ul className="mt-2 flex flex-wrap gap-1.5">
          {withPhone.map((e) => {
            const done = marked.has(e.id);
            return (
              <li key={e.id}>
                <a
                  href={whatsappUrl(e.phone, message(e.fullName))!}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => mark(e.id)}
                  className={`inline-block border px-3 py-1.5 transition hover:bg-paper ${
                    done ? "border-line bg-paper text-muted" : "border-line bg-surface"
                  }`}
                >
                  {done && (
                    <>
                      <span aria-hidden>✓ </span>
                      <span className="sr-only">נשלח: </span>
                    </>
                  )}
                  {e.fullName}
                </a>
              </li>
            );
          })}
        </ul>

        {withoutPhone.length > 0 && (
          <p className="mt-2 text-xs text-amber-800">
            {/* בלי טלפון אין גם כניסה למערכת, ולכן זו לא רק בעיית תזכורת */}
            בלי מספר טלפון תקין, אי אפשר לשלוח ואי אפשר להיכנס:{" "}
            {withoutPhone.map((e) => e.fullName).join(", ")}
          </p>
        )}
      </div>
    </div>
  );
}

/** "נשלחה ל-21. 6 מהם יקבלו אותה בטלפון; השאר יראו אותה בפעמון…" */
function describeResult({
  sent,
  withPush,
  skipped,
}: {
  sent: number;
  withPush: number;
  skipped: number;
}): string {
  if (sent === 0) {
    return skipped > 0
      ? "כל מי שלא הגיש כבר קיבל התראה ב-24 השעות האחרונות — לא נשלחה שוב."
      : "כולם כבר הגישו — לא נשלחה התראה.";
  }

  const to = sent === 1 ? "נשלחה לעובד אחד." : `נשלחה ל-${sent}.`;
  if (withPush === 0) {
    return `${to} אף אחד מהם לא רשום להתראות בטלפון, אז היא תופיע רק בפעמון כשייכנסו לאתר.`;
  }
  if (withPush === sent) {
    return `${to} ${sent === 1 ? "הוא יקבל" : "כולם יקבלו"} אותה בטלפון.`;
  }
  const phones = withPush === 1 ? "אחד מהם יקבל" : `${withPush} מהם יקבלו`;
  return `${to} ${phones} אותה בטלפון; השאר יראו אותה בפעמון כשייכנסו לאתר.`;
}

/** המפתח כולל את היום, כך שמחר מתחילים מחדש — ראה useSentMarks */
function storageKey(weekId: string): string {
  const d = new Date();
  const day = `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
  return `nudge-sent:${weekId}:${day}`;
}
