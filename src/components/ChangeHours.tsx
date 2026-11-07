"use client";

import { useState } from "react";
import { Button, inputClass } from "@/components/ui";
import { TIME_DISPLAYS } from "@/lib/week";

/**
 * "שינוי שעות" — שני שלבים בתוך החלון שכבר פתוח.
 *
 * 1. מקלידים שעות ולוחצים "אישור".
 * 2. בוחרים על מה זה חל: "רק השבוע" / "שינוי תמידי" (או בשישי: "רק בשישי
 *    הזה" / "בכל שישי") — בקשה של רואי, שההחלטה תבוא אחרי האישור ולא לפניו.
 *
 * בשישי משנים רק את שעת ההגעה (`startOnly`). "עד סגירה" זמין רק כשהבלוק
 * עצמו יכול להיגמר בסגירה.
 */
export function ChangeHours<S extends string>({
  start,
  end,
  startOnly = false,
  display: initialDisplay,
  scopes,
  onSubmit,
  onCancel,
}: {
  start: string;
  /** "HH:MM" או "CLOSING" */
  end: string;
  startOnly?: boolean;
  /**
   * כשמסופק — גם בחירה איך השעות יוצגו: "הגעה וסיום" / "רק הגעה" /
   * "רק סיום" (רואי). בשישי לא מסופק: שם תמיד רק שעת הגעה.
   */
  display?: string;
  /** האפשרויות של השלב השני, לפי הסדר */
  scopes: { key: S; label: string; hint?: string }[];
  /** מחזיר הודעת שגיאה, או כלום כשהצליח */
  onSubmit: (start: string, end: string, scope: S, display?: string) => Promise<string | void>;
  onCancel: () => void;
}) {
  const [from, setFrom] = useState(start);
  const [to, setTo] = useState(end === "CLOSING" ? "" : end);
  const [untilClosing, setUntilClosing] = useState(end === "CLOSING");
  const [step, setStep] = useState<"edit" | "scope">("edit");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [display, setDisplay] = useState(initialDisplay ?? "range");

  const endValue = untilClosing ? "CLOSING" : to;

  function confirm() {
    setError(null);
    if (!from) return setError("חסרה שעת התחלה");
    if (!startOnly && !untilClosing && !to) return setError("חסרה שעת סיום");
    if (!startOnly && !untilClosing && to <= from) {
      return setError("שעת ההתחלה צריכה להיות לפני שעת הסיום");
    }
    setStep("scope");
  }

  async function choose(scope: S) {
    setBusy(true);
    const result = await onSubmit(
      from,
      startOnly ? end : endValue,
      scope,
      initialDisplay === undefined ? undefined : display,
    );
    setBusy(false);
    if (result) {
      setError(result);
      setStep("edit");
    }
  }

  return (
    <div className="mb-3 border border-line bg-paper p-3">
      {step === "edit" ? (
        <>
          <div className="flex flex-wrap items-end gap-3">
            <label className="block w-32">
              <span className="mb-1 block text-xs font-bold">
                {startOnly ? "שעת הגעה" : "התחלה"}
              </span>
              <input
                type="time"
                step={300}
                value={from}
                onChange={(e) => setFrom(e.target.value)}
                className={`${inputClass} num`}
              />
            </label>
            {!startOnly && (
              <label className="block w-32">
                <span className="mb-1 block text-xs font-bold">סיום</span>
                <input
                  type="time"
                  step={300}
                  value={to}
                  disabled={untilClosing}
                  onChange={(e) => setTo(e.target.value)}
                  className={`${inputClass} num disabled:opacity-40`}
                />
              </label>
            )}
            {!startOnly && (
              <label className="flex min-h-11 items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={untilClosing}
                  onChange={(e) => setUntilClosing(e.target.checked)}
                />
                עד סגירה
              </label>
            )}
          </div>
          {initialDisplay !== undefined && (
            <fieldset className="mt-3">
              <legend className="mb-1 text-xs font-bold">מה יופיע בסידור</legend>
              <div className="flex gap-2">
                {TIME_DISPLAYS.map((d) => (
                  <button
                    key={d.key}
                    type="button"
                    aria-pressed={display === d.key}
                    onClick={() => setDisplay(d.key)}
                    className={`min-h-10 flex-1 border px-2 text-sm font-medium transition-[background-color,transform] duration-150 ease-[var(--ease-out)] active:scale-[0.97] ${
                      display === d.key ? "border-ink bg-ink text-on-band" : "border-line bg-surface"
                    }`}
                  >
                    {d.label}
                  </button>
                ))}
              </div>
            </fieldset>
          )}
          <div className="mt-3 flex gap-2">
            <Button size="sm" onClick={confirm}>
              אישור
            </Button>
            <Button size="sm" variant="ghost" onClick={onCancel}>
              ביטול
            </Button>
          </div>
        </>
      ) : (
        <>
          <p className="mb-2 text-sm font-bold">
            {startOnly ? (
              <>
                שעת הגעה <span className="num">{from}</span> — על מה זה חל?
              </>
            ) : (
              <>
                <span className="num">{`⁦${from}–${untilClosing ? "סגירה" : to}⁩`}</span>{" "}
                — על מה זה חל?
              </>
            )}
          </p>
          <div className="flex flex-col gap-2">
            {scopes.map((s) => (
              <Button
                key={s.key}
                variant="secondary"
                disabled={busy}
                onClick={() => choose(s.key)}
                className="flex-col !items-start text-start"
              >
                <span>{s.label}</span>
                {s.hint && <span className="text-xs font-normal text-muted">{s.hint}</span>}
              </Button>
            ))}
            <Button size="sm" variant="ghost" disabled={busy} onClick={() => setStep("edit")}>
              חזרה
            </Button>
          </div>
        </>
      )}
      {error && (
        <p role="alert" className="mt-2 text-sm text-amber-800">
          {error}
        </p>
      )}
    </div>
  );
}
