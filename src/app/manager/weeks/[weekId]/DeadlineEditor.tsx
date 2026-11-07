"use client";

import { useState, useTransition } from "react";
import { Button, Num } from "@/components/ui";
import { formatDateTime, toDateTimeInputValue } from "@/lib/time";

/**
 * המועד האחרון נקבע אוטומטית בפתיחת השבוע, אבל צריך להיות ניתן לשינוי —
 * המקרה הנפוץ הוא הארכה לעובדים שמתמהמהים.
 */
export function DeadlineEditor({
  weekId,
  deadline,
  passed,
  action,
}: {
  weekId: string;
  /** ISO — נשלח כמחרוזת כי Date לא עובר את גבול השרת-לקוח בצורה יציבה */
  deadline: string;
  /** מחושב בשרת: קריאה ל-Date.now בזמן רינדור אינה טהורה */
  passed: boolean;
  action: (weekId: string, deadline: Date) => Promise<void>;
}) {
  const current = new Date(deadline);
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(() => toDateTimeInputValue(current));
  const [pending, startTransition] = useTransition();

  if (!editing) {
    return (
      <p className="text-sm text-muted">
        מועד אחרון להגשה:{" "}
        <Num>{formatDateTime(current)}</Num>
        {passed && <span className="mr-1 text-amber-800">· חלף</span>}
        <button
          onClick={() => setEditing(true)}
          className="mr-2 text-xs underline"
        >
          שינוי
        </button>
      </p>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <input
        type="datetime-local"
        aria-label="מועד אחרון להגשה"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        className="num min-h-11 border border-line bg-surface px-3 py-1.5 text-base"
      />
      <Button
        disabled={pending || !value}
        size="sm"
        onClick={() =>
          startTransition(async () => {
            await action(weekId, new Date(value));
            setEditing(false);
          })
        }
      >
        {pending ? "שומר…" : "שמירה"}
      </Button>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => {
          setValue(toDateTimeInputValue(current));
          setEditing(false);
        }}
      >
        ביטול
      </Button>
    </div>
  );
}
