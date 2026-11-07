"use client";

import { useState } from "react";
import { Button, inputClass } from "@/components/ui";
import { PERIOD_LABEL, PERIODS, ROLE_LABEL, ROLES } from "@/lib/domain";

export function AddSlotForm({
  dayOfWeek,
  action,
}: {
  dayOfWeek: number;
  action: (formData: FormData) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [untilClosing, setUntilClosing] = useState(false);

  if (!open) {
    return (
      <Button variant="secondary" size="sm" onClick={() => setOpen(true)}>
        הוספת משבצת
      </Button>
    );
  }

  return (
    <form
      action={async (formData) => {
        await action(formData);
        setOpen(false);
        setUntilClosing(false);
      }}
      className="space-y-2 border border-line p-3"
    >
      <input type="hidden" name="dayOfWeek" value={dayOfWeek} />
      <div className="grid grid-cols-2 gap-2">
        <select name="role" aria-label="תפקיד" className={inputClass} defaultValue="waiter">
          {ROLES.map((r) => (
            <option key={r} value={r}>
              {ROLE_LABEL[r]}
            </option>
          ))}
        </select>
        <select name="period" aria-label="בוקר או ערב" className={inputClass} defaultValue="morning">
          {PERIODS.map((p) => (
            <option key={p} value={p}>
              {PERIOD_LABEL[p]}
            </option>
          ))}
        </select>
        <input
          name="startTime"
          type="time"
          aria-label="שעת התחלה"
          required
          defaultValue="07:15"
          className={`${inputClass} num`}
        />
        <input
          name="endTime"
          type="time"
          aria-label="שעת סיום"
          defaultValue="15:00"
          disabled={untilClosing}
          required={!untilClosing}
          className={`${inputClass} num`}
        />
      </div>
      <label className="flex items-center gap-2 text-xs">
        <input
          type="checkbox"
          name="untilClosing"
          checked={untilClosing}
          onChange={(e) => setUntilClosing(e.target.checked)}
          className="check"
        />
        עד סגירה
      </label>
      <input
        name="label"
        aria-label="תיאור המשבצת (רשות)"
        placeholder='תיאור, למשל "ברמן בוקר" (רשות)'
        className={inputClass}
      />
      <div className="flex gap-2">
        <Button type="submit" size="sm">
          הוספה
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)}>
          ביטול
        </Button>
      </div>
    </form>
  );
}
