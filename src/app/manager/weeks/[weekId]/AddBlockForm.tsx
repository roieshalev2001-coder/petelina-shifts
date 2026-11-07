"use client";

import { useState } from "react";
import { Button, inputClass } from "@/components/ui";
import { DAY_NAMES, ROLE_LABEL, type Role } from "@/lib/domain";
import type { GridSlot } from "@/lib/grid";
import { showsEndTime } from "@/lib/week";

const ROLES: Role[] = ["waiter", "bartender", "manager"];

/**
 * "+ בלוק" — משבצת נוספת ביום אחד של השבוע הזה (רואי: בלוק מלצר נוסף
 * ביום עמוס, מלצר שמיני בשישי). התבנית הקבועה לא משתנה.
 *
 * ברירת המחדל לשעות: הבלוק האחרון מאותו תפקיד באותו יום — כמעט תמיד
 * מוסיפים "עוד אחד כזה", ומשם מתקנים אם צריך. בשישי רק שעת הגעה.
 */
export function AddBlockForm({
  day,
  slots,
  onSubmit,
  onCancel,
}: {
  day: number;
  /** כל משבצות השבוע — לברירות המחדל */
  slots: GridSlot[];
  onSubmit: (args: {
    role: Role;
    period: string;
    startTime: string;
    endTime: string;
  }) => Promise<string | void>;
  onCancel: () => void;
}) {
  const friday = !showsEndTime(day);
  const lastOf = (role: Role, period?: string) =>
    slots
      .filter((s) => s.dayOfWeek === day && s.role === role && (!period || s.period === period))
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .at(-1);

  // ברירת המחדל: מלצר בוקר — המקרה הנפוץ. השעות של מלצר הבוקר האחרון
  const initial = lastOf("waiter", friday ? undefined : "morning") ?? lastOf("waiter");
  const [role, setRole] = useState<Role>("waiter");
  const [period, setPeriod] = useState(friday ? "allday" : "morning");
  const [start, setStart] = useState(initial?.startTime ?? "08:00");
  const [end, setEnd] = useState(initial && initial.endTime !== "CLOSING" ? initial.endTime : "");
  const [untilClosing, setUntilClosing] = useState(initial?.endTime === "CLOSING");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  /** החלפת תפקיד או חלק יום — השעות מתעדכנות לבלוק האחרון מהסוג הזה */
  function applyDefaults(nextRole: Role, nextPeriod: string) {
    const last = lastOf(nextRole, friday ? undefined : nextPeriod) ?? lastOf(nextRole);
    if (!last) return;
    setStart(last.startTime);
    setUntilClosing(last.endTime === "CLOSING");
    setEnd(last.endTime === "CLOSING" ? "" : last.endTime);
  }

  async function submit() {
    setError(null);
    if (!start) return setError("חסרה שעת התחלה");
    // בשישי שעת הסיום לא מוצגת לאיש — נלקחת מהבלוק האחרון מאותו תפקיד
    const endTime = friday
      ? (lastOf(role)?.endTime ?? "CLOSING")
      : untilClosing
        ? "CLOSING"
        : end;
    if (!friday && !untilClosing && (!end || end <= start)) {
      return setError("שעת הסיום צריכה להיות אחרי שעת ההתחלה");
    }
    setBusy(true);
    const result = await onSubmit({ role, period, startTime: start, endTime });
    setBusy(false);
    if (result) setError(result);
  }

  return (
    <div>
      <h3 className="font-bold">בלוק נוסף · {DAY_NAMES[day]}</h3>
      <p className="mb-3 text-sm text-muted">רק בשבוע הזה. התבנית הקבועה לא משתנה.</p>

      <fieldset className="mb-3">
        <legend className="mb-1 text-xs font-bold">תפקיד</legend>
        <div className="flex gap-2">
          {ROLES.map((r) => (
            <button
              key={r}
              type="button"
              aria-pressed={role === r}
              onClick={() => {
                setRole(r);
                applyDefaults(r, period);
              }}
              className={`min-h-11 flex-1 border px-3 text-sm font-medium transition-[background-color,transform] duration-150 ease-[var(--ease-out)] active:scale-[0.97] ${
                role === r ? "border-ink bg-ink text-on-band" : "border-line bg-surface"
              }`}
            >
              {ROLE_LABEL[r]}
            </button>
          ))}
        </div>
      </fieldset>

      {!friday && (
        <fieldset className="mb-3">
          <legend className="mb-1 text-xs font-bold">חלק היום</legend>
          <div className="flex gap-2">
            {(["morning", "evening"] as const).map((p) => (
              <button
                key={p}
                type="button"
                aria-pressed={period === p}
                onClick={() => {
                  setPeriod(p);
                  applyDefaults(role, p);
                }}
                className={`min-h-11 flex-1 border px-3 text-sm font-medium transition-[background-color,transform] duration-150 ease-[var(--ease-out)] active:scale-[0.97] ${
                  period === p ? "border-ink bg-ink text-on-band" : "border-line bg-surface"
                }`}
              >
                {p === "morning" ? "בוקר" : "ערב"}
              </button>
            ))}
          </div>
        </fieldset>
      )}

      <div className="flex flex-wrap items-end gap-3">
        <label className="block w-32">
          <span className="mb-1 block text-xs font-bold">{friday ? "שעת הגעה" : "התחלה"}</span>
          <input
            type="time"
            step={300}
            value={start}
            onChange={(e) => setStart(e.target.value)}
            className={`${inputClass} num`}
          />
        </label>
        {!friday && (
          <>
            <label className="block w-32">
              <span className="mb-1 block text-xs font-bold">סיום</span>
              <input
                type="time"
                step={300}
                value={end}
                disabled={untilClosing}
                onChange={(e) => setEnd(e.target.value)}
                className={`${inputClass} num disabled:opacity-40`}
              />
            </label>
            <label className="flex min-h-11 items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={untilClosing}
                onChange={(e) => setUntilClosing(e.target.checked)}
              />
              עד סגירה
            </label>
          </>
        )}
      </div>

      {error && (
        <p role="alert" className="mt-2 text-sm text-amber-800">
          {error}
        </p>
      )}

      <div className="mt-4 flex gap-2">
        <Button disabled={busy} onClick={submit}>
          {busy ? "מוסיף…" : "הוספה"}
        </Button>
        <Button variant="ghost" disabled={busy} onClick={onCancel}>
          ביטול
        </Button>
      </div>
    </div>
  );
}
