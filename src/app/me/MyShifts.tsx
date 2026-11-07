"use client";

import { useState, useTransition } from "react";
import { useConfirm } from "@/components/Dialog";
import { Badge, Button, Card } from "@/components/ui";
import { DAY_NAMES } from "@/lib/domain";
import { shiftHours, showsEndTime } from "@/lib/week";
import { HoursText } from "@/components/HoursText";
import type { MyShiftView, SwapPeer } from "@/lib/swap-board";
import { CalendarSheet } from "./CalendarSheet";

type Result = { ok: true } | { ok: false; error: string };

/** אייקון יומן קטן — נייטרלי בכוונה, זו לא פעולה ראשית */
function CalendarIcon() {
  return (
    <svg
      aria-hidden
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      className="size-4"
    >
      <rect x="2.75" y="4.25" width="14.5" height="13" rx="2.5" />
      <path d="M2.75 8.25h14.5M6.75 2.75v3M13.25 2.75v3" strokeLinecap="round" />
    </svg>
  );
}

export function MyShifts({
  weekLabel,
  shifts,
  givenAway,
  calendarHref,
  calendarLink,
  actions,
}: {
  weekLabel: string;
  shifts: MyShiftView[];
  givenAway: {
    slotId: string;
    dayOfWeek: number;
    start: string;
    end: string;
    to: SwapPeer;
  }[];
  /** כל משמרות השבוע כקובץ יומן — ההורדה החד-פעמית בחלון */
  calendarHref: string;
  /** הקישור למנוי היומן האישי; `true` מחליף אותו בחדש */
  calendarLink: (renew: boolean) => Promise<string | null>;
  actions: {
    offer: (slotId: string) => Promise<Result>;
    cancel: (offerId: string) => Promise<Result>;
  };
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [ask, dialog] = useConfirm();
  const [calendarOpen, setCalendarOpen] = useState(false);

  async function run(fn: () => Promise<Result>, confirmText?: string, confirmLabel?: string) {
    if (confirmText && !(await ask(confirmText, { confirmLabel }))) return;
    setError(null);
    startTransition(async () => {
      const result = await fn();
      if (!result.ok) setError(result.error);
    });
  }

  return (
    <Card flush>
      {dialog}
      <h2 className="border-b border-line px-5 py-4 font-bold">
        המשמרות שלי · שבוע <span className="num">{weekLabel}</span>
      </h2>

      {error && (
        <p role="alert" className="border-b border-line bg-amber-50 px-5 py-2.5 text-sm text-amber-900">
          {error}
        </p>
      )}

      {shifts.length === 0 && givenAway.length === 0 ? (
        <p className="px-5 py-4 text-sm text-muted">
          לא שובצת למשמרות בשבוע הזה.
        </p>
      ) : (
        <ul className="divide-y divide-line">
          {shifts.map((shift) => (
            <li key={shift.slotId} className="px-5 py-3.5">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                <span className="w-14 shrink-0 font-semibold">
                  {DAY_NAMES[shift.dayOfWeek]}
                </span>
                {/* בשישי רק שעת ההגעה — ראה showsEndTime. בשאר הימים כמו
                    בסידור: טווח, רק הגעה או רק סיום (HoursText) */}
                <span className="text-lg font-semibold">
                  {showsEndTime(shift.dayOfWeek) ? (
                    <HoursText
                      start={shift.actualStart}
                      end={shift.actualEnd}
                      display={shift.timeDisplay}
                    />
                  ) : (
                    <span className="num">{shift.actualStart}</span>
                  )}
                </span>

                {shift.shortened && (
                  <Badge tone="amber">
                    {`מקוצר — המשמרת עד ${shift.slotEnd}`}
                  </Badge>
                )}
                {/* מתלמד: מצטרף לבלוק של עובד רגיל, ולא מוסר אותו */}
                {shift.trainee && (
                  <Badge tone="blue">
                    {shift.trainee.with ? `מתלמד · עם ${shift.trainee.with}` : "מתלמד"}
                  </Badge>
                )}
                {shift.takenFrom && (
                  <Badge>{`לקחת מ${shift.takenFrom.fullName}`}</Badge>
                )}
                {shift.openOfferId && <Badge tone="amber">מחכה למחליף</Badge>}
                {/* מישהו תפס, וההחלטה אצל המנהל. המשמרת עדיין שלי — ולכן
                    היא כאן ולא ב"נמסרו", וזה מה שהתג אומר. */}
                {shift.pendingClaimBy && (
                  <Badge tone="amber">
                    {`${shift.pendingClaimBy} לקח — ממתין לאישור המנהל`}
                  </Badge>
                )}

                <span className="mr-auto flex items-center gap-2">
                  {shift.pendingClaimBy ? (
                    /* אין מה לעשות עד ההכרעה: ביטול היה מושך את הקרקע
                       מתחת למי שכבר תפס, והמנהל כבר מחזיק בהחלטה. */
                    <span className="text-xs text-muted">ממתין להכרעה</span>
                  ) : shift.openOfferId ? (
                    <Button
                      variant="secondary"
                      size="sm"
                      disabled={pending}
                      onClick={() =>
                        run(() => actions.cancel(shift.openOfferId!))
                      }
                    >
                      ביטול המסירה
                    </Button>
                  ) : shift.canOffer ? (
                    <Button
                      variant="secondary"
                      size="sm"
                      disabled={pending}
                      onClick={() =>
                        run(
                          () => actions.offer(shift.slotId),
                          `למסור את משמרת יום ${DAY_NAMES[shift.dayOfWeek]} ${shiftHours(shift)}?\n\nהיא תוצע לשאר העובדים בתפקיד שלך, והראשון שיתפוס יקבל אותה. עד שמישהו יתפוס — המשמרת עדיין שלך.`,
                          "מסירה",
                        )
                      }
                    >
                      מוסר את המשמרת
                    </Button>
                  ) : (
                    shift.offerBlockedReason && (
                      /* הסבר שהעובד צריך לקרוא, לא תווית — 14px ולא 12 */
                      <span className="text-sm text-muted">
                        {shift.offerBlockedReason}
                      </span>
                    )
                  )}
                </span>
              </div>

              {shift.label && (
                <p className="mt-0.5 text-xs text-muted">{shift.label}</p>
              )}
              {/* הערה של המנהל לבלוק הזה — מה שהעובד צריך לדעת לפני שהוא מגיע */}
              {shift.note && <p className="mt-1 text-sm font-medium">{shift.note}</p>}
            </li>
          ))}

          {/* משמרת שנמסרה נעלמת מהשיבוצים — בלי השורה הזו העובד היה מגלה
              חור בסידור שלו בלי שום הסבר */}
          {givenAway.map((given, i) => (
            <li
              key={i}
              className="flex flex-wrap items-center gap-x-3 gap-y-1 px-5 py-3 text-muted"
            >
              <span className="w-14 shrink-0 font-medium">
                {DAY_NAMES[given.dayOfWeek]}
              </span>
              <span className="num line-through">
                {given.start}–{given.end}
              </span>
              <Badge>{`מסרת ל${given.to.fullName}`}</Badge>
            </li>
          ))}
        </ul>
      )}

      {shifts.length > 0 && (
        <div className="border-t border-line px-5 py-4">
          {/* ניטרלי ולא אדום: הפעולה הראשית בעמוד היא ההגשה. כפתור אחד
              לכל היומנים — הבחירה בין אפל לגוגל בחלון, ראה CalendarSheet */}
          <Button variant="secondary" onClick={() => setCalendarOpen(true)}>
            <CalendarIcon />
            הוספה ליומן
          </Button>
          <p className="mt-2 text-xs text-muted">
            ביומן אפל אפשר להירשם פעם אחת, ומאז כל שינוי בסידור מגיע לבד.
          </p>
        </div>
      )}

      {calendarOpen && (
        <CalendarSheet
          shifts={shifts}
          calendarHref={calendarHref}
          calendarLink={calendarLink}
          onClose={() => setCalendarOpen(false)}
        />
      )}
    </Card>
  );
}
