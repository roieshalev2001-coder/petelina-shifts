/**
 * השעות של בלוק לפי התצוגה שנבחרה לו (ראה formatHours ב-src/lib/week.ts):
 * "07:15–15:00", רק "07:15", או "עד 15:00".
 *
 * רכיב ולא מחרוזת, בגלל הכיוון: "עד 15:00" בתוך בידוד LTR (`.num`) היה
 * נקרא הפוך — "15:00 עד". לכן רק השעה עצמה מבודדת, והמילה העברית זורמת
 * מימין לשמאל. LRI/PDI בתוך הטקסט ולא רק ב-CSS, כי צילום הסידור לתמונה
 * (modern-screenshot) מאבד את הבידוד של ה-CSS.
 */
export function HoursText({
  start,
  end,
  display = "range",
  className = "",
}: {
  start: string;
  /** "HH:MM" או "CLOSING" */
  end: string;
  display?: string;
  className?: string;
}) {
  const time = (value: string) => <span className="num">{`⁦${value}⁩`}</span>;

  if (display === "start") return <span className={className}>{time(start)}</span>;
  if (display === "end") {
    return <span className={className}>עד {end === "CLOSING" ? "סגירה" : time(end)}</span>;
  }
  if (end === "CLOSING") {
    return <span className={className}>{time(start)}–סגירה</span>;
  }
  return <span className={className}>{time(`${start}–${end}`)}</span>;
}
