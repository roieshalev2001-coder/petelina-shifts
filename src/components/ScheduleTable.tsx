"use client";

import type { ReactNode } from "react";
import { DAY_NAMES, ROLE_LABEL, ROLE_LABEL_PLURAL, type Role } from "@/lib/domain";
import { PinIcon } from "@/components/ui";
import { ScheduleDays } from "./ScheduleDays";
import { buildGrid, showsStartTime, type GridRow, type GridSlot } from "@/lib/grid";
import { addDays, formatDayMonth } from "@/lib/time";
import { showsEndTime } from "@/lib/week";
import { HoursText } from "./HoursText";
import { TraineeLine } from "./TraineeLine";

export type CellAssignment = {
  slotId: string;
  employeeId: string;
  employeeName: string;
  actualStart: string;
  actualEnd: string;
  shortened: boolean;
  shortenedApproved: boolean;
  pinned: boolean;
  manualOverride: boolean;
  /** מעבר למקסימום המשמרות של העובד — מסומן עד שהמנהל מאשר */
  overMax?: boolean;
  overMaxApproved?: boolean;
  /** סך המשמרות של העובד השבוע והמקסימום שלו — לתווית "5 מתוך 3" */
  shiftCount?: number;
  maxShifts?: number;
  /** הערה של המנהל לעובד בבלוק הזה ("פותח קופה") — מתחת לשם */
  note?: string | null;
};

/**
 * הסידור בפריסת הגיליון — עמודה ליום, שורה למשבצת, והשעות בעמודה הימנית.
 *
 * השורות צבועות לפי תפקיד בצבעי הגיליון (ורוד/ירוק/כתום), כי כך הצוות
 * מכיר את הסידור — ראה `.schedule-table` ב-globals.css. שם התפקיד כתוב
 * בראש כל קבוצה, כי צבע לבדו אינו מספיק.
 *
 * תא יכול להחזיק יותר ממשבצת אחת: בשישי שני האחמ"שים כתובים יחד, כמו
 * בגיליון. כל שם הוא כפתור משלו — ראה buildGrid.
 *
 * **בטלפון זה לא מוצג.** שש עמודות ברוחב מינימלי של 60rem הן גלילה
 * אופקית ארוכה בלי עמודה נעוצה, ולכן מתחת ל-`md` מוצג `ScheduleDays` —
 * יום אחד ברשימה אנכית, מאותם נתונים בדיוק. הגיליון עצמו לא השתנה.
 */
export function ScheduleTable({
  weekStart,
  slots,
  assignments,
  days,
  onPickCell,
  onPickRow,
  onAddSlot,
  selectedSlotId,
  partialCounts,
  swapMarks,
  trainees,
  layout = "responsive",
}: {
  weekStart: string;
  slots: GridSlot[];
  assignments: CellAssignment[];
  days: number[];
  /** כשמסופק — התאים לחיצים והטבלה במצב עריכה */
  onPickCell?: (slot: GridSlot) => void;
  /**
   * כשמסופק — השעות של השורה (העמודה הימנית) לחיצות: "שינוי שעות" לכל
   * הימים בשורה שיש להם בדיוק את השעות האלה.
   */
  onPickRow?: (row: GridRow, slots: GridSlot[]) => void;
  /** כשמסופק — "+ בלוק" מתחת לכל תאריך: משבצת נוספת לשבוע הזה בלבד */
  onAddSlot?: (day: number) => void;
  selectedSlotId?: string | null;
  /** slotId → כמה אפשרויות כיסוי חלקי יש לתא הריק הזה */
  partialCounts?: Record<string, number>;
  /**
   * slotId → מצב המסירה. אופציונלי, וכשהוא חסר הטבלה זהה לחלוטין —
   * כך מסך הייצוא וההדפסה לא משתנה.
   */
  swapMarks?: Record<string, "open" | "done">;
  /** slotId → שם המתלמד שצורף לבלוק — מתחת לשם העובד */
  trainees?: Record<string, string>;
  /**
   * `sheet` — הגיליון בלבד ותמיד גלוי, גם במסך צר: בשביל התמונה של כל
   * הסידור, שחייבת להיות הטבלה המלאה גם כשהיא נוצרת מהטלפון.
   */
  layout?: "responsive" | "sheet";
}) {
  const start = new Date(weekStart);
  const rows = buildGrid(slots, days);
  const bySlot = new Map(assignments.map((a) => [a.slotId, a]));

  /** מה שכתוב על משבצת אחת בתוך תא */
  const slotContent = (row: GridRow, slot: GridSlot) => {
    const a = bySlot.get(slot.id);
    const overMax = Boolean(a?.overMax && !a.overMaxApproved);
    const options = partialCounts?.[slot.id] ?? 0;
    const swap = swapMarks?.[slot.id];
    // תא שנכנס לשורה בשעת התחלה אחרת מציג אותה בעצמו, כמו שעות העלייה
    // האישיות של המלצרים בעמודת שישי בגיליון — ראה showsStartTime
    const differs = slot.startTime !== row.startTime && showsStartTime(slot);
    /*
     * ביום חול תא ששעותיו שונות מהשורה, או שנבחר לו "רק הגעה" / "רק סיום"
     * (השורה עצמה תמיד טווח), כותב את שלו בתצוגה של הבלוק. בשישי — רק
     * שעת הגעה שונה.
     */
    const display = slot.timeDisplay ?? "range";
    const ownTime = showsEndTime(slot.dayOfWeek) ? (
      slot.startTime !== row.startTime ||
      slot.endTime !== row.endTime ||
      display !== "range" ? (
        <HoursText start={slot.startTime} end={slot.endTime} display={display} />
      ) : null
    ) : differs ? (
      <span className="num">{slot.startTime}</span>
    ) : null;

    return (
      <>
        {a ? (
          <span className="font-medium">
            {a.employeeName}
            {swap === "done" && (
              <>
                <span aria-hidden title="המשמרת הוחלפה" className="mr-1 text-xs text-ink/75">
                  ⇄
                </span>
                <span className="sr-only">, המשמרת הוחלפה</span>
              </>
            )}
          </span>
        ) : options > 0 ? (
          // תא ריק שיש לו אפשרויות — מזמין את המנהל ללחוץ
          <span className="text-xs font-medium text-amber-900">
            {options === 1 ? "אפשרות אחת" : `${options} אפשרויות`}
          </span>
        ) : (
          <span className="inline-flex items-center gap-1.5 text-xs font-medium text-amber-900">
            <span className="cell-flag size-1.5 rounded-full bg-amber-500" />
            ריק
          </span>
        )}
        {/* בלי `.num` על העטיפה: "עד 15:00" חייב לזרום מימין לשמאל, והשעה
            עצמה כבר מבודדת בתוך HoursText */}
        {ownTime && <span className="mr-1 text-xs text-ink/75">{ownTime}</span>}
        {a?.note && <span className="block text-xs text-ink/80">{a.note}</span>}
        {trainees?.[slot.id] && <TraineeLine name={trainees[slot.id]} className="text-ink/80" />}
        {/*
          * האילוץ לא נכתב ליד השם (החלטה של רואי) — בסידור רואים רק מי עובד.
          * קיצור שטרם אושר נשאר צהוב (cell-flag), והשעה עצמה מופיעה בבורר
          * כשלוחצים על התא.
          */}
        {a?.shortened && !a.shortenedApproved && (
          <span className="sr-only">, מקוצר, ממתין לאישור</span>
        )}
        {/* חריגה ממקסימום — טקסט ולא רק צבע, כמו שאר הסימונים */}
        {overMax && (
          // צבע הדיו ולא אדום: הרקע הוא שנושא את האדום, וטקסט
          // אדום-כהה עליו נמדד 3.47:1 — מתחת לסף
          <span className="block text-xs font-semibold">
            מעל המקסימום{" "}
            <span className="num">
              {a!.shiftCount}/{a!.maxShifts}
            </span>
            <span aria-hidden> ⚑</span>
            <span className="sr-only">, ממתין לאישור</span>
          </span>
        )}
        {a?.pinned && <PinIcon className="mr-1 text-ink/75" />}
      </>
    );
  };

  return (
    <>
      {layout === "responsive" && (
        <ScheduleDays
          weekStart={weekStart}
          slots={slots}
          assignments={assignments}
          days={days}
          onPickCell={onPickCell}
          onAddSlot={onAddSlot}
          selectedSlotId={selectedSlotId}
          partialCounts={partialCounts}
          swapMarks={swapMarks}
          trainees={trainees}
        />
      )}

      <div
        className={`schedule-table overflow-x-auto border border-line bg-surface ${
          layout === "sheet" ? "block" : "hidden md:block"
        }`}
      >
      <table className="w-full min-w-[60rem] border-collapse text-sm">
        <thead>
          <tr>
            {/* עמודת השעות ראשונה ב-DOM — ב-RTL זה הצד הימני, כמו בגיליון */}
            <th className="w-48">
              <span className="sr-only">משמרת</span>
            </th>
            {days.map((day) => {
              const date = addDays(start, day);
              return (
                <th
                  key={day}
                  className="px-2 py-2.5 align-bottom"
                >
                  <span className="block font-bold">{DAY_NAMES[day]}</span>
                  <span className="num block text-xs font-normal text-ink/75">
                    {formatDayMonth(date)}
                  </span>
                  {onAddSlot && (
                    <button
                      type="button"
                      onClick={() => onAddSlot(day)}
                      aria-label={`הוספת בלוק ל${DAY_NAMES[day]}`}
                      className="mt-1.5 border border-ink/40 bg-surface px-2 py-0.5 text-xs font-semibold text-ink transition hover:bg-brand/[0.07] active:scale-[0.97]"
                    >
                      + בלוק
                    </button>
                  )}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, r) => (
            <tr
              key={row.key}
              /* הצבע לפי תפקיד מוגדר ב-globals.css תחת .schedule-table */
              data-role={row.role}
              className={row.isGroupStart ? "border-t-2 border-t-stone-400" : ""}
            >
              <th scope="row" className="px-3 py-1.5 font-medium">
                {/* הרקע של השורה נושא את התפקיד, כמו בגיליון — אבל צבע לבדו
                    לא מספיק למי שלא מבחין בו. לכן שם התפקיד בראש כל קבוצה,
                    ובשאר השורות רק לקורא מסך */}
                {r === 0 || rows[r - 1].role !== row.role ? (
                  <span className="block text-xs font-bold">
                    {ROLE_LABEL_PLURAL[row.role as Role]}
                  </span>
                ) : (
                  <span className="sr-only">{ROLE_LABEL[row.role as Role]}, </span>
                )}
                <span className="flex items-center gap-2">
                  <RowHours
                    onClick={
                      onPickRow
                        ? () =>
                            onPickRow(
                              row,
                              row.cells.flatMap((c) =>
                                (c?.slots ?? []).filter(
                                  (s) => s.startTime === row.startTime && s.endTime === row.endTime,
                                ),
                              ),
                            )
                        : undefined
                    }
                  >
                    {row.prefix && <span className="ml-1">{row.prefix}</span>}
                    {/* תמיד טווח — "רק הגעה" / "רק סיום" הם של בלוק, לא של
                        שורה (רואי). "07:15 - 15:00" מבודד כ-LTR, אבל "עד
                        סגירה - 16:30" חייב לזרום RTL כדי להיקרא כמו בגיליון */}
                    {row.isClosing ? (
                      <>
                        עד סגירה - <span className="num">{row.startTime}</span>
                      </>
                    ) : (
                      <span className="num">
                        {/* LRI/PDI בתוך הטקסט, ולא רק ה-CSS של num: התמונה של
                            הסידור (modern-screenshot) מאבדת את הבידוד, ובלעדיו
                            "07:00 - 16:00" יוצא "16:00 - 07:00" */}
                        {`\u2066${row.startTime} - ${row.endTime}\u2069`}
                      </span>
                    )}
                  </RowHours>
                </span>
              </th>
              {row.cells.map((cell, i) => {
                if (!cell) {
                  // היום הזה פשוט לא כולל את המשבצת — לא חור באיוש
                  return <td key={days[i]} />;
                }

                const marks = cell.slots.map((slot) => {
                  const a = bySlot.get(slot.id);
                  return {
                    slot,
                    overMax: Boolean(a?.overMax && !a.overMaxApproved),
                    flagged: Boolean(
                      (a?.shortened && !a.shortenedApproved) || swapMarks?.[slot.id] === "open",
                    ),
                    selected: selectedSlotId === slot.id,
                  };
                });
                const stacked = cell.slots.length > 1;

                const cellClass = [
                  "p-1.5 align-middle",
                  // הצעה שטרם נתפסה היא משמרת שמישהו כבר אמר שלא יגיע אליה —
                  // אותו ענבר של "דורש תשומת לב" שכבר בשימוש בטבלה
                  // חריגה גוברת על הענבר: היא היחידה שחוסמת פרסום שקט
                  marks.some((m) => m.overMax)
                    ? "cell-over-max"
                    : marks.some((m) => m.flagged)
                      ? "cell-flag"
                      : "",
                  // בתא משותף המסגרת יושבת על השם שנבחר, לא על התא כולו
                  !stacked && marks[0].selected
                    ? "outline outline-2 -outline-offset-2 outline-brand"
                    : "",
                ]
                  .filter(Boolean)
                  .join(" ");

                return (
                  // התפקיד של התא ולא של השורה: מלצר בשורת אחראי הערב
                  // בשישי נצבע כמלצר — ראה buildGrid
                  <td key={days[i]} data-role={cell.role} className={cellClass}>
                    <div className={stacked ? "divide-y divide-ink/15" : undefined}>
                      {marks.map(({ slot, selected }) => {
                        const ring =
                          stacked && selected
                            ? "outline outline-2 -outline-offset-2 outline-brand"
                            : "";
                        return onPickCell ? (
                          <button
                            key={slot.id}
                            onClick={() => onPickCell(slot)}
                            className={`block min-h-9 w-full cursor-pointer px-1 py-1 transition hover:bg-brand/[0.07] ${ring}`}
                          >
                            {slotContent(row, slot)}
                          </button>
                        ) : (
                          <div key={slot.id} className={stacked ? "py-0.5" : undefined}>
                            {slotContent(row, slot)}
                          </div>
                        );
                      })}
                    </div>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
        </table>
      </div>
    </>
  );
}

/** השעות של השורה: טקסט רגיל, או כפתור "שינוי שעות" במצב עריכה */
function RowHours({ onClick, children }: { onClick?: () => void; children: ReactNode }) {
  if (!onClick) return <span>{children}</span>;
  return (
    <button
      type="button"
      onClick={onClick}
      title="שינוי שעות לשורה"
      // אותו מראה כמו תא של עובד — כך רואים שגם השעות לחיצות (רואי)
      className="-mx-2 block w-[calc(100%+1rem)] cursor-pointer px-2 py-1 text-right transition hover:bg-brand/[0.07]"
    >
      {children}
    </button>
  );
}

