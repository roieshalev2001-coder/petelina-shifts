"use client";

import { useState, useTransition } from "react";
import { Button, Card, Notice } from "@/components/ui";
import { PASSCODE_LENGTH } from "@/lib/passcode";

const inputClass =
  "num mt-1 w-full border border-line bg-surface px-3 py-2.5 text-left tracking-[0.4em] outline-none transition focus:border-ink";

export function PasscodeForm({
  action,
}: {
  action: (
    current: string,
    next: string,
  ) => Promise<{ ok: false; error: string } | void>;
}) {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [repeat, setRepeat] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const digits = (value: string) => value.replace(/\D/g, "");
  const full = (value: string) => value.length === PASSCODE_LENGTH;
  const mismatch = repeat.length > 0 && next !== repeat;

  return (
    <Card>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          // אימות ההקלדה החוזרת נשאר בלקוח בכוונה: השרת לא צריך לדעת
          // שהוקלד פעמיים, זו רק הגנה מפני טעות הקלדה
          if (next !== repeat) {
            setError("שני הקודים החדשים אינם זהים");
            return;
          }
          setError(null);
          startTransition(async () => {
            const result = await action(current, next);
            if (result && !result.ok) setError(result.error);
          });
        }}
        className="space-y-4"
      >
        <div>
          <label htmlFor="current" className="block text-sm font-medium">
            הקוד הנוכחי
          </label>
          <input
            id="current"
            type="password"
            inputMode="numeric"
            autoComplete="current-password"
            dir="ltr"
            maxLength={PASSCODE_LENGTH}
            value={current}
            onChange={(e) => setCurrent(digits(e.target.value))}
            className={inputClass}
          />
        </div>

        <div>
          <label htmlFor="next" className="block text-sm font-medium">
            קוד חדש <span className="font-normal text-muted">· 6 ספרות</span>
          </label>
          <input
            id="next"
            type="password"
            inputMode="numeric"
            autoComplete="new-password"
            dir="ltr"
            maxLength={PASSCODE_LENGTH}
            value={next}
            onChange={(e) => setNext(digits(e.target.value))}
            className={inputClass}
          />
        </div>

        <div>
          <label htmlFor="repeat" className="block text-sm font-medium">
            שוב, לוודא
          </label>
          <input
            id="repeat"
            type="password"
            inputMode="numeric"
            autoComplete="new-password"
            dir="ltr"
            maxLength={PASSCODE_LENGTH}
            value={repeat}
            onChange={(e) => setRepeat(digits(e.target.value))}
            className={inputClass}
          />
          {mismatch && (
            <p className="mt-1 text-xs text-amber-800">הקודים אינם זהים</p>
          )}
        </div>

        {error && (
          <Notice alert title="לא הצלחנו לשמור">
            <p className="text-sm">{error}</p>
          </Notice>
        )}

        <Button
          type="submit"
          disabled={pending || !full(current) || !full(next) || mismatch}
          className="w-full sm:w-auto"
        >
          {pending ? "שומר…" : "שמירת הקוד"}
        </Button>
      </form>
    </Card>
  );
}
