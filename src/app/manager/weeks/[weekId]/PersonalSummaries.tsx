"use client";

import { useCallback, useState } from "react";
import { Button } from "@/components/ui";
import { whatsappUrl } from "@/lib/whatsapp";
import { useSentMarks } from "./sent-marks";

/**
 * "המשמרות שלך השבוע" — הודעה אישית לכל עובד אחרי הפרסום.
 *
 * משלים את התמונה של כל הסידור (ייצוא), לא מחליף אותה: בתמונה כולם רואים
 * את כולם, וכאן כל אחד מקבל רק את שלו — יום, שעות ותפקיד. הנוסח נבנה בשרת
 * (personalShiftsText ב-src/lib/week.ts).
 *
 * וואטסאפ לא מאפשר לאתר לשלוח, ולכן כמו בתזכורות (Nudge.tsx): "הבא בתור"
 * פותח את הצ'אט עם ההודעה מוכנה, המנהל לוחץ "שלח", וחוזר לכאן. מי שאין
 * לו טלפון — העתקה, ושולחים איך שרוצים.
 */
export function PersonalSummaries({
  weekId,
  people,
}: {
  weekId: string;
  people: { id: string; fullName: string; phone: string | null; count: number; message: string }[];
}) {
  const sentKey = useCallback(() => `personal-sent:${weekId}`, [weekId]);
  const { ready, marked, mark, reset } = useSentMarks(sentKey);
  const [copied, setCopied] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (people.length === 0) return null;

  const next = people.find((p) => whatsappUrl(p.phone, "") !== null && !marked.has(p.id));
  const doneCount = people.filter((p) => marked.has(p.id)).length;

  async function copy(person: (typeof people)[number]) {
    try {
      await navigator.clipboard.writeText(person.message);
      setCopied(person.id);
      setError(null);
      mark(person.id);
    } catch {
      setError("ההעתקה נחסמה בדפדפן הזה");
    }
  }

  return (
    <div className="space-y-3 text-sm">
      <div>
        <h2 className="font-semibold">הודעה אישית לכל עובד</h2>
        <p className="mt-1 text-xs text-muted">
          לכל עובד רק המשמרות שלו: יום, שעות ותפקיד. כל לחיצה פותחת וואטסאפ עם
          ההודעה מוכנה; לוחצים שם &quot;שלח&quot; וחוזרים לכאן.
        </p>
      </div>

      {!ready ? (
        <span className="inline-flex min-h-11 items-center border border-line px-4 py-2 text-muted">
          טוען…
        </span>
      ) : next ? (
        <a
          href={whatsappUrl(next.phone, next.message)!}
          target="_blank"
          rel="noopener noreferrer"
          onClick={() => mark(next.id)}
          className="inline-flex min-h-11 items-center justify-center border border-line bg-surface px-4 py-2 font-medium text-ink transition-transform duration-150 active:scale-[0.97] hover:bg-paper"
        >
          הבא בתור: {next.fullName}
        </a>
      ) : (
        <p className="font-medium">שלחת לכל מי שיש לו טלפון ✓</p>
      )}

      <p className="text-xs text-muted">
        {ready && `נשלח ל-${doneCount} מתוך ${people.length}.`}
        {doneCount > 0 && (
          <>
            {" "}
            <button type="button" onClick={reset} className="underline underline-offset-2">
              איפוס
            </button>
          </>
        )}
      </p>
      {error && <p role="alert" className="text-xs text-amber-800">{error}</p>}

      <ul className="divide-y divide-line border-y border-line">
        {people.map((person) => {
          const done = marked.has(person.id);
          const wa = whatsappUrl(person.phone, person.message);
          return (
            <li key={person.id} className="flex flex-wrap items-center gap-x-3 gap-y-1.5 py-2">
              <span className={`min-w-0 flex-1 ${done ? "text-muted" : "font-medium"}`}>
                {done && (
                  <>
                    <span aria-hidden>✓ </span>
                    <span className="sr-only">נשלח: </span>
                  </>
                )}
                {person.fullName}
                <span className="mr-2 text-xs font-normal text-muted">
                  {person.count === 1 ? "משמרת אחת" : `${person.count} משמרות`}
                </span>
              </span>
              <span className="flex gap-1.5">
                {wa && (
                  <a
                    href={wa}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={() => mark(person.id)}
                    className="inline-flex min-h-9 items-center border border-line bg-surface px-3 text-xs font-medium transition hover:bg-paper"
                  >
                    וואטסאפ
                  </a>
                )}
                <Button variant="ghost" size="sm" onClick={() => copy(person)}>
                  {copied === person.id ? "הועתק ✓" : "העתקה"}
                </Button>
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
