"use client";

import { useEffect, useState } from "react";
import { Dialog } from "@/components/Dialog";
import { Button } from "@/components/ui";
import { DAY_NAMES } from "@/lib/domain";
import { showsEndTime } from "@/lib/week";
import { HoursText } from "@/components/HoursText";
import type { MyShiftView } from "@/lib/swap-board";

/** שורת בחירה בחלון: כותרת ושורת הסבר, לרוחב מלא, יעד מגע נוח */
const OPTION =
  "flex w-full min-h-16 flex-col items-start justify-center gap-0.5 border border-line px-4 py-3 text-start " +
  "transition-transform duration-150 ease-[var(--ease-out)] active:scale-[0.98] hover:bg-paper " +
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand/60";

/**
 * "הוספה ליומן" — כפתור אחד, ובחלון בוחרים לאיזה יומן.
 *
 * שני היומנים לא עובדים באותה דרך, וזה לא בחירה שלנו:
 * - **אפל** נרשם למנוי: כתובת אישית (src/lib/calendar-feed.ts) שהאייפון
 *   מושך ממנה שוב ושוב, כך שכל שינוי בסידור מגיע ליומן לבד. ההורדה
 *   החד-פעמית נשארת כאפשרות משנית.
 * - **גוגל** מקבל אירוע אחד לכל קישור. מנוי בגוגל אפשר להוסיף רק מהמחשב
 *   (ומתעדכן פעם בכמה שעות), ולכן בטלפון החלון מציג את המשמרות אחת-אחת
 *   ומסמן ✓ על מה שכבר נפתח; הכתובת למחשב מתחת (רואי בחר בזה).
 *
 * אין זיהוי מכשיר: אייפון עם יומן גוגל קיים, והשורה מתחת לכל אפשרות
 * אומרת למי היא מתאימה.
 */
export function CalendarSheet({
  shifts,
  calendarHref,
  calendarLink,
  onClose,
}: {
  shifts: MyShiftView[];
  /** קובץ ה-.ics של כל משמרות השבוע — ההורדה החד-פעמית */
  calendarHref: string;
  /** הכתובת של המנוי האישי; `true` מחליף אותה בחדשה */
  calendarLink: (renew: boolean) => Promise<string | null>;
  onClose: () => void;
}) {
  const [view, setView] = useState<"choose" | "google">("choose");
  const [opened, setOpened] = useState<Set<string>>(() => new Set());
  const [closing, setClosing] = useState(false);
  /** הכתובת של המנוי — נטענת כשהחלון נפתח, ונוצרת בפעם הראשונה */
  const [feed, setFeed] = useState<string | null>(null);
  const [renewed, setRenewed] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let live = true;
    void calendarLink(false).then((url) => live && setFeed(url));
    return () => {
      live = false;
    };
  }, [calendarLink]);

  // אותה יציאה מהירה של ConfirmDialog — ההחלטה כבר התקבלה
  function close() {
    if (closing) return;
    setClosing(true);
    const instant = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    window.setTimeout(onClose, instant ? 0 : 150);
  }

  async function renew() {
    setFeed(null);
    setFeed(await calendarLink(true));
    setRenewed(true);
  }

  async function copy() {
    if (!feed) return;
    try {
      await navigator.clipboard.writeText(feed);
      setCopied(true);
    } catch {
      // הכתובת גלויה בשדה — אפשר לסמן ולהעתיק ביד
    }
  }

  /** webcal:// — הכתובת שהאייפון מזהה כמנוי ופותח ביומן */
  const webcal = feed?.replace(/^https?:\/\//, "webcal://") ?? null;
  const title = view === "choose" ? "הוספה ליומן" : "יומן גוגל";

  return (
    <Dialog label={title} onClose={close} closing={closing} className="max-w-md">
      <h2 className="text-lg font-bold">{title}</h2>

      {view === "choose" ? (
        <>
          <div className="mt-4 space-y-2">
            <a
              href={webcal ?? undefined}
              aria-disabled={!webcal}
              onClick={close}
              className={`${OPTION} ${webcal ? "" : "pointer-events-none opacity-60"}`}
            >
              <span className="font-semibold">יומן אפל · מתעדכן לבד</span>
              <span className="text-sm text-muted">
                אייפון · נרשמים פעם אחת, ומאז כל שינוי בסידור מגיע ליומן
              </span>
            </a>
            <button type="button" onClick={() => setView("google")} className={OPTION}>
              <span className="font-semibold">יומן גוגל</span>
              <span className="text-sm text-muted">אנדרואיד · משמרת אחרי משמרת</span>
            </button>
          </div>

          {/* בלי `download`: הראוט כבר שולח attachment, ובלי התכונה ספארי
              באייפון מעביר את הקובץ ליומן ("הוספת הכול") ולא שומר אותו
              בקבצים */}
          <p className="mt-3 text-sm text-muted">
            מעדיפים בלי מנוי?{" "}
            <a href={calendarHref} onClick={close} className="underline underline-offset-2">
              הורדה חד-פעמית של משמרות השבוע
            </a>
          </p>
        </>
      ) : (
        <>
          <p className="mt-2 text-sm text-muted">
            גוגל מקבל משמרת אחת בכל פעם: לוחצים &quot;הוספה&quot;, שומרים בגוגל,
            וחוזרים לכאן לבאה.
          </p>
          <ul className="mt-4 divide-y divide-line border-y border-line">
            {shifts.map((shift) => {
              const done = opened.has(shift.slotId);
              return (
                <li key={shift.slotId} className="flex items-center gap-3 py-2.5">
                  <span className="w-14 shrink-0 font-semibold">
                    {DAY_NAMES[shift.dayOfWeek]}
                  </span>
                  {showsEndTime(shift.dayOfWeek) ? (
                    <HoursText
                      start={shift.actualStart}
                      end={shift.actualEnd}
                      display={shift.timeDisplay}
                    />
                  ) : (
                    <span className="num">{shift.actualStart}</span>
                  )}
                  <span className="mr-auto flex items-center gap-2">
                    {done && (
                      <span className="text-sm text-muted">
                        <span aria-hidden>✓ </span>נפתח
                      </span>
                    )}
                    <a
                      href={shift.googleUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label={`הוספת משמרת יום ${DAY_NAMES[shift.dayOfWeek]} ליומן גוגל`}
                      onClick={() =>
                        setOpened((prev) => new Set(prev).add(shift.slotId))
                      }
                      className="inline-flex min-h-10 items-center border border-ink/80 bg-surface px-3 text-sm font-medium transition-transform duration-150 ease-[var(--ease-out)] active:scale-[0.97] hover:bg-paper"
                    >
                      הוספה
                    </a>
                  </span>
                </li>
              );
            })}
          </ul>

          {/* מנוי בגוגל אפשר להוסיף רק מהאתר של גוגל במחשב */}
          <details className="mt-4 text-sm">
            <summary className="cursor-pointer font-medium">
              מנוי שמתעדכן לבד — מהמחשב
            </summary>
            <ol className="mt-2 list-decimal space-y-1 pr-5 text-muted">
              <li>
                במחשב, פותחים את <span className="num">calendar.google.com</span>
              </li>
              <li>ליד &quot;יומנים אחרים&quot; לוחצים + ואז &quot;מכתובת URL&quot;</li>
              <li>מדביקים את הכתובת שלמטה ולוחצים &quot;הוספת יומן&quot;</li>
            </ol>
            <div className="mt-2 flex gap-2">
              <input
                readOnly
                value={feed ?? "טוען…"}
                onFocus={(e) => e.currentTarget.select()}
                aria-label="הכתובת של המנוי האישי"
                dir="ltr"
                className="min-w-0 flex-1 border border-line bg-paper px-2 py-1.5 text-xs"
              />
              <Button variant="secondary" size="sm" disabled={!feed} onClick={copy}>
                {copied ? "הועתק ✓" : "העתקה"}
              </Button>
            </div>
            <p className="mt-1 text-xs text-muted">גוגל מעדכן מנוי כזה פעם בכמה שעות.</p>
          </details>
        </>
      )}

      {/* הכתובת אישית: מי שמחזיק בה רואה את המשמרות שלך. "קישור חדש"
          מבטל את הישן, וצריך להירשם שוב */}
      <p className="mt-4 text-xs text-muted">
        {renewed ? (
          "נוצר קישור חדש. הישן הפסיק לעבוד — צריך להירשם שוב ביומן."
        ) : (
          <>
            הקישור למנוי אישי. שלחת אותו למישהו בטעות?{" "}
            <button type="button" onClick={renew} disabled={!feed} className="underline underline-offset-2">
              קישור חדש
            </button>
          </>
        )}
      </p>

      <div className="mt-5 flex gap-2">
        {view === "google" && (
          <Button variant="secondary" onClick={() => setView("choose")}>
            חזרה
          </Button>
        )}
        <Button variant="ghost" onClick={close}>
          סגירה
        </Button>
      </div>
    </Dialog>
  );
}
