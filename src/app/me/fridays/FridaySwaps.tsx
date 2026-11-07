"use client";

import { useState, useTransition } from "react";
import { Badge, Button, Card, Notice, Num } from "@/components/ui";
import type { FridaySwapView } from "@/lib/friday-swap-board";

/**
 * מסירה והחלפה של שישי, מהצד של העובד.
 *
 * שישי הוא משמרת חובה, ולכן מי שאינו יכול לרוב אינו רוצה *לוותר* על
 * המכסה אלא להזיז אותה — וזה בדיוק ההבדל בין שני הכפתורים. מסירה נותנת
 * את המשמרת, החלפה מבקשת שישי אחר בתמורה.
 *
 * שום לחיצה כאן אינה מזיזה משמרת: הכל נעצר אצל המנהל.
 */
export function FridaySwaps({
  myFridays,
  openOffers,
  myOffers,
  actions,
  format,
}: {
  myFridays: { id: string; date: string; isClosing: boolean }[];
  openOffers: FridaySwapView[];
  myOffers: FridaySwapView[];
  actions: {
    offer: (planId: string, mode: string) => Promise<{ error?: string }>;
    cancel: (offerId: string) => Promise<{ error?: string }>;
    claim: (offerId: string, inReturnPlanId: string | null) => Promise<{ error?: string }>;
  };
  /** "YYYY-MM-DD" לתצוגה — הפורמט נגזר בשרת כדי שלא יהיה תלוי בשעון הדפדפן */
  format: Record<string, string>;
}) {
  const [error, setError] = useState<string | null>(null);
  const [tradeFor, setTradeFor] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const run = (fn: () => Promise<{ error?: string }>) =>
    start(async () => {
      const r = await fn();
      setError(r.error ?? null);
    });

  const day = (d: string) => format[d] ?? d;
  const offeredIds = new Set(myOffers.map((o) => o.offeredDate));

  return (
    <>
      {error && (
        <Notice alert title="לא הצלחתי">
          <p className="text-sm">{error}</p>
        </Notice>
      )}

      {myFridays.length > 0 && (
        <Card className="mt-4">
          <h2 className="mb-1 font-semibold">לא יכול באחד מהם?</h2>
          <p className="mb-3 text-sm text-muted">
            מסירה = מישהו לוקח במקומך. החלפה = אתה מקבל שישי אחר בתמורה.
            בשני המקרים המנהל מאשר לפני שמשהו זז.
          </p>
          <ul className="space-y-2 text-sm">
            {myFridays.map((f) => (
              <li key={f.id} className="flex flex-wrap items-center gap-2">
                <span className="num font-medium">{day(f.date)}</span>
                {f.isClosing && <Badge tone="amber">סגירה</Badge>}
                {offeredIds.has(f.date) ? (
                  <span className="mr-auto text-xs text-muted">כבר הצעת</span>
                ) : (
                  <span className="mr-auto flex gap-1">
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      disabled={pending}
                      onClick={() => run(() => actions.offer(f.id, "give"))}
                    >
                      מסירה
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      disabled={pending}
                      onClick={() => run(() => actions.offer(f.id, "trade"))}
                    >
                      החלפה
                    </Button>
                  </span>
                )}
              </li>
            ))}
          </ul>
        </Card>
      )}

      {myOffers.length > 0 && (
        <Card className="mt-4">
          <h2 className="mb-2 font-semibold">ההצעות שלי</h2>
          <ul className="space-y-2 text-sm">
            {myOffers.map((o) => (
              <li key={o.id} className="flex flex-wrap items-center gap-2">
                <span className="num font-medium">{day(o.offeredDate)}</span>
                <Badge tone="blue">{o.mode === "trade" ? "החלפה" : "מסירה"}</Badge>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="mr-auto"
                  disabled={pending}
                  onClick={() => run(() => actions.cancel(o.id))}
                >
                  ביטול
                </Button>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card className="mt-4">
        <h2 className="mb-2 font-semibold">
          שישיים שמחפשים מחליף <Num>{openOffers.length}</Num>
        </h2>
        {openOffers.length === 0 ? (
          <p className="text-sm text-muted">אין כרגע הצעות פתוחות.</p>
        ) : (
          <ul className="space-y-3 text-sm">
            {openOffers.map((o) => (
              <li key={o.id} className="border-b border-line/50 pb-3 last:border-0 last:pb-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="num font-medium">{day(o.offeredDate)}</span>
                  <span className="text-muted">{o.offeredBy}</span>
                  {o.offeredIsClosing && <Badge tone="amber">סגירה</Badge>}
                  <Badge tone="blue">{o.mode === "trade" ? "החלפה" : "מסירה"}</Badge>
                </div>

                {o.mode === "give" ? (
                  /*
                   * `secondary` ולא אדום.
                   *
                   * הכפתור הזה יושב בתוך לולאה על ההצעות הפתוחות, ולכן
                   * חמש הצעות מייצרות חמישה כפתורים אדומים — וכשהכל
                   * אדום, שום דבר אינו הפעולה הראשית. אדום שמור לפעולה
                   * אחת למסך, ראה חוזה האדום ב-globals.css.
                   */
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    className="mt-2"
                    disabled={pending}
                    onClick={() => run(() => actions.claim(o.id, null))}
                  >
                    אני לוקח
                  </Button>
                ) : (
                  /*
                   * החלפה דורשת לבחור מה נותנים בתמורה, ולכן היא אינה
                   * לחיצה אחת: בלי הבחירה אין החלפה אלא מסירה.
                   */
                  <div className="mt-2">
                    {myFridays.length === 0 ? (
                      <p className="text-sm text-muted">
                        אין לך שישי להציע בתמורה.
                      </p>
                    ) : tradeFor === o.id ? (
                      <div className="flex flex-wrap items-center gap-1">
                        <span className="text-xs text-muted">בתמורה ל:</span>
                        {myFridays
                          .filter((f) => f.date !== o.offeredDate)
                          .map((f) => (
                            <Button
                              key={f.id}
                              type="button"
                              size="sm"
                              variant="ghost"
                              disabled={pending}
                              onClick={() => run(() => actions.claim(o.id, f.id))}
                            >
                              {day(f.date)}
                            </Button>
                          ))}
                      </div>
                    ) : (
                      <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        disabled={pending}
                        onClick={() => setTradeFor(o.id)}
                      >
                        אני מחליף
                      </Button>
                    )}
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}
