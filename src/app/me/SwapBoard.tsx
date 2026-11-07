"use client";

import { useState, useTransition } from "react";
import { Badge, Button, Card } from "@/components/ui";
import { Dialog } from "@/components/Dialog";
import { DAY_NAMES, ROLE_LABEL } from "@/lib/domain";
import type { OpenOfferView } from "@/lib/swap-board";

type Result = { ok: true } | { ok: false; error: string };

/** "40 דקות" · "5 שעות" · "3 ימים" — כמה נשאר עד שההצעה נסגרת */
function timeLeftLabel(minutes: number): string {
  if (minutes < 60) return `${minutes} דקות`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return hours === 1 ? "שעה" : `${hours} שעות`;
  const days = Math.floor(hours / 24);
  return days === 1 ? "יום" : `${days} ימים`;
}

export function SwapBoard({
  offers,
  actions,
}: {
  offers: OpenOfferView[];
  actions: { claim: (offerId: string) => Promise<Result> };
}) {
  const [confirming, setConfirming] = useState<OpenOfferView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (offers.length === 0 && !error) return null;

  return (
    <>
      <Card flush>
        <div className="border-b border-line px-5 py-4">
          <h2 className="font-bold">משמרות פנויות</h2>
          <p className="mt-0.5 text-sm text-muted">
            עובדים שלא יכולים להגיע מסרו את המשמרות האלה. מוצגות רק כאלה
            שמתאימות לתפקיד שלך ושאתה פנוי בהן. הראשון שתופס — מקבל.
          </p>
        </div>

        {error && (
          <p role="alert" className="border-b border-line bg-amber-50 px-5 py-2.5 text-sm text-amber-900">
            {error}
          </p>
        )}

        {offers.length === 0 ? (
          <p className="px-5 py-4 text-sm text-muted">
            אין כרגע משמרות פנויות שמתאימות לך.
          </p>
        ) : (
          <ul className="divide-y divide-line">
            {offers.map((offer) => (
              <li
                key={offer.offerId}
                className="flex flex-wrap items-center gap-x-3 gap-y-2 px-5 py-3.5"
              >
                <span className="w-14 shrink-0 font-semibold">
                  {DAY_NAMES[offer.dayOfWeek]}
                </span>
                <span className="num text-lg font-semibold">
                  {offer.start}–{offer.end}
                </span>
                <span className="text-sm text-muted">
                  {ROLE_LABEL[offer.role]} · מ{offer.offeredBy.fullName}
                </span>
                <Badge tone="amber">{`נסגר בעוד ${timeLeftLabel(offer.minutesLeft)}`}</Badge>
                <Button
                  variant="secondary"
                  size="sm"
                  className="mr-auto"
                  onClick={() => {
                    setError(null);
                    setConfirming(offer);
                  }}
                >
                  אני לוקח
                </Button>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {/* גיליון אישור: לקיחת משמרת מחייבת אותך להגיע לעבודה, ולכן היא לא
          קורית בלחיצה אחת. זה גם המקום היחיד במסך שבו יושבת פעולה אדומה,
          ובו מוצגות השעות המלאות שתקבל — בלי הפתעות. */}
      {confirming && (
        <Dialog
          label="לקחת את המשמרת?"
          onClose={() => setConfirming(null)}
          className="max-w-md"
        >
          <h3 className="text-lg font-bold">לקחת את המשמרת?</h3>
          <p className="mt-3 text-sm">
            יום {DAY_NAMES[confirming.dayOfWeek]},{" "}
            <strong className="num text-base">
              {confirming.start}–{confirming.end}
            </strong>{" "}
            — {ROLE_LABEL[confirming.role]}.
          </p>
          <p className="mt-1.5 text-sm text-muted">
            תקבל את המשמרת המלאה, גם אם {confirming.offeredBy.fullName} היה
            אמור לעבוד בה פחות שעות. אחרי האישור היא נכנסת לסידור על שמך.
          </p>

          <div className="mt-5 flex gap-2">
            <Button
              disabled={pending}
              onClick={() =>
                startTransition(async () => {
                  const result = await actions.claim(confirming.offerId);
                  setConfirming(null);
                  if (!result.ok) setError(result.error);
                })
              }
            >
              {pending ? "רושם…" : "כן, אני לוקח את המשמרת"}
            </Button>
            <Button
              variant="ghost"
              disabled={pending}
              onClick={() => setConfirming(null)}
            >
              ביטול
            </Button>
          </div>
        </Dialog>
      )}
    </>
  );
}
