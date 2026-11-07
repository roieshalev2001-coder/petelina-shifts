"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Badge, Button, LinkButton, Num, inputClass } from "@/components/ui";
import { useConfirm } from "@/components/Dialog";
import {
  applyTemplate,
  type AvailabilityTemplateData,
  type TemplateMark,
} from "@/lib/availability-template";
import { DAY_NAMES, DAY_SHORT, PERIOD_LABEL, ROLE_LABEL } from "@/lib/domain";
import { addDays, fitSlot, formatDayMonth, toHHMM } from "@/lib/time";
import type { ExistingMark, FormSlot } from "@/lib/submissions";

type MarkState = "unavailable" | "available" | "preferred";
type Window = { earliestStart: string; latestEnd: string };

const EMPTY_WINDOW: Window = { earliestStart: "", latestEnd: "" };

const NEXT_STATE: Record<MarkState, MarkState> = {
  unavailable: "available",
  available: "preferred",
  preferred: "unavailable",
};

/**
 * סימן הבחירה. אדום מלא = בחרת, וזו המשמעות היחידה שלו במסך הזה.
 * "לא נבחר" הוא ריבוע ריק ולא ✕ — סימן ה-✕ קרא כשגיאה, בזמן שהמצב
 * הזה הוא פשוט "עדיין לא".
 *
 * שני הסימנים — ✓ ו-★ — תמיד בעמוד, והמצב רק מחליף ביניהם (ראה `.mark`
 * ב-globals.css): הווי "נמתח" לתוכו והכוכב צץ. מעברים ולא אנימציות
 * חד-פעמיות, כי מסמנים מהר ושוב ושוב — מעבר שנקטע ממשיך מהמקום שבו
 * הוא נמצא, אנימציה הייתה מתחילה מאפס בכל לחיצה.
 */
function StateMark({
  state,
  blocked = false,
  small = false,
}: {
  state: MarkState;
  blocked?: boolean;
  small?: boolean;
}) {
  const size = small ? "size-5" : "size-7";

  if (blocked) {
    return (
      <span
        aria-hidden
        className={`inline-flex shrink-0 items-center justify-center border border-dashed border-ink/30 text-sm leading-none text-muted ${size}`}
      >
        –
      </span>
    );
  }
  return (
    <span aria-hidden data-state={state} className={`mark ${size}`}>
      <svg viewBox="0 0 16 16" className="mark-check">
        <path d="M3.2 8.6l3.1 3.1L12.9 5" pathLength={1} />
      </svg>
      <svg viewBox="0 0 16 16" className="mark-star">
        <path d="M8 1.6l1.9 4.1 4.5.5-3.4 3 1 4.4L8 11.4l-4 2.2 1-4.4-3.4-3 4.5-.5Z" />
      </svg>
    </span>
  );
}

/** 225 → "3.75 שעות" · 60 → "שעה" · 120 → "שעתיים" */
function hoursLabel(minutes: number): string {
  const rounded = Math.round((minutes / 60) * 4) / 4;
  if (rounded === 1) return "שעה";
  if (rounded === 2) return "שעתיים";
  return `${rounded} שעות`;
}

/** ההסבר שהעובד רואה על משבצת שנפסלה — ספציפי, לא "לא מתאים" גנרי */
const REJECT_LABEL: Record<string, (slot: FormSlot) => string> = {
  "too-short": () => "נשארות פחות מ-4 שעות",
  "no-overlap": () => "לא חופף לשעות שלך",
};

function hasWindow(w: Window | undefined): w is Window {
  return Boolean(w && (w.earliestStart || w.latestEnd));
}

export function SubmitForm({
  weekStart,
  slots,
  existing,
  existingNote,
  alreadySubmitted,
  deadline,
  usualWeek,
  save,
  saveUsualWeek,
  preview,
}: {
  weekStart: string;
  slots: FormSlot[];
  existing: ExistingMark[];
  existingNote: string | null;
  alreadySubmitted: boolean;
  deadline: string;
  /** "השבוע הרגיל שלי" ששמר, אם שמר — ראה src/lib/availability-template.ts */
  usualWeek: { data: AvailabilityTemplateData; savedAt: string } | null;
  save: (payload: {
    marks: {
      slotId: string;
      state: "available" | "preferred";
      earliestStart: string | null;
      latestEnd: string | null;
    }[];
    note: string | null;
  }) => Promise<{ ok: boolean; error?: string }>;
  saveUsualWeek: (payload: {
    marks: { slotId: string; state: "available" | "preferred" }[];
    windows: { dayOfWeek: number; earliestStart: string; latestEnd: string }[];
  }) => Promise<{ ok: boolean; error?: string; savedAt?: string }>;
  /**
   * תצוגה מקדימה למנהל (src/app/manager/weeks/[weekId]/preview): אותו טופס
   * בדיוק, עם הסימונים של העובד, אבל בלי שליחה ובלי שמירת "שבוע רגיל" —
   * אפשר ללחוץ ולראות איך הוא מגיב, ושום דבר לא נשמר.
   */
  preview?: { name: string; backHref: string };
}) {
  const weekStartDate = useMemo(() => new Date(weekStart), [weekStart]);
  const slotById = useMemo(() => new Map(slots.map((s) => [s.id, s])), [slots]);

  const [marks, setMarks] = useState<Record<string, MarkState>>(() => {
    const initial: Record<string, MarkState> = {};
    for (const m of existing) initial[m.slotId] = m.state;
    return initial;
  });

  // החלון הוא לכל יום, לא לכל משבצת — ככה עובד חושב על הזמינות שלו
  const [windows, setWindows] = useState<Record<number, Window>>(() => {
    const initial: Record<number, Window> = {};
    for (const m of existing) {
      if (!m.earliestStart && !m.latestEnd) continue;
      const slot = slots.find((s) => s.id === m.slotId);
      if (!slot) continue;
      initial[slot.dayOfWeek] = {
        earliestStart: m.earliestStart ?? "",
        latestEnd: m.latestEnd ?? "",
      };
    }
    return initial;
  });

  const [note, setNote] = useState(existingNote ?? "");
  const [status, setStatus] = useState<
    | { kind: "idle" }
    | { kind: "saving" }
    | { kind: "saved" }
    | { kind: "error"; message: string }
  >({ kind: "idle" });
  /*
   * מה שעל המסך זהה למה שנשמר — אחרי שליחה, או כשנכנסים להגשה קיימת
   * רק להסתכל. רק אז מוצג "חזרה לבית": שינוי שלא נשלח מעלים אותו, כדי
   * שאף אחד לא ייצא בטעות בלי לשמור.
   */
  const [clean, setClean] = useState(alreadySubmitted);

  const days = useMemo(() => {
    const map = new Map<number, FormSlot[]>();
    for (const s of slots) {
      if (!map.has(s.dayOfWeek)) map.set(s.dayOfWeek, []);
      map.get(s.dayOfWeek)!.push(s);
    }
    return [...map.entries()].sort((a, b) => a[0] - b[0]);
  }, [slots]);

  const fitFor = (slot: FormSlot, win: Window | undefined) =>
    hasWindow(win)
      ? fitSlot(
          { start: slot.start, end: slot.end },
          {
            earliestStart: win.earliestStart || null,
            latestEnd: win.latestEnd || null,
          },
          { fixedStart: slot.fixedStart, fixedEnd: slot.fixedEnd },
        )
      : null;

  /** הסימונים שבאמת יישלחו — משבצת שנחסמה ע"י החלון יורדת מהרשימה. */
  const effectiveMarks = useMemo(() => {
    const out: {
      slotId: string;
      state: "available" | "preferred";
      earliestStart: string | null;
      latestEnd: string | null;
    }[] = [];

    for (const [slotId, state] of Object.entries(marks)) {
      if (state === "unavailable") continue;
      const slot = slotById.get(slotId);
      if (!slot) continue;

      const win = windows[slot.dayOfWeek];
      if (hasWindow(win) && fitFor(slot, win)?.kind === "none") continue;

      out.push({
        slotId,
        state,
        earliestStart: (hasWindow(win) && win.earliestStart) || null,
        latestEnd: (hasWindow(win) && win.latestEnd) || null,
      });
    }
    return out;
  }, [marks, windows, slotById]);

  const effectiveIds = useMemo(
    () => new Set(effectiveMarks.map((m) => m.slotId)),
    [effectiveMarks],
  );

  /** כל שינוי אחרי שמירה מחזיר את הכפתור ל"עדכון" — אחרת "נשלח ✓" משקר */
  function touched() {
    setClean(false);
    setStatus((prev) => (prev.kind === "saved" ? { kind: "idle" } : prev));
  }

  function cycle(slotId: string) {
    touched();
    setMarks((prev) => ({
      ...prev,
      [slotId]: NEXT_STATE[prev[slotId] ?? "unavailable"],
    }));
  }

  function setGroup(group: FormSlot[], state: MarkState) {
    touched();
    setMarks((prev) => {
      const next = { ...prev };
      for (const s of group) next[s.id] = state;
      return next;
    });
  }

  /**
   * שינוי השעות מסמן מחדש את היום: כל משבצת שנכנסת בחלון מסומנת,
   * וכל אחת שלא — יורדת. סימון ★ שהעובד כבר עשה נשמר.
   * זה הלב של "שעות קודם" — העובד אומר מתי הוא פנוי, לא איזו משבצת.
   */
  function updateWindow(day: number, daySlots: FormSlot[], patch: Partial<Window>) {
    touched();
    const next: Window = { ...(windows[day] ?? EMPTY_WINDOW), ...patch };
    setWindows((prev) => ({ ...prev, [day]: next }));

    if (!hasWindow(next)) return;

    setMarks((prev) => {
      const updated = { ...prev };
      for (const slot of daySlots) {
        const fit = fitFor(slot, next);
        if (!fit || fit.kind === "none") {
          updated[slot.id] = "unavailable";
        } else if ((prev[slot.id] ?? "unavailable") === "unavailable") {
          updated[slot.id] = "available";
        }
      }
      return updated;
    });
  }

  function clearWindow(day: number) {
    touched();
    setWindows((prev) => {
      const next = { ...prev };
      delete next[day];
      return next;
    });
  }

  // אחרי שליחה מוצלחת, שינוי נוסף הוא "עדכון" ולא "שליחה" — גם בלי לטעון מחדש
  const [sentOnce, setSentOnce] = useState(alreadySubmitted);

  /*
   * "השבוע הרגיל שלי": מילוי הטופס מהתבנית ששמר, ושמירה של מה שמסומן
   * עכשיו כתבנית. המילוי לא שולח — העובד עדיין רואה ומתקן, ושולח בעצמו.
   */
  const [ask, confirmDialog] = useConfirm();
  const [applied, setApplied] = useState<{ savedAt: string; skipped: TemplateMark[] } | null>(null);
  const [usualStatus, setUsualStatus] = useState<
    { kind: "idle" } | { kind: "saving" } | { kind: "saved"; savedAt: string } | { kind: "error"; message: string }
  >({ kind: "idle" });

  async function fillFromUsual() {
    if (!usualWeek) return;
    const hasMarks = Object.values(marks).some((m) => m !== "unavailable");
    if (
      hasMarks &&
      !(await ask("למלא לפי השבוע הרגיל שלך?\n\nהסימונים שכבר יש בטופס יוחלפו.", {
        confirmLabel: "מילוי",
      }))
    ) {
      return;
    }
    const result = applyTemplate(usualWeek.data, slots);
    touched();
    setMarks(result.marks);
    setWindows(result.windows);
    setApplied({ savedAt: usualWeek.savedAt, skipped: result.skipped });
  }

  async function saveUsual() {
    if (preview) return;
    if (
      usualWeek &&
      !(await ask(`להחליף את השבוע הרגיל ששמרת ב-${usualWeek.savedAt} במה שמסומן עכשיו?`, {
        confirmLabel: "שמירה",
      }))
    ) {
      return;
    }
    setUsualStatus({ kind: "saving" });
    const result = await saveUsualWeek({
      marks: effectiveMarks.map((m) => ({ slotId: m.slotId, state: m.state })),
      windows: Object.entries(windows).map(([day, w]) => ({ dayOfWeek: Number(day), ...w })),
    });
    setUsualStatus(
      result.ok && result.savedAt
        ? { kind: "saved", savedAt: result.savedAt }
        : { kind: "error", message: result.error ?? "השמירה נכשלה" },
    );
  }

  async function submit() {
    if (preview) return;
    setStatus({ kind: "saving" });
    const result = await save({
      marks: effectiveMarks,
      note: note.trim() || null,
    });
    if (result.ok) {
      setSentOnce(true);
      setClean(true);
    }
    setStatus(
      result.ok
        ? { kind: "saved" }
        : { kind: "error", message: result.error ?? "השמירה נכשלה" },
    );
  }

  /** כמה משמרות נבחרו בכל יום — לניווט התחתון ולתגית שבראש היום */
  const markedPerDay = useMemo(() => {
    const counts: Record<number, number> = {};
    for (const [day, daySlots] of days) {
      counts[day] = daySlots.filter((s) => effectiveIds.has(s.id)).length;
    }
    return counts;
  }, [days, effectiveIds]);

  /*
   * מסילת הימים.
   *
   * יום אחד לרוחב המסך, ומחליקים ביניהם באצבע — `scroll-snap` של הדפדפן
   * ולא קפיץ שנכתב כאן: הוא עוקב אחרי האצבע 1:1, ממשיך בתנופה, ואפשר
   * לתפוס אותו באמצע. הקוד כאן רק יודע איזה יום מוצג, ומתאים את גובה
   * המסילה ליום הזה (אחרת היא בגובה היום הארוך ביותר, ויום קצר מותיר
   * חור לפני ההערה).
   *
   * RTL: היום הראשון מימין, ו-`scrollLeft` שלילי ככל שמתקדמים — בכל
   * הדפדפנים המודרניים. לכן המיקום הוא הערך המוחלט.
   */
  const trackRef = useRef<HTMLDivElement>(null);
  const panelRefs = useRef<(HTMLElement | null)[]>([]);
  const [active, setActive] = useState(0);
  const [trackHeight, setTrackHeight] = useState<number | undefined>(undefined);

  useEffect(() => {
    const track = trackRef.current;
    if (!track) return;
    let frame = 0;
    const onScroll = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const i = Math.round(Math.abs(track.scrollLeft) / track.clientWidth);
        setActive(Math.min(Math.max(i, 0), days.length - 1));
      });
    };
    track.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      track.removeEventListener("scroll", onScroll);
      cancelAnimationFrame(frame);
    };
  }, [days.length]);

  useEffect(() => {
    const panel = panelRefs.current[active];
    if (!panel) return;
    const observer = new ResizeObserver(() => setTrackHeight(panel.offsetHeight));
    observer.observe(panel);
    return () => observer.disconnect();
  }, [active]);

  /** מעבר ליום — מהאותיות שבתחתית או מהחיצים שבכותרת היום */
  function goTo(i: number) {
    const track = trackRef.current;
    if (!track || i < 0 || i >= days.length) return;
    const instant = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const behavior: ScrollBehavior = instant ? "auto" : "smooth";

    // אם גללת למטה בתוך יום ארוך — חוזרים לראש היום החדש, לא לאמצע שלו
    const top = track.getBoundingClientRect().top;
    const headerH = parseFloat(getComputedStyle(document.documentElement).fontSize) * 3.25;
    if (top < headerH) {
      window.scrollTo({ top: window.scrollY + top - headerH - 12, behavior });
    }
    track.scrollTo({ left: -i * track.clientWidth, behavior });
  }

  return (
    <div className="space-y-4 pb-44">
      {confirmDialog}

      {preview && (
        <div role="note" className="border-2 border-ink bg-ink px-4 py-3 text-sm text-on-band">
          <p className="font-bold">תצוגה מקדימה: כך הטופס נראה אצל {preview.name}</p>
          <p className="mt-0.5 text-on-band-muted">
            אפשר ללחוץ ולראות איך הוא מגיב. שום דבר לא נשמר ולא נשלח.
          </p>
        </div>
      )}

      {/* "השבוע הרגיל שלי" — רק למי ששמר אחד */}
      {usualWeek && (
        <div className="border border-line bg-surface px-4 py-3 text-sm">
          {applied ? (
            <>
              <p className="font-medium">
                מולא לפי השבוע הרגיל ששמרת ב-<span className="num">{applied.savedAt}</span>.
                אפשר לשנות לפני השליחה.
              </p>
              {applied.skipped.length > 0 && (
                <p className="mt-1 text-xs text-amber-800">
                  {applied.skipped.length === 1
                    ? "משמרת אחת מהשבוע הרגיל לא קיימת השבוע ודולגה: "
                    : `${applied.skipped.length} משמרות מהשבוע הרגיל לא קיימות השבוע ודולגו: `}
                  {applied.skipped.map((m, i) => (
                    <span key={i}>
                      {i > 0 && ", "}
                      {DAY_NAMES[m.dayOfWeek]}{" "}
                      <span className="num">
                        {`${m.startTime}–${m.endTime === "CLOSING" ? "סגירה" : m.endTime}`}
                      </span>
                    </span>
                  ))}
                </p>
              )}
            </>
          ) : (
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
              <span className="min-w-0 flex-1">
                יש לך &quot;שבוע רגיל&quot; שמור, מ-<span className="num">{usualWeek.savedAt}</span>.
              </span>
              <Button variant="secondary" size="sm" onClick={fillFromUsual}>
                מילוי לפי השבוע הרגיל שלי
              </Button>
            </div>
          )}
        </div>
      )}

      {/* מקרא בשורה אחת, באותה שפה חזותית של הסימנים עצמם */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-muted">
        <span className="flex items-center gap-1.5">
          <StateMark state="unavailable" small /> לא
        </span>
        <span className="flex items-center gap-1.5">
          <StateMark state="available" small /> יכול
        </span>
        <span className="flex items-center gap-1.5">
          <StateMark state="preferred" small /> מעדיף
        </span>
        <span className="mr-auto">החלקה בין הימים · לחיצה מחליפה מצב</span>
      </div>

      <div
        ref={trackRef}
        className="day-track"
        style={trackHeight ? { height: trackHeight } : undefined}
      >
        {days.map(([day, daySlots], index) => {
          const date = addDays(weekStartDate, day);
          const marked = markedPerDay[day] ?? 0;
          const win = windows[day];
          const windowActive = hasWindow(win);
          const periods = [...new Set(daySlots.map((s) => s.period))];

          return (
            <section
              key={day}
              id={`day-${day}`}
              ref={(el) => {
                panelRefs.current[index] = el;
              }}
              aria-labelledby={`day-${day}-title`}
              className="day-panel border border-line bg-surface"
            >
              <header className="flex items-center gap-2 border-b-2 border-ink px-4 py-3">
                <button
                  type="button"
                  onClick={() => goTo(index - 1)}
                  disabled={index === 0}
                  aria-label="היום הקודם"
                  className="grid size-10 shrink-0 place-items-center text-xl text-ink transition-transform duration-150 ease-[var(--ease-out)] active:scale-[0.9] disabled:opacity-20"
                >
                  ›
                </button>
                <div className="min-w-0 flex-1 text-center">
                  <h2 id={`day-${day}-title`} className="text-2xl font-extrabold tracking-[-0.02em]">
                    {DAY_NAMES[day]}
                  </h2>
                  <p className="text-sm text-muted">
                    <span className="num">{formatDayMonth(date)}</span>
                    {" · "}
                    {marked === 0
                      ? "לא סומן"
                      : marked === 1
                        ? "משמרת אחת"
                        : <><span className="num">{marked}</span> משמרות</>}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => goTo(index + 1)}
                  disabled={index === days.length - 1}
                  aria-label="היום הבא"
                  className="grid size-10 shrink-0 place-items-center text-xl text-ink transition-transform duration-150 ease-[var(--ease-out)] active:scale-[0.9] disabled:opacity-20"
                >
                  ‹
                </button>
              </header>

              {/* שלב 1 — השעות. זו נקודת הפתיחה, לא תוספת. */}
              <div className="border-b border-line px-4 py-4">
                <p className="text-sm font-bold">מתי אתה פנוי ביום הזה?</p>
                <div className="mt-2.5 grid grid-cols-2 gap-3">
                  <label className="block text-sm">
                    <span className="mb-1 block text-xs text-muted">מהשעה</span>
                    <input
                      type="time"
                      value={win?.earliestStart ?? ""}
                      onChange={(e) =>
                        updateWindow(day, daySlots, {
                          earliestStart: e.target.value,
                        })
                      }
                      className={`num ${inputClass}`}
                    />
                  </label>
                  <label className="block text-sm">
                    <span className="mb-1 block text-xs text-muted">עד השעה</span>
                    <input
                      type="time"
                      value={win?.latestEnd ?? ""}
                      onChange={(e) =>
                        updateWindow(day, daySlots, {
                          latestEnd: e.target.value,
                        })
                      }
                      className={`num ${inputClass}`}
                    />
                  </label>
                </div>

                {windowActive ? (
                  <div className="mt-2.5 flex flex-wrap items-center gap-2">
                    <p className="text-sm text-muted">
                      סומנו לך <strong className="text-ink">{marked}</strong>{" "}
                      משמרות שמתאימות. אפשר לשנות למטה.
                    </p>
                    <button
                      type="button"
                      onClick={() => clearWindow(day)}
                      className="mr-auto text-xs font-semibold text-ink underline underline-offset-4"
                    >
                      ניקוי השעות
                    </button>
                  </div>
                ) : (
                  <p className="mt-2.5 text-sm text-muted">
                    השאר ריק אם אתה פנוי כל היום, וסמן ידנית למטה.
                  </p>
                )}
              </div>

              <div className="space-y-4 px-4 py-4">
                {/* שלב 2 — כיוונון. קיצורים למי שאין לו אילוצים בכלל. */}
                <div className="flex flex-wrap gap-2">
                  {periods.map((period) => (
                    <Button
                      key={period}
                      variant="secondary"
                      size="sm"
                      onClick={() =>
                        setGroup(
                          daySlots.filter(
                            (s) =>
                              s.period === period &&
                              fitFor(s, win)?.kind !== "none",
                          ),
                          "available",
                        )
                      }
                    >
                      כל ה{PERIOD_LABEL[period]}
                    </Button>
                  ))}
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setGroup(daySlots, "unavailable")}
                  >
                    ניקוי הסימונים
                  </Button>
                </div>

                {periods.map((period) => {
                  const periodSlots = daySlots.filter((s) => s.period === period);
                  const usable = periodSlots.filter(
                    (s) => fitFor(s, win)?.kind !== "none",
                  ).length;

                  return (
                    <div key={period} className="space-y-2">
                      {periods.length > 1 && (
                        <h3 className="text-xs font-bold tracking-wide text-muted">
                          {PERIOD_LABEL[period]}
                          {windowActive && usable === 0 && (
                            <span className="mr-2 font-normal text-amber-800">
                              — אף משמרת לא חופפת לשעות שבחרת
                            </span>
                          )}
                        </h3>
                      )}

                      <div className="grid gap-2 sm:grid-cols-2">
                        {periodSlots.map((slot) => {
                          const state = marks[slot.id] ?? "unavailable";
                          const fit = fitFor(slot, win);
                          const blocked = fit?.kind === "none";
                          const chosen = !blocked && state !== "unavailable";

                          return (
                            <button
                              key={slot.id}
                              type="button"
                              onClick={() => cycle(slot.id)}
                              disabled={blocked}
                              aria-pressed={chosen}
                              className={`flex min-h-16 items-center gap-3 border p-3 text-right transition-[border-color,background-color,transform] duration-150 ease-[var(--ease-out)] active:scale-[0.98] ${
                                blocked
                                  ? "cursor-not-allowed border-dashed border-line bg-paper/50"
                                  : chosen
                                    ? "border-brand bg-brand/[0.06]"
                                    : "border-ink/20 bg-surface"
                              }`}
                            >
                              <StateMark state={state} blocked={blocked} />
                              <span className="min-w-0 flex-1">
                                <span
                                  className={`num block text-base font-bold ${
                                    blocked ? "text-muted" : ""
                                  }`}
                                >
                                  {slot.startTime}–
                                  {slot.isClosing ? "סגירה" : slot.endTime}
                                </span>
                                <span className="block text-xs text-muted">
                                  {fit?.kind === "partial" ? (
                                    <>
                                      תוכל לכסות{" "}
                                      <span className="num">
                                        {toHHMM(fit.start)}–{toHHMM(fit.end)}
                                      </span>{" "}
                                      ({hoursLabel(fit.end - fit.start)}) —
                                      המנהל יחליט
                                      {/* למה זו לא סתם משמרת חלקית: כאן
                                          הפתיחה או הסגירה עצמן נפגעות */}
                                      {fit.breaksOpening && (
                                        <span className="block text-amber-800">
                                          המשמרת פותחת ב-
                                          <span className="num">
                                            {slot.startTime}
                                          </span>{" "}
                                          — המקום ייפתח באיחור
                                        </span>
                                      )}
                                      {fit.breaksClosing && (
                                        <span className="block text-amber-800">
                                          המשמרת סוגרת — לא תישאר עד{" "}
                                          <span className="num">
                                            {slot.isClosing
                                              ? "הסגירה"
                                              : slot.endTime}
                                          </span>
                                        </span>
                                      )}
                                    </>
                                  ) : blocked ? (
                                    REJECT_LABEL[fit.reason](slot)
                                  ) : (
                                    <>
                                      {slot.fixedStart && (
                                        <>
                                          חובה להגיע ב-
                                          <span className="num">
                                            {slot.startTime}
                                          </span>
                                          {" · "}
                                        </>
                                      )}
                                      {slot.fixedEnd && (
                                        <>
                                          חובה להישאר עד{" "}
                                          <span className="num">
                                            {slot.isClosing
                                              ? "הסגירה"
                                              : slot.endTime}
                                          </span>
                                          {" · "}
                                        </>
                                      )}
                                      {slot.label ?? ROLE_LABEL[slot.role]}
                                    </>
                                  )}
                                </span>
                              </span>
                              {fit?.kind === "partial" && (
                                <Badge tone="amber">חלקי</Badge>
                              )}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>

      <label className="block pt-2">
        <span className="mb-1.5 block text-sm font-bold">הערה למנהל (רשות)</span>
        <textarea
          value={note}
          onChange={(e) => {
            touched();
            setNote(e.target.value);
          }}
          rows={2}
          placeholder="למשל: אשמח למשמרות ערב השבוע"
          className={inputClass}
        />
      </label>

      {/* שמירת מה שמסומן כ"שבוע הרגיל" — בשבוע הבא ממלאים ממנו בלחיצה */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-sm">
        <Button
          variant="secondary"
          size="sm"
          disabled={Boolean(preview) || effectiveMarks.length === 0 || usualStatus.kind === "saving"}
          onClick={saveUsual}
        >
          {usualStatus.kind === "saving" ? "שומר…" : "שמירה כשבוע הרגיל שלי"}
        </Button>
        <span className="text-xs text-muted" role="status">
          {usualStatus.kind === "saved"
            ? "נשמר ✓ בשבוע הבא אפשר למלא לפי זה בלחיצה."
            : usualStatus.kind === "error"
              ? usualStatus.message
              : "שומר את מה שמסומן עכשיו, כדי למלא ממנו בשבועות הבאים."}
        </span>
      </div>

      {/*
        סרגל הפעולה. `submit-bar` מסתיר את סרגל הלשוניות כל עוד הוא בעמוד —
        ראה globals.css. שני סרגלים מקובעים לא יושבים זה על זה.
      */}
      <div className="submit-bar fixed inset-x-0 bottom-0 z-40 border-t border-line bg-surface/97 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur">
        <div className="mx-auto max-w-3xl space-y-3 px-4">
          {/* מפת השבוע: יום שסימנת בו מלא, היום שמוצג מסומן במסגרת. לחיצה עוברת אליו. */}
          <div className="flex items-center gap-1.5">
            {days.map(([day], index) => {
              const count = markedPerDay[day] ?? 0;
              const current = index === active;
              return (
                <button
                  key={day}
                  type="button"
                  onClick={() => goTo(index)}
                  aria-current={current ? "true" : undefined}
                  aria-label={`${DAY_NAMES[day]} — ${count} משמרות`}
                  className={`relative flex size-9 items-center justify-center text-sm font-bold transition-[background-color,color,transform] duration-150 ease-[var(--ease-out)] active:scale-[0.92] ${
                    count > 0 ? "bg-brand text-white" : "border border-ink/25 text-muted"
                  } ${current ? "outline-2 outline-offset-2 outline-ink" : ""}`}
                >
                  {DAY_SHORT[day]}
                  {count > 0 && (
                    <span
                      aria-hidden
                      className="num absolute -top-1.5 -left-1.5 min-w-4 bg-ink px-0.5 text-center text-[10px] leading-4 text-white"
                    >
                      {count}
                    </span>
                  )}
                </button>
              );
            })}
            {/* המונה מתגלגל למספר החדש — `key` מחדש את האנימציה בכל שינוי */}
            <span className="mr-auto overflow-hidden text-xs text-muted" aria-live="polite">
              סימנת{" "}
              <span key={effectiveMarks.length} className="count-roll num font-bold text-ink">
                {effectiveMarks.length}
              </span>{" "}
              משמרות
            </span>
          </div>

          <div className="flex items-center gap-3">
            {/*
              הסרגל מסתיר את סרגל הלשוניות, ובלי הכפתור הזה הדרך היחידה
              חזרה הייתה הלוגו. הוא תופס את המקום של "הגשה עד…" — בטלפון
              אין רוחב לשניהם, ואחרי שליחה המועד כבר פחות דחוף.
            */}
            {preview ? (
              <LinkButton href={preview.backHref} variant="secondary">
                חזרה להגשות
              </LinkButton>
            ) : clean && status.kind !== "saving" ? (
              <span key="home" className="label-swap">
                <LinkButton href="/me" variant="secondary">
                  חזרה לבית
                </LinkButton>
              </span>
            ) : (
              <div className="text-xs text-muted">
                הגשה עד <Num>{deadline}</Num>
              </div>
            )}
            <div className="mr-auto flex items-center gap-3">
              {status.kind === "error" && (
                <span role="alert" className="text-sm text-amber-800">{status.message}</span>
              )}
              {/*
                רגע ההצלחה: הכפתור עצמו הופך לשחור "נשלח ✓" — לא הודעה
                נפרדת לידו. התוכן מתחלף דרך טשטוש קל (`.label-swap`), כדי
                שהמעבר ייראה כמו דבר אחד שמשתנה ולא שתי מילים שמתחלפות.
              */}
              <button
                type="button"
                onClick={submit}
                disabled={Boolean(preview) || status.kind === "saving"}
                className={`inline-flex min-h-12 items-center justify-center px-5 py-2.5 text-[0.9375rem] font-semibold transition-[background-color,transform] duration-200 ease-[var(--ease-out)] active:scale-[0.97] disabled:cursor-not-allowed ${
                  status.kind === "saved" ? "bg-ink text-on-band" : "bg-brand text-white hover:bg-brand-deep"
                } ${preview ? "opacity-60" : ""}`}
              >
                <span key={status.kind === "saved" ? "saved" : status.kind === "saving" ? "saving" : "idle"} className="label-swap">
                  {preview
                    ? "תצוגה מקדימה"
                    : status.kind === "saving"
                    ? "שולח…"
                    : status.kind === "saved"
                      ? "נשלח ✓"
                      : sentOnce
                        ? "עדכון ההגשה"
                        : "שליחת ההגשה"}
                </span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
