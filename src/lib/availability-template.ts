/**
 * "השבוע הרגיל שלי" — שמירת הזמינות של עובד, והתאמתה לשבוע חדש.
 *
 * טהור ובלי מסד, כמו שאר ההיגיון. השמירה עצמה ב-src/app/me/submit/page.tsx,
 * והטבלה — AvailabilityTemplate בסכימה.
 *
 * משבצת של שבוע (WeekSlot) היא העתק חדש בכל שבוע, עם מזהה חדש. לכן
 * התבנית שומרת יום, תפקיד ושעות, וההתאמה לשבוע החדש היא לפיהם — אותו
 * מפתח של findTemplateSlot (src/lib/week.ts). משמרת שכבר לא קיימת (השעות
 * השתנו, הבלוק הוסר) מדלגים עליה, ומספרים לעובד.
 */

export type TemplateMark = {
  dayOfWeek: number;
  role: string;
  startTime: string;
  /** "HH:MM" או "CLOSING" — כמו במשבצת, לפני פתירת שעת הסגירה */
  endTime: string;
  sortOrder: number;
  state: "available" | "preferred";
};

export type TemplateWindow = {
  dayOfWeek: number;
  earliestStart: string;
  latestEnd: string;
};

export type AvailabilityTemplateData = {
  marks: TemplateMark[];
  windows: TemplateWindow[];
};

/** משבצת בטופס — רק מה שההתאמה צריכה */
type SlotKey = {
  id: string;
  dayOfWeek: number;
  role: string;
  startTime: string;
  /** השעה הפתורה — ו-isClosing אומר אם היא בעצם "עד סגירה" */
  endTime: string;
  isClosing: boolean;
  sortOrder: number;
};

const rawEnd = (slot: SlotKey) => (slot.isClosing ? "CLOSING" : slot.endTime);

/** הסימונים והחלונות של הטופס כתבנית לשמירה */
export function templateFromForm(
  slots: readonly SlotKey[],
  marks: readonly { slotId: string; state: "available" | "preferred" }[],
  windows: readonly TemplateWindow[],
): AvailabilityTemplateData {
  const byId = new Map(slots.map((s) => [s.id, s]));
  return {
    marks: marks.flatMap((m) => {
      const slot = byId.get(m.slotId);
      if (!slot) return [];
      return [
        {
          dayOfWeek: slot.dayOfWeek,
          role: slot.role,
          startTime: slot.startTime,
          endTime: rawEnd(slot),
          sortOrder: slot.sortOrder,
          state: m.state,
        },
      ];
    }),
    windows: windows.filter((w) => w.earliestStart || w.latestEnd),
  };
}

/**
 * התבנית על משבצות השבוע הזה: מה לסמן, אילו שעות לכל יום, ועל מה דילגנו.
 *
 * שני מלצרים זהים (16:00–22:15) הם שתי משבצות: כל סימון בתבנית תופס
 * משבצת אחת, ועדיף זו עם אותו מקום בסדר — כמו findTemplateSlot.
 */
export function applyTemplate(
  data: AvailabilityTemplateData,
  slots: readonly SlotKey[],
): {
  marks: Record<string, "available" | "preferred">;
  windows: Record<number, { earliestStart: string; latestEnd: string }>;
  skipped: TemplateMark[];
} {
  const used = new Set<string>();
  const marks: Record<string, "available" | "preferred"> = {};
  const skipped: TemplateMark[] = [];

  for (const mark of data.marks) {
    const same = slots.filter(
      (s) =>
        !used.has(s.id) &&
        s.dayOfWeek === mark.dayOfWeek &&
        s.role === mark.role &&
        s.startTime === mark.startTime &&
        rawEnd(s) === mark.endTime,
    );
    const slot = same.find((s) => s.sortOrder === mark.sortOrder) ?? same[0];
    if (!slot) {
      skipped.push(mark);
      continue;
    }
    used.add(slot.id);
    marks[slot.id] = mark.state;
  }

  // חלון ליום שאין בו אף משבצת השבוע — אין לו על מה לחול
  const days = new Set(slots.map((s) => s.dayOfWeek));
  const windows: Record<number, { earliestStart: string; latestEnd: string }> = {};
  for (const w of data.windows) {
    if (days.has(w.dayOfWeek)) {
      windows[w.dayOfWeek] = { earliestStart: w.earliestStart, latestEnd: w.latestEnd };
    }
  }

  return { marks, windows, skipped };
}

/** קורא את מה שנשמר במסד. נתונים פגומים = אין תבנית, ולא שגיאה במסך */
export function parseTemplate(json: string): AvailabilityTemplateData | null {
  try {
    const data = JSON.parse(json) as AvailabilityTemplateData;
    if (!Array.isArray(data?.marks) || !Array.isArray(data?.windows)) return null;
    return data;
  } catch {
    return null;
  }
}
