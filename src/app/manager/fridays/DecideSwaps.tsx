"use client";

import { useState, useTransition } from "react";
import { Badge, Button, Notice } from "@/components/ui";
import type { FridaySwapView } from "@/lib/friday-swap-board";

/**
 * הכרעת המנהל על חילופי שישי.
 *
 * עד הלחיצה כאן שום דבר לא זז — זה החוזה של כל החילופים במערכת. מוצג
 * מי נותן, מי מקבל, ובהחלפה גם מה ניתן בתמורה, כי בלי זה אי אפשר לדעת
 * על מה בכלל מחליטים.
 */
export function DecideSwaps({
  awaiting,
  decide,
  format,
}: {
  awaiting: FridaySwapView[];
  decide: (offerId: string, approve: boolean) => Promise<{ error?: string }>;
  format: Record<string, string>;
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  if (awaiting.length === 0) return null;

  const day = (d: string | null) => (d ? (format[d] ?? d) : "—");

  return (
    <Notice title={`חילופי שישי שממתינים להכרעה (${awaiting.length})`}>
      {error && <p role="alert" className="mb-2 text-sm">{error}</p>}
      <ul className="space-y-3 text-sm">
        {awaiting.map((o) => (
          <li key={o.id} className="border-b border-line/50 pb-3 last:border-0 last:pb-0">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone="blue">{o.mode === "trade" ? "החלפה" : "מסירה"}</Badge>
              <span>
                <span className="font-medium">{o.offeredBy}</span> מוסר את{" "}
                <span className="num">{day(o.offeredDate)}</span>
              </span>
              {o.offeredIsClosing && <Badge tone="amber">סגירה</Badge>}
            </div>
            <div className="mt-1 text-muted">
              {o.claimedBy} לוקח
              {o.mode === "trade" && o.inReturnDate && (
                <>
                  , ונותן בתמורה את <span className="num">{day(o.inReturnDate)}</span>
                </>
              )}
            </div>
            <div className="mt-2 flex gap-2">
              <Button
                type="button"
                size="sm"
                disabled={pending}
                onClick={() =>
                  start(async () => setError((await decide(o.id, true)).error ?? null))
                }
              >
                אישור
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                disabled={pending}
                onClick={() =>
                  start(async () => setError((await decide(o.id, false)).error ?? null))
                }
              >
                דחייה
              </Button>
            </div>
          </li>
        ))}
      </ul>
    </Notice>
  );
}
