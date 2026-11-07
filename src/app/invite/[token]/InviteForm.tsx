"use client";

import { useState, useTransition } from "react";
import { Button, Card, Notice } from "@/components/ui";
import { PASSCODE_LENGTH } from "@/lib/passcode";

const inputClass =
  "num mt-1.5 min-h-12 w-full border border-ink/25 bg-surface px-3 py-2.5 text-left text-base outline-none transition-colors duration-150 focus:border-ink focus:ring-2 focus:ring-ink/10";

/**
 * בחירת קוד דרך קישור הכניסה. הטלפון מוצג כשהוא כבר במערכת, ומוקלד כשלא.
 * הפעולה מפנה בעצמה בהצלחה, ולכן היא מחזירה ערך רק בכישלון.
 */
export function InviteForm({
  token,
  phone,
  action,
}: {
  token: string;
  /** הטלפון שבמערכת, מעוצב — או null, ואז העובד מקליד אותו */
  phone: string | null;
  action: (
    token: string,
    phone: string,
    passcode: string,
  ) => Promise<{ ok: false; error: string } | void>;
}) {
  const [typedPhone, setTypedPhone] = useState("");
  const [next, setNext] = useState("");
  const [repeat, setRepeat] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const digits = (value: string) => value.replace(/\D/g, "");
  const mismatch = repeat.length > 0 && next !== repeat;
  const ready =
    (phone !== null || digits(typedPhone).length >= 9) &&
    next.length === PASSCODE_LENGTH &&
    next === repeat;

  return (
    <Card>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          setError(null);
          startTransition(async () => {
            const result = await action(token, typedPhone, next);
            if (result && !result.ok) setError(result.error);
          });
        }}
        className="space-y-4"
      >
        <p className="text-sm text-muted">
          בוחרים קוד אישי בן 6 ספרות. מעכשיו נכנסים עם מספר הטלפון והקוד הזה.
        </p>

        {phone ? (
          <p className="text-sm">
            הטלפון שלך: <span className="num font-bold">{phone}</span>
          </p>
        ) : (
          <div>
            <label htmlFor="phone" className="block text-sm font-bold">
              מספר הטלפון שלך
            </label>
            <input
              id="phone"
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              dir="ltr"
              placeholder="050-1234567"
              value={typedPhone}
              onChange={(e) => setTypedPhone(e.target.value)}
              className={inputClass}
            />
          </div>
        )}

        <div>
          <label htmlFor="next" className="block text-sm font-bold">
            קוד אישי <span className="font-normal text-muted">· 6 ספרות</span>
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
            className={`${inputClass} tracking-[0.4em]`}
          />
        </div>

        <div>
          <label htmlFor="repeat" className="block text-sm font-bold">
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
            className={`${inputClass} tracking-[0.4em]`}
          />
          {mismatch && <p className="mt-1 text-xs text-amber-800">הקודים אינם זהים</p>}
        </div>

        {error && (
          <Notice alert title="לא הצלחנו להיכנס">
            <p className="text-sm">{error}</p>
          </Notice>
        )}

        <Button type="submit" disabled={pending || !ready} className="w-full">
          {pending ? "נכנס…" : "שמירת הקוד וכניסה"}
        </Button>
      </form>
    </Card>
  );
}
