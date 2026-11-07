"use client";

import {
  useCallback,
  useEffect,
  useEffectEvent,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Button, Card, isolateRanges } from "@/components/ui";

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * חלון קופץ: גיליון תחתון בטלפון, חלון ממורכז במסך רחב.
 *
 * מה שהופך אותו לדיאלוג ולא רק לשכבה מעל העמוד: קורא מסך מודיע שנפתח
 * חלון ומקריא את `label`, Esc סוגר, הפוקוס נכנס פנימה ולא בורח ממנו
 * בטאב, וכשהחלון נסגר הפוקוס חוזר לכפתור שפתח אותו. בלי אלה מי שעובד
 * במקלדת ממשיך לטייל בעמוד שמאחורי השכבה.
 */
export function Dialog({
  label,
  onClose,
  className = "",
  closing = false,
  children,
}: {
  label: string;
  onClose: () => void;
  className?: string;
  /** מפעיל את אנימציית היציאה — מי שמחזיק את החלון מסיר אותו אחריה */
  closing?: boolean;
  children: ReactNode;
}) {
  const panel = useRef<HTMLDivElement>(null);
  const close = useEffectEvent(onClose);

  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    panel.current?.focus();

    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        close();
        return;
      }
      if (e.key !== "Tab" || !panel.current) return;

      const items = [...panel.current.querySelectorAll<HTMLElement>(FOCUSABLE)];
      if (items.length === 0) {
        e.preventDefault();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;
      if (e.shiftKey && (active === first || active === panel.current)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      opener?.focus();
    };
  }, []);

  return (
    <div
      className={`dialog-overlay no-print fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center ${
        closing ? "is-closing" : ""
      }`}
      onClick={onClose}
    >
      <Card
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        tabIndex={-1}
        className={`dialog-panel pb-safe w-full border-ink/20 focus:outline-none sm:pb-5 ${className}`}
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </Card>
    </div>
  );
}

/**
 * אישור לפני פעולה — במקום `confirm()` של הדפדפן.
 *
 * החלון של הדפדפן נראה כמו הודעת מערכת, באייפון הוא נושא את כתובת האתר
 * בראשו, ואי אפשר לעצב אותו. זה אותו `Dialog` — גיליון שעולה מלמטה
 * בטלפון — עם שני כפתורים.
 *
 * ההודעה היא אותה מחרוזת שנשלחה ל-`confirm()`: הפסקה הראשונה הופכת
 * לכותרת, השאר לגוף. כך כל קריאה קיימת עוברת בלי לנסח מחדש.
 *
 * שימוש:
 *   const [ask, dialog] = useConfirm();
 *   if (!(await ask("לפרסם את הסידור?"))) return;
 *   …
 *   return <>{dialog}…</>;
 */
type ConfirmOptions = {
  /** טקסט כפתור האישור. ברירת המחדל: "אישור" */
  confirmLabel?: string;
  /** פעולה הרסנית — כפתור האישור במסגרת אדומה ולא מלא */
  danger?: boolean;
};

export function useConfirm() {
  const [request, setRequest] = useState<{
    message: string;
    options: ConfirmOptions;
    resolve: (answer: boolean) => void;
  } | null>(null);

  const ask = useCallback(
    (message: string, options: ConfirmOptions = {}) =>
      new Promise<boolean>((resolve) => setRequest({ message, options, resolve })),
    [],
  );

  const dialog = request ? (
    <ConfirmDialog
      key={request.message}
      message={request.message}
      {...request.options}
      onAnswer={(answer) => {
        request.resolve(answer);
        setRequest(null);
      }}
    />
  ) : null;

  return [ask, dialog] as const;
}

function ConfirmDialog({
  message,
  confirmLabel = "אישור",
  danger = false,
  onAnswer,
}: ConfirmOptions & { message: string; onAnswer: (answer: boolean) => void }) {
  const [title, ...rest] = message.split(/\n{2,}/);
  const [closing, setClosing] = useState(false);

  /*
   * יציאה מהירה מהכניסה (150ms מול 260ms): המשתמש כבר החליט, והממשק לא
   * צריך לעכב אותו. התשובה נמסרת רק אחרי היציאה, כדי שהפעולה — ניווט,
   * רענון — לא תקטע את החלון באמצע.
   */
  function answer(value: boolean) {
    if (closing) return;
    setClosing(true);
    const instant = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    window.setTimeout(() => onAnswer(value), instant ? 0 : 150);
  }

  return (
    <Dialog label={title} onClose={() => answer(false)} closing={closing} className="max-w-md">
      {/* טווחי שעות ותאריכים בהודעה מבודדים — אחרת "07:00–16:00" מתהפך */}
      <h2 className="text-lg font-bold leading-snug">{isolateRanges(title)}</h2>
      {rest.map((paragraph, i) => (
        <p key={i} className="mt-3 text-sm leading-relaxed whitespace-pre-line text-muted">
          {isolateRanges(paragraph)}
        </p>
      ))}
      <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-start">
        <Button variant={danger ? "danger" : "primary"} onClick={() => answer(true)} className="sm:min-w-28">
          {confirmLabel}
        </Button>
        <Button variant="secondary" onClick={() => answer(false)}>
          ביטול
        </Button>
      </div>
    </Dialog>
  );
}
