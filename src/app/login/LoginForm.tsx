"use client";

import { useState, useTransition } from "react";
import { Button, Card, Notice } from "@/components/ui";
import { PASSCODE_LENGTH } from "@/lib/passcode";

/**
 * טופס הכניסה.
 *
 * הפעולה מפנה בעצמה בהצלחה, ולכן היא מחזירה ערך רק בכישלון — הענף
 * המוצלח פשוט לא חוזר לכאן.
 */
export function LoginForm({
  action,
}: {
  action: (
    phone: string,
    passcode: string,
  ) => Promise<{ ok: false; error: string } | void>;
}) {
  const [phone, setPhone] = useState("");
  const [passcode, setPasscode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const ready = phone.replace(/\D/g, "").length >= 9 && passcode.length === PASSCODE_LENGTH;

  return (
    <Card>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          setError(null);
          startTransition(async () => {
            const result = await action(phone, passcode);
            if (result && !result.ok) setError(result.error);
          });
        }}
        className="space-y-4"
      >
        <div>
          <label htmlFor="phone" className="block text-sm font-bold">
            טלפון
          </label>
          <input
            id="phone"
            name="phone"
            type="tel"
            inputMode="tel"
            autoComplete="username tel"
            dir="ltr"
            placeholder="050-1234567"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className="num mt-1.5 min-h-12 w-full border border-ink/25 bg-surface px-3 py-2.5 text-left text-base outline-none transition-colors duration-150 focus:border-ink focus:ring-2 focus:ring-ink/10"
          />
        </div>

        <div>
          <label htmlFor="passcode" className="block text-sm font-bold">
            קוד אישי <span className="font-normal text-muted">· 6 ספרות</span>
          </label>
          <input
            id="passcode"
            name="passcode"
            type="password"
            inputMode="numeric"
            autoComplete="current-password"
            dir="ltr"
            maxLength={PASSCODE_LENGTH}
            value={passcode}
            /* רק ספרות: מקלדת הטלפון מוסיפה רווחים ומקפים בקלות */
            onChange={(e) => setPasscode(e.target.value.replace(/\D/g, ""))}
            className="num mt-1.5 min-h-12 w-full border border-ink/25 bg-surface px-3 py-2.5 text-left text-base tracking-[0.4em] outline-none transition-colors duration-150 focus:border-ink focus:ring-2 focus:ring-ink/10"
          />
        </div>

        {error && (
          <Notice alert title="הכניסה נכשלה">
            <p className="text-sm">{error}</p>
          </Notice>
        )}

        <Button type="submit" disabled={!ready || pending} className="w-full">
          {pending ? "נכנס…" : "כניסה"}
        </Button>
      </form>
    </Card>
  );
}
