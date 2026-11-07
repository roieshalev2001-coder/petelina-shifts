"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { ScheduleTable, type CellAssignment } from "@/components/ScheduleTable";
import { Badge, Button, Num, inputClass } from "@/components/ui";
import { Dialog, useConfirm } from "@/components/Dialog";
import { ChangeHours } from "@/components/ChangeHours";
import { HoursText } from "@/components/HoursText";
import { DAY_NAMES } from "@/lib/domain";
import { showsEndTime } from "@/lib/week";
import { buildGrid, type GridSlot } from "@/lib/grid";
import type { EligibleEmployee, TraineeOption } from "./actions";
import { AddBlockForm } from "./AddBlockForm";

/** סדר הקבוצות בבורר — לפי כמה הן שימושיות למנהל ברגע ההחלטה */
const GROUPS = [
  { key: "full", title: "מתאימים למשמרת המלאה", hint: null },
  {
    key: "partial",
    title: "מכסים חלק מהמשמרת",
    hint: "האלגוריתם לא משבץ את אלה לבד — הבחירה שלך",
  },
  { key: "blocked", title: "לא זמינים", hint: null },
] as const;

/*
 * "לא סימנו" אינה קבוצה ברשימה אלא מסלול מילוט.
 *
 * ברוב ההחלטות היא רעש: המנהל מחפש את מי שיכול, לא את מי שלא הגיש. אבל
 * היא לא נמחקת — משבצת שאיש לא סימן תהיה בלתי ניתנת למילוי בלעדיה, וגם
 * סבב שישי משבץ במפורש מי שלא סימן. לכן היא מאחורי שורה אחת.
 */
const UNMARKED_HINT = "לא הגישו זמינות למשמרת הזו. אפשר לשבץ בכל זאת.";

/** 405 → "6.75" */
function hours(minutes: number): string {
  return String(Math.round((minutes / 60) * 100) / 100);
}

export function ScheduleEditor({
  weekId,
  weekStart,
  slots,
  assignments,
  days,
  readOnly,
  partialCounts,
  swapMarks,
  trainees,
  actions,
}: {
  weekId: string;
  weekStart: string;
  slots: GridSlot[];
  assignments: CellAssignment[];
  days: number[];
  readOnly: boolean;
  partialCounts?: Record<string, number>;
  swapMarks?: Record<string, "open" | "done">;
  /** slotId → שם המתלמד שצורף לבלוק */
  trainees?: Record<string, string>;
  actions: {
    eligible: (weekId: string, slotId: string) => Promise<EligibleEmployee[]>;
    traineeOptions: (weekId: string, slotId: string) => Promise<TraineeOption[]>;
    setTrainee: (
      weekId: string,
      slotId: string,
      employeeId: string | null,
    ) => Promise<{ error?: string }>;
    assign: (
      weekId: string,
      slotId: string,
      employeeId: string | null,
    ) => Promise<void>;
    togglePin: (weekId: string, slotId: string) => Promise<void>;
    approveShortened: (weekId: string, slotId: string) => Promise<void>;
    approveOverMax: (weekId: string, slotId: string) => Promise<void>;
    previewSwap: (
      weekId: string,
      a: string,
      b: string,
    ) => Promise<
      | { error: string }
      | { moving: { name: string; to: string }[]; warnings: string[]; swap: boolean }
    >;
    swap: (weekId: string, a: string, b: string) => Promise<{ error?: string }>;
    changeHours: (args: {
      weekId: string;
      slotId: string;
      startTime: string;
      endTime: string;
      scope: "week" | "always";
      timeDisplay?: string;
    }) => Promise<{ error?: string; templateUpdated?: boolean; otherWeeks?: number }>;
    changeRowHours: (args: {
      weekId: string;
      slotIds: string[];
      startTime: string;
      endTime: string;
      scope: "week" | "always";
      timeDisplay?: string;
    }) => Promise<{ error?: string; days?: number; templateUpdated?: number; otherWeeks?: number }>;
    addBlock: (args: {
      weekId: string;
      dayOfWeek: number;
      role: string;
      period: string;
      startTime: string;
      endTime: string;
    }) => Promise<{ error?: string }>;
    removeBlock: (weekId: string, slotId: string) => Promise<{ error?: string }>;
    setNote: (weekId: string, slotId: string, note: string) => Promise<{ error?: string }>;
  };
}) {
  const [picker, setPicker] = useState<{
    slot: GridSlot;
    options: EligibleEmployee[] | null;
    /** מתלמדים שאפשר לצרף לבלוק — נטען יחד עם המועמדים */
    trainees: TraineeOption[] | null;
  } | null>(null);
  const [pending, startTransition] = useTransition();
  const [ask, confirmDialog] = useConfirm();
  /*
   * מצב "החלפה עם…": המשבצת שממנה יוצאים, עד שהמנהל לוחץ על השנייה.
   * כל עוד הוא פעיל, לחיצה על תא לא פותחת בורר אלא בוחרת את הצד השני.
   */
  const [swapFrom, setSwapFrom] = useState<{ slot: GridSlot; name: string } | null>(null);
  const [swapError, setSwapError] = useState<string | null>(null);
  /** "שינוי שעות" פתוח בתוך הבורר */
  const [editingHours, setEditingHours] = useState(false);
  /** מה השתנה אחרי שינוי שעות — נאמר למנהל במפורש, במיוחד כשהתבנית לא נמצאה */
  const [hoursNote, setHoursNote] = useState<string | null>(null);
  /** "+ בלוק" פתוח ליום הזה */
  const [addFor, setAddFor] = useState<number | null>(null);
  /** טיוטת ההערה בבורר — מתאפסת לכל פתיחה */
  const [noteDraft, setNoteDraft] = useState("");
  /** "שינוי שעות" לשורה שלמה — לחיצה על השעות בעמודה הימנית */
  const [rowEdit, setRowEdit] = useState<{
    startTime: string;
    endTime: string;
    slots: GridSlot[];
  } | null>(null);

  useEffect(() => {
    if (!swapFrom) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setSwapFrom(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [swapFrom]);

  async function openPicker(slot: GridSlot) {
    setEditingHours(false);
    setNoteDraft(assignments.find((a) => a.slotId === slot.id)?.note ?? "");
    setPicker({ slot, options: null, trainees: null });
    const [options, traineeList] = await Promise.all([
      actions.eligible(weekId, slot.id),
      actions.traineeOptions(weekId, slot.id),
    ]);
    setPicker({ slot, options, trainees: traineeList });
  }

  async function pickSwapTarget(slot: GridSlot) {
    const from = swapFrom!;
    // לחיצה על אותה משמרת — חזרה בלי החלפה
    if (slot.id === from.slot.id) {
      setSwapFrom(null);
      return;
    }
    setSwapError(null);
    const preview = await actions.previewSwap(weekId, from.slot.id, slot.id);
    if ("error" in preview) {
      setSwapError(preview.error);
      return;
    }

    const [first, second] = preview.moving;
    const title = preview.swap
      ? `להחליף בין ${first.name} ל${second.name}?`
      : `להעביר את ${first.name} ל${first.to}?`;
    const lines = preview.moving.map((m) => `${m.name} ← ${m.to}`).join("\n");
    const body = preview.warnings.length > 0 ? `${lines}\n\n${preview.warnings.join("\n")}` : lines;
    const ok = await ask(`${title}\n\n${body}`, {
      confirmLabel: preview.swap ? "החלפה" : "העברה",
    });
    if (!ok) return;

    startTransition(async () => {
      const result = await actions.swap(weekId, from.slot.id, slot.id);
      if (result.error) setSwapError(result.error);
      setSwapFrom(null);
    });
  }

  const current = picker
    ? assignments.find((a) => a.slotId === picker.slot.id)
    : null;
  const currentTrainee = picker ? (trainees?.[picker.slot.id] ?? null) : null;

  /*
   * השעות של השורה שהבלוק יושב בה — "השעות הרגילות", תמיד בהגעה וסיום.
   * בלוק ששעותיו או התצוגה שלהן שונו (או שהשתנו בלי כוונה) מקבל כפתור
   * שמחזיר אותו אליהן בלחיצה, במקום להקליד אותן מחדש. לא בשישי: שם שעת
   * הגעה אישית היא הכלל, לא חריג.
   */
  const grid = useMemo(() => buildGrid(slots, days), [slots, days]);
  const rowOfPicked = picker
    ? grid.find((row) => row.cells.some((c) => c?.slots.some((s) => s.id === picker.slot.id)))
    : undefined;
  const rowHours =
    picker &&
    rowOfPicked &&
    showsEndTime(picker.slot.dayOfWeek) &&
    (rowOfPicked.startTime !== picker.slot.startTime ||
      rowOfPicked.endTime !== picker.slot.endTime ||
      (picker.slot.timeDisplay ?? "range") !== "range")
      ? {
          startTime: rowOfPicked.startTime,
          endTime: rowOfPicked.endTime,
          timeDisplay: "range",
        }
      : null;

  /*
   * שורת מועמד. הופרדה לפונקציה כדי שגם מסלול "לא סימנו" יציג בדיוק
   * את אותה שורה — אותם תגים, אותו אישור לפני שיבוץ עם הסתייגות.
   */
  const optionList = (slotId: string, rows: EligibleEmployee[]) => (
                <ul className="divide-y divide-line">
                  {rows.map((option) => (
                    <li key={option.id}>
                      <button
                        disabled={pending}
                        onClick={async () => {
                          // השאלה לפני ה-transition: בזמן שהחלון פתוח הרשימה לא נועלת
                          const caveat = option.reason ?? option.warning;
                          if (
                            caveat &&
                            !(await ask(`לשבץ את ${option.fullName} בכל זאת?\n\n${caveat}.`, {
                              confirmLabel: "שיבוץ",
                            }))
                          ) {
                            return;
                          }
                          startTransition(async () => {
                            await actions.assign(weekId, slotId, option.id);
                            setPicker(null);
                          });
                        }}
                        className="flex w-full items-center gap-2 px-1 py-2.5 text-right transition hover:bg-paper/70 disabled:opacity-50"
                      >
                        <span className="sr-only">
                          {option.marked === "preferred"
                            ? "סימן העדפה, "
                            : option.marked === "available"
                              ? "סימן זמינות, "
                              : ""}
                        </span>
                        <span aria-hidden className="w-5">
                          {option.marked === "preferred"
                            ? "★"
                            : option.marked === "available"
                              ? "✓"
                              : ""}
                        </span>
                        <span
                          className={
                            option.marked ? "font-medium" : "text-muted"
                          }
                        >
                          {option.fullName}
                        </span>
                        {!option.marked && <Badge>לא סימן</Badge>}
                        {option.seniority >= 4 && <Badge tone="blue">ותיק</Badge>}
                        {option.seniority <= 1 && <Badge>חדש</Badge>}
                        {option.group === "partial" && (
                          <span className="text-xs text-amber-800">
                            יכסה{" "}
                            <span className="num font-medium">
                              {option.coverStart}–{option.coverEnd}
                            </span>{" "}
                            ·{" "}
                            <Num>
                              {hours(option.coveredMinutes)} מתוך{" "}
                              {hours(option.slotMinutes)}
                            </Num>{" "}
                            שעות
                          </span>
                        )}
                        {option.reason && (
                          <Badge tone="amber">{option.reason}</Badge>
                        )}
                        {/* הוא אפשרות תקפה, אבל הפתיחה או הסגירה נפגעות */}
                        {option.warning && (
                          <Badge tone="amber">{option.warning}</Badge>
                        )}
                        <span className="mr-auto text-xs text-muted">
                          <Num>
                            {option.assignedCount}/{option.requiredShifts}
                          </Num>
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
  );

  return (
    <>
      {swapError && (
        <p role="alert" className="mb-2 border-s-4 border-red-600 bg-surface px-3 py-2 text-sm">
          {swapError}
        </p>
      )}
      {hoursNote && (
        <p role="status" className="mb-2 flex items-center gap-3 border-s-4 border-ink bg-surface px-3 py-2 text-sm">
          <span className="flex-1">{hoursNote}</span>
          <button type="button" onClick={() => setHoursNote(null)} className="text-xs text-muted underline">
            סגירה
          </button>
        </p>
      )}
      <ScheduleTable
        weekStart={weekStart}
        slots={slots}
        assignments={assignments}
        days={days}
        onPickCell={readOnly ? undefined : swapFrom ? pickSwapTarget : openPicker}
        onAddSlot={readOnly || swapFrom ? undefined : (day) => setAddFor(day)}
        onPickRow={
          readOnly || swapFrom
            ? undefined
            : (row, rowSlots) =>
                rowSlots.length > 0 &&
                setRowEdit({
                  startTime: row.startTime,
                  endTime: row.endTime,
                  slots: rowSlots,
                })
        }
        selectedSlotId={swapFrom?.slot.id ?? picker?.slot.id ?? null}
        partialCounts={partialCounts}
        swapMarks={swapMarks}
        trainees={trainees}
      />

      {swapFrom && (
        <>
          {/* מקום לפס, כדי שהשורות האחרונות בסידור לא יוסתרו מתחתיו */}
          <div aria-hidden className="h-28" />
          {/* `swap-bar` מסתיר את סרגל הלשוניות בטלפון בזמן הבחירה — ראה globals.css.
              `m-0`: העורך יושב בתוך `space-y-5`, שנותן לכל ילד שוליים תחתונים —
              ובאלמנט fixed הם הרימו את הפס 20px מהתחתית, והדף נראה מתחתיו */}
          <div
            role="status"
            className="swap-bar no-print fixed inset-x-0 bottom-0 z-40 m-0 bg-band pb-safe text-on-band"
          >
            <div className="mx-auto flex max-w-5xl items-center gap-3 px-4 py-3">
              <p className="min-w-0 flex-1 text-sm">
                <span className="font-semibold">החלפה עם {swapFrom.name}</span>
                <span className="text-on-band-muted">
                  {" · "}
                  {DAY_NAMES[swapFrom.slot.dayOfWeek]}{" "}
                  <span className="num">{swapFrom.slot.startTime}</span>
                </span>
                <span className="block text-xs text-on-band-muted">
                  לחצו על המשמרת שאיתה מחליפים. משמרת ריקה — העברה.
                </span>
              </p>
              <button
                type="button"
                disabled={pending}
                onClick={() => setSwapFrom(null)}
                className="min-h-11 shrink-0 border border-on-band/40 px-4 text-sm font-medium transition-[border-color,transform] duration-150 ease-[var(--ease-out)] hover:border-on-band/80 active:scale-[0.97]"
              >
                ביטול
              </button>
            </div>
          </div>
        </>
      )}

      {addFor !== null && (
        <Dialog label={`בלוק נוסף ל${DAY_NAMES[addFor]}`} onClose={() => setAddFor(null)} className="max-w-lg">
          <AddBlockForm
            day={addFor}
            slots={slots}
            onCancel={() => setAddFor(null)}
            onSubmit={async (args) => {
              const result = await actions.addBlock({ weekId, dayOfWeek: addFor, ...args });
              if (result.error) return result.error;
              setAddFor(null);
            }}
          />
        </Dialog>
      )}

      {rowEdit && (
        <Dialog
          label="שינוי שעות לשורה"
          onClose={() => setRowEdit(null)}
          className="max-w-lg"
        >
          <h3 className="font-bold">
            שינוי שעות ·{" "}
            <span className="num">
              {`\u2066${rowEdit.startTime}–${rowEdit.endTime === "CLOSING" ? "סגירה" : rowEdit.endTime}\u2069`}
            </span>
          </h3>
          <p className="mb-3 text-sm text-muted">
            יחול על: {rowEdit.slots.map((s) => DAY_NAMES[s.dayOfWeek]).join(", ")}
          </p>
          <ChangeHours
            start={rowEdit.startTime}
            end={rowEdit.endTime}
            startOnly={rowEdit.slots.every((s) => !showsEndTime(s.dayOfWeek))}
            // בלי "מה יופיע בסידור": השורה תמיד הגעה וסיום (רואי). הבחירה
            // נשארת רק בבלוק בודד, וכל בלוק שומר את שלו
            scopes={[
              { key: "week", label: "רק השבוע" },
              {
                key: "always",
                label: "שינוי תמידי",
                hint: "גם בתבנית הקבועה, וגם בשבועות שכבר נפתחו אחרי השבוע הזה ועוד לא פורסמו",
              },
            ]}
            onCancel={() => setRowEdit(null)}
            onSubmit={async (startTime, endTime, scope) => {
              const result = await actions.changeRowHours({
                weekId,
                slotIds: rowEdit.slots.map((s) => s.id),
                startTime,
                endTime,
                scope,
              });
              if (result.error) return result.error;
              const days = result.days === 1 ? "ביום אחד" : `ב-${result.days} ימים`;
              setHoursNote(
                scope === "week"
                  ? `השעות עודכנו ${days} השבוע.`
                  : `השעות עודכנו ${days} השבוע${
                      result.templateUpdated ? " ובתבנית הקבועה" : ""
                    }${result.otherWeeks ? `, וגם בשבועות שכבר נפתחו` : ""}.${
                      result.templateUpdated === result.days
                        ? ""
                        : " בחלק מהימים לא נמצא בלוק תואם בתבנית — כדאי לבדוק גם במסך התבנית."
                    }`,
              );
              setRowEdit(null);
            }}
          />
        </Dialog>
      )}

      {picker && (
        <Dialog
          label={`שיבוץ ל${DAY_NAMES[picker.slot.dayOfWeek]} ${picker.slot.startTime}`}
          onClose={() => setPicker(null)}
          className="max-h-[80vh] max-w-lg overflow-y-auto"
        >
          <div className="mb-3 flex items-start justify-between gap-3">
            <div>
              <h3 className="font-bold">
                {DAY_NAMES[picker.slot.dayOfWeek]}{" "}
                <span className="num">
                  {picker.slot.startTime}
                  {/* בשישי רק שעת ההגעה — ראה showsEndTime */}
                  {showsEndTime(picker.slot.dayOfWeek) &&
                    `–${picker.slot.endTime === "CLOSING" ? "סגירה" : picker.slot.endTime}`}
                </span>
              </h3>
              <p className="text-sm text-muted">
                {picker.slot.label ?? ""}
              </p>
              {!editingHours && (
                <div className="mt-2 flex flex-wrap gap-2">
                  <Button variant="secondary" size="sm" onClick={() => setEditingHours(true)}>
                    שינוי שעות
                  </Button>
                  {rowHours && (
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={pending}
                      onClick={() => {
                        const slotId = picker.slot.id;
                        startTransition(async () => {
                          const result = await actions.changeHours({
                            weekId,
                            slotId,
                            ...rowHours,
                            scope: "week",
                          });
                          if (result.error) setSwapError(result.error);
                          else setHoursNote("הבלוק חזר לשעות הרגילות של השורה.");
                          setPicker(null);
                        });
                      }}
                    >
                      חזרה לשעות הרגילות (
                      <HoursText
                        start={rowHours.startTime}
                        end={rowHours.endTime}
                        display={rowHours.timeDisplay}
                      />
                      )
                    </Button>
                  )}
                  {/* רק בלוק שנוסף לשבוע הזה. בלוק מהתבנית — רק "פינוי" */}
                  {picker.slot.extra && (
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={pending}
                    onClick={async () => {
                      const slot = picker.slot;
                      const message = current
                        ? `להסיר את הבלוק?\n\n${current.employeeName} משובץ כאן ויוסר מהסידור של השבוע הזה. התבנית הקבועה לא משתנה.`
                        : "להסיר את הבלוק?\n\nהבלוק יוסר רק מהשבוע הזה. התבנית הקבועה לא משתנה.";
                      if (!(await ask(message, { confirmLabel: "הסרה", danger: true }))) return;
                      startTransition(async () => {
                        const result = await actions.removeBlock(weekId, slot.id);
                        if (result.error) setSwapError(result.error);
                        setPicker(null);
                      });
                    }}
                  >
                    הסרת הבלוק
                  </Button>
                  )}
                </div>
              )}
            </div>
            <Button
              variant="ghost"
              size="sm"
              aria-label="סגירה"
              onClick={() => setPicker(null)}
            >
              ✕
            </Button>
          </div>

          {editingHours && (
            <ChangeHours
              start={picker.slot.startTime}
              end={picker.slot.endTime}
              startOnly={!showsEndTime(picker.slot.dayOfWeek)}
              display={
                showsEndTime(picker.slot.dayOfWeek) ? (picker.slot.timeDisplay ?? "range") : undefined
              }
              scopes={[
                { key: "week", label: "רק השבוע" },
                {
                  key: "always",
                  label: "שינוי תמידי",
                  hint: "גם בתבנית הקבועה, וגם בשבועות שכבר נפתחו אחרי השבוע הזה ועוד לא פורסמו",
                },
              ]}
              onCancel={() => setEditingHours(false)}
              onSubmit={async (startTime, endTime, scope, timeDisplay) => {
                const result = await actions.changeHours({
                  weekId,
                  slotId: picker.slot.id,
                  startTime,
                  endTime,
                  scope,
                  timeDisplay,
                });
                if (result.error) return result.error;
                setHoursNote(
                  scope === "week"
                    ? "השעות עודכנו בשבוע הזה."
                    : result.templateUpdated
                      ? `השעות עודכנו בשבוע הזה ובתבנית הקבועה${
                          result.otherWeeks === 1
                            ? ", וגם בשבוע אחד שכבר נפתח"
                            : result.otherWeeks
                              ? `, וגם ב-${result.otherWeeks} שבועות שכבר נפתחו`
                              : ""
                        }.`
                      : "השעות עודכנו בשבוע הזה. בתבנית לא נמצא בלוק תואם (היא השתנתה מאז שהשבוע נפתח), ולכן כדאי לעדכן אותה גם במסך התבנית.",
                );
                setEditingHours(false);
                setPicker(null);
              }}
            />
          )}

          {current && (
            <div className="mb-3 flex flex-wrap items-center gap-2 bg-paper p-3">
              <span className="font-medium">{current.employeeName}</span>
              {current.pinned && <Badge tone="blue">נעוץ</Badge>}
              {current.shortened && !current.shortenedApproved && (
                <Badge tone="amber">
                  מקוצר עד <span className="num">{current.actualEnd}</span>
                </Badge>
              )}
              {current.overMax && !current.overMaxApproved && (
                <Badge tone="red">
                  {/* מחרוזת אחת, בלי num — ראה ההערה בהודעת החריגה ב-page.tsx */}
                  {`מעל המקסימום · ${current.shiftCount} מתוך ${current.maxShifts}`}
                </Badge>
              )}
              <div className="mr-auto flex gap-1">
                {current.shortened && !current.shortenedApproved && (
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() =>
                      startTransition(async () => {
                        await actions.approveShortened(weekId, picker.slot.id);
                        setPicker(null);
                      })
                    }
                  >
                    אישור הקיצור
                  </Button>
                )}
                {current.overMax && !current.overMaxApproved && (
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() =>
                      startTransition(async () => {
                        await actions.approveOverMax(weekId, picker.slot.id);
                        setPicker(null);
                      })
                    }
                  >
                    אישור החריגה
                  </Button>
                )}
                {/* אחד תמורת אחד: הבורר נסגר, והלחיצה הבאה על תא היא הצד השני */}
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    setSwapError(null);
                    setSwapFrom({ slot: picker.slot, name: current.employeeName });
                    setPicker(null);
                  }}
                >
                  החלפה עם…
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() =>
                    startTransition(async () => {
                      await actions.togglePin(weekId, picker.slot.id);
                      setPicker(null);
                    })
                  }
                >
                  {current.pinned ? "ביטול נעיצה" : "נעיצה"}
                </Button>
                <Button
                  variant="danger"
                  size="sm"
                  onClick={() =>
                    startTransition(async () => {
                      await actions.assign(weekId, picker.slot.id, null);
                      setPicker(null);
                    })
                  }
                >
                  פינוי
                </Button>
              </div>
            </div>
          )}

          {/* הערה לעובד בבלוק הזה, לשבוע הזה — מופיעה מתחת לשם בסידור,
              בתמונה ובמסך שלו. שמירה נועצת את השיבוץ (ראה setAssignmentNote) */}
          {current && (
            <form
              className="mb-3 flex items-end gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                const slotId = picker.slot.id;
                startTransition(async () => {
                  const result = await actions.setNote(weekId, slotId, noteDraft);
                  if (result.error) setSwapError(result.error);
                  setPicker(null);
                });
              }}
            >
              <label className="block flex-1">
                <span className="mb-1 block text-xs font-bold">הערה ל{current.employeeName}</span>
                <input
                  value={noteDraft}
                  onChange={(e) => setNoteDraft(e.target.value)}
                  maxLength={40}
                  placeholder="טקסט חופשי"
                  className={inputClass}
                />
              </label>
              <Button
                type="submit"
                variant="secondary"
                disabled={pending || noteDraft.trim() === (current.note ?? "")}
              >
                {noteDraft.trim() === "" && current.note ? "מחיקה" : "שמירה"}
              </Button>
            </form>
          )}

          {/* מתלמד: מצטרף לבלוק של העובד הרגיל ולא ממלא אותו. מופיע רק
              כשיש מתלמדים בתפקיד הזה, או כשכבר צורף אחד */}
          {(currentTrainee || (picker.trainees?.length ?? 0) > 0) && (
            <div className="mb-3 border border-line p-3">
              <h4 className="text-sm font-semibold">מתלמד</h4>
              {currentTrainee && (
                <div className="mt-1 flex flex-wrap items-center gap-2">
                  <span className="font-medium">{currentTrainee}</span>
                  <span className="text-xs text-muted">
                    {current ? `מצטרף ל${current.employeeName}` : "מצטרף לבלוק"}
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="mr-auto"
                    disabled={pending}
                    onClick={() => {
                      const slotId = picker.slot.id;
                      startTransition(async () => {
                        const result = await actions.setTrainee(weekId, slotId, null);
                        if (result.error) setSwapError(result.error);
                        setPicker(null);
                      });
                    }}
                  >
                    הסרת המתלמד
                  </Button>
                </div>
              )}
              {picker.trainees && picker.trainees.length > 0 && (
                <details className="mt-1">
                  <summary className="cursor-pointer py-1 text-sm font-medium">
                    {currentTrainee ? "החלפת המתלמד" : "+ הוספת מתלמד"} ({picker.trainees.length})
                  </summary>
                  <ul className="divide-y divide-line">
                    {picker.trainees.map((option) => (
                      <li key={option.id}>
                        <button
                          disabled={pending}
                          onClick={async () => {
                            if (
                              option.busy &&
                              !(await ask(`לצרף את ${option.fullName} בכל זאת?\n\n${option.busy}.`, {
                                confirmLabel: "צירוף",
                              }))
                            ) {
                              return;
                            }
                            const slotId = picker.slot.id;
                            startTransition(async () => {
                              const result = await actions.setTrainee(weekId, slotId, option.id);
                              if (result.error) setSwapError(result.error);
                              setPicker(null);
                            });
                          }}
                          className="flex w-full items-center gap-2 px-1 py-2.5 text-right transition hover:bg-paper/70 disabled:opacity-50"
                        >
                          <span className="sr-only">
                            {option.marked === "preferred"
                              ? "סימן העדפה, "
                              : option.marked === "available"
                                ? "סימן זמינות, "
                                : ""}
                          </span>
                          <span aria-hidden className="w-5">
                            {option.marked === "preferred" ? "★" : option.marked === "available" ? "✓" : ""}
                          </span>
                          <span className={option.marked ? "font-medium" : "text-muted"}>
                            {option.fullName}
                          </span>
                          {!option.marked && <Badge>לא סימן</Badge>}
                          {option.busy && <Badge tone="amber">{option.busy}</Badge>}
                        </button>
                      </li>
                    ))}
                  </ul>
                </details>
              )}
            </div>
          )}

          {picker.options === null ? (
            <p className="p-4 text-center text-sm text-muted">טוען מועמדים…</p>
          ) : (
            <>
              {GROUPS.map(({ key, title, hint }) => {
                const rows = picker.options!.filter((o) => o.group === key);
                if (rows.length === 0) return null;

                const body = optionList(picker.slot.id, rows);

                if (key === "blocked") {
                  return (
                    <details key={key} className="mt-3 border-t border-line pt-2">
                      <summary className="cursor-pointer text-sm font-semibold text-muted">
                        {title} ({rows.length})
                      </summary>
                      {body}
                    </details>
                  );
                }

                return (
                  <div key={key} className="mt-3">
                    <h4 className="text-sm font-semibold">{title}</h4>
                    {hint && <p className="mb-1 text-xs text-muted">{hint}</p>}
                    {body}
                  </div>
                );
              })}

              {(() => {
                const unmarked = picker.options!.filter(
                  (o) => o.group === "unmarked",
                );
                if (unmarked.length === 0) return null;
                return (
                  <details className="mt-3 border-t border-line pt-2">
                    <summary className="cursor-pointer text-sm text-muted">
                      הצג גם מי שלא סימן ({unmarked.length})
                    </summary>
                    <p className="mt-1 text-xs text-muted">{UNMARKED_HINT}</p>
                    {optionList(picker.slot.id, unmarked)}
                  </details>
                );
              })()}
            </>
          )}
        </Dialog>
      )}
      {/* אחרון ב-DOM בכוונה: חלון האישור נפתח גם מתוך הבורר ("להסיר את
          הבלוק?", "לשבץ בכל זאת?"), ושני החלונות באותה שכבה — מה שמאוחר
          יותר בדף מצויר מעל. כשהוא היה ראשון, האישור הסתתר מאחורי הבורר. */}
      {confirmDialog}
    </>
  );
}
