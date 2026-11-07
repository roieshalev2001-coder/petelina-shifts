"use client";

import { Fragment, useState } from "react";
import { DAY_NAMES, ROLE_LABEL, ROLE_LABEL_PLURAL } from "@/lib/domain";
import { buildGrid, daySlotsInOrder, showsStartTime, type GridSlot } from "@/lib/grid";
import { PinIcon, RoleDot } from "@/components/ui";
import { addDays, formatDayMonth } from "@/lib/time";
import { showsEndTime } from "@/lib/week";
import type { CellAssignment } from "./ScheduleTable";
import { TraineeLine } from "./TraineeLine";
import { HoursText } from "./HoursText";

/**
 * הסידור בטלפון — יום אחד ברשימה אנכית.
 *
 * הגיליון הוא שש עמודות ברוחב מינימלי של 60rem, וכיווץ שלו לטלפון נותן
 * טקסט שאי אפשר לקרוא או גלילה אופקית ארוכה בלי עמודה נעוצה. אפליקציות
 * סידור פותרות את זה באותה דרך: בוחרים יום, ורואים אותו לגובה.
 *
 * **אותם נתונים ואותה `buildGrid`** — זו תצוגה שנייה, לא מקור שני. וכל
 * מה שהטבלה מסמנת נשמר: ריק, כיסוי חלקי, נעיצה, מסירה ושעת התחלה חורגת.
 *
 * הגיליון עצמו נשאר כפי שהוא מ-`md` ומעלה. ראה ScheduleTable.
 */
export function ScheduleDays({
  weekStart,
  slots,
  assignments,
  days,
  onPickCell,
  onAddSlot,
  selectedSlotId,
  partialCounts,
  swapMarks,
  trainees,
}: {
  weekStart: string;
  slots: GridSlot[];
  assignments: CellAssignment[];
  days: number[];
  onPickCell?: (slot: GridSlot) => void;
  onAddSlot?: (day: number) => void;
  selectedSlotId?: string | null;
  partialCounts?: Record<string, number>;
  swapMarks?: Record<string, "open" | "done">;
  trainees?: Record<string, string>;
}) {
  const start = new Date(weekStart);
  const rows = buildGrid(slots, days);
  const bySlot = new Map(assignments.map((a) => [a.slotId, a]));

  /*
   * ברירת המחדל היא היום הראשון בשבוע ולא "היום".
   *
   * המנהל בונה סידור לשבוע שעוד לא התחיל, ולכן "היום" כמעט תמיד מחוץ
   * לשבוע המוצג — ופתיחה על יום ריק נראית כמו תקלה.
   */
  const [day, setDay] = useState(days[0]);
  const index = days.indexOf(day);
  /*
   * משבצת שהיום הזה לא כולל אינה חור באיוש, ואין מה להציג עבורה. תא
   * משותף (שני האחמ"שים של שישי) נפרש לשורה לכל משבצת: בטלפון כל שם
   * הוא יעד מגע משלו, עם השעה שלו.
   */
  const visible = daySlotsInOrder(rows, index);

  return (
    <div className="md:hidden">
      {/* בורר היום — נשאר גלוי בגלילה, כי הוא ההקשר של כל מה שמתחתיו */}
      {/* `top-header` ולא `top-14`: גובה הכותרת גדל ב-safe-area, ראה globals.css */}
      <div className="top-header sticky z-20 -mx-4 border-b border-line bg-paper/95 px-4 py-2 backdrop-blur">
        <div className="flex gap-1.5">
          {days.map((d) => {
            const active = d === day;
            return (
              <button
                key={d}
                onClick={() => setDay(d)}
                aria-pressed={active}
                className={`flex min-h-11 flex-1 flex-col items-center justify-center px-1 text-xs font-semibold transition-[background-color,color,transform] duration-150 ease-[var(--ease-out)] active:scale-[0.96] ${
                  active
                    ? "bg-brand text-white"
                    : "border border-line bg-surface text-muted"
                }`}
              >
                {DAY_NAMES[d]}
                <span className="num text-[0.625rem] font-normal opacity-80">
                  {formatDayMonth(addDays(start, d))}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* "+ בלוק" בראש הרשימה, גלוי בלי לגלול */}
      {onAddSlot && (
        <button
          type="button"
          onClick={() => onAddSlot(day)}
          className="mt-3 flex min-h-11 w-full items-center justify-center border border-ink/40 bg-surface text-sm font-semibold transition-transform duration-150 ease-[var(--ease-out)] active:scale-[0.99]"
        >
          + הוספת בלוק ל{DAY_NAMES[day]}
        </button>
      )}

      <ul className="mt-3 space-y-1.5">
        {visible.map(({ cell, slot }, i) => {
          /*
           * שם התפקיד בראש כל קבוצה. הנקודה הצבעונית לבדה לא מספיקה —
           * מי שלא מבחין בין הצבעים לא ידע מי מלצר ומי ברמן.
           *
           * לפי התפקיד של התא ולא של השורה: בשישי המלצר השביעי יושב בשורת
           * אחראי הערב, ו"אחמ"שים" באמצע רשימת המלצרים היה מטעה.
           */
          const role = cell.role;
          const groupStart = i === 0 || visible[i - 1].cell.role !== role;

          const a = bySlot.get(slot.id);
          const selected = selectedSlotId === slot.id;
          const flagged = a?.shortened && !a.shortenedApproved;
          const overMax = Boolean(a?.overMax && !a.overMaxApproved);
          const options = partialCounts?.[slot.id] ?? 0;
          const swap = swapMarks?.[slot.id];
          const attention = flagged || swap === "open";

          const body = (
            <>
              <RoleDot role={role} className="shrink-0" />
              <span className="sr-only">{ROLE_LABEL[role]}, </span>

              {/* השעות של המשבצת עצמה, לא של השורה — בשישי השורה שייכת
                  ליום אחר. בשישי רק שעת ההגעה (showsEndTime), ולאחמ"שים
                  ולברמנים של שישי בלי שעה בכלל (showsStartTime) */}
              {/* בלי `.num` על העטיפה: "עד 15:00" חייב לזרום מימין לשמאל;
                  השעות עצמן מבודדות בתוך HoursText. text-left שומר על
                  היישור הקודם של עמודת השעות */}
              <span className="w-28 shrink-0 text-left text-xs text-muted">
                {!showsStartTime(slot) ? null : !showsEndTime(day) ? (
                  <span className="num">{slot.startTime}</span>
                ) : (
                  <HoursText start={slot.startTime} end={slot.endTime} display={slot.timeDisplay} />
                )}
              </span>

              <span className="min-w-0 flex-1 text-right">
                {a ? (
                  <span className="font-medium">
                    {a.employeeName}
                    {swap === "done" && (
                      <>
                        <span aria-hidden title="המשמרת הוחלפה" className="mr-1 text-xs text-muted">
                          ⇄
                        </span>
                        <span className="sr-only">, המשמרת הוחלפה</span>
                      </>
                    )}
                    {a.pinned && <PinIcon className="mr-1 text-muted" />}
                    {a.note && (
                      <span className="block text-xs font-normal text-muted">{a.note}</span>
                    )}
                    {/* האילוץ לא נכתב ליד השם — ראה ScheduleTable */}
                    {a.shortened && !a.shortenedApproved && (
                      <span className="sr-only">, מקוצר, ממתין לאישור</span>
                    )}
                    {overMax && (
                      <span className="block text-xs font-medium text-red-800">
                        מעל המקסימום{" "}
                        <span className="num">
                          {a.shiftCount}/{a.maxShifts}
                        </span>
                        <span aria-hidden> ⚑</span>
                        <span className="sr-only">, ממתין לאישור</span>
                      </span>
                    )}
                  </span>
                ) : options > 0 ? (
                  <span className="text-xs font-medium text-amber-800">
                    {options === 1 ? "אפשרות אחת" : `${options} אפשרויות`}
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 text-xs font-medium text-amber-800">
                    <span className="size-1.5 rounded-full bg-amber-500" />
                    ריק
                  </span>
                )}
                {trainees?.[slot.id] && <TraineeLine name={trainees[slot.id]} className="text-muted" />}
              </span>
            </>
          );

          const shell = [
            "flex min-h-12 w-full items-center gap-2.5 border px-3 py-2 text-right",
            // חריגה גוברת על הענבר — היא היחידה שחוסמת פרסום עד אישור.
            // נמדד מול השורות הלבנות: rose-50 יצא 1.1:1, כלומר בלתי נראה.
            // הגבול (4.77:1) הוא שמבדיל; המילוי נשאר בהיר כי red-200 כבר
            // מוריד את שעת המשמרת האפורה מתחת ל-4.5:1.
            overMax
              ? "border-red-600 bg-red-100"
              : attention
                ? "border-amber-300 bg-amber-50/70"
                : "border-line bg-surface",
            selected ? "outline outline-2 -outline-offset-2 outline-brand" : "",
          ]
            .filter(Boolean)
            .join(" ");

          return (
            <Fragment key={slot.id}>
              {groupStart && (
                <li className="pt-3 text-xs font-semibold text-muted first:pt-0">
                  {ROLE_LABEL_PLURAL[role]}
                </li>
              )}
              <li>
                {onPickCell ? (
                  <button
                    onClick={() => onPickCell(slot)}
                    className={`${shell} transition-transform duration-150 ease-[var(--ease-out)] active:scale-[0.99]`}
                  >
                    {body}
                  </button>
                ) : (
                  <div className={shell}>{body}</div>
                )}
              </li>
            </Fragment>
          );
        })}
      </ul>
    </div>
  );
}
