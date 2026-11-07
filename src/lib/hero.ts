/**
 * החישובים של הגיבור בבית העובד — טהורים, בלי שעון ובלי מסד, כדי שיהיה
 * אפשר לבדוק אותם ולהריץ אותם עם נתונים מומצאים במסך התצוגה.
 */

/** ברכה לפי השעה בישראל */
export function greetingFor(hour: number): string {
  if (hour >= 5 && hour < 12) return "בוקר טוב";
  if (hour >= 12 && hour < 17) return "צהריים טובים";
  if (hour >= 17 && hour < 22) return "ערב טוב";
  return "לילה טוב";
}

/**
 * השם הפרטי — המילה הראשונה בשם המלא.
 *
 * בלי סוגריים: "נועם (ברמן)" הוא שם שהמנהל נתן כדי להבדיל בין שני נועם,
 * והתוספת לא שייכת לברכה.
 */
export function firstNameOf(fullName: string): string {
  const first = fullName.trim().split(/\s+/)[0] ?? "";
  return first.replace(/[()]/g, "") || fullName.trim();
}

/**
 * כמה זמן נשאר עד המועד, בצורה שהגיבור מציג בגדול: מספר ויחידה.
 *
 * מעוגל כלפי מטה, בכוונה: "יום אחד" כשנשארו 47 שעות היה מבהיל פחות
 * ממה שצריך, אבל "2 ימים" כשנשארו 25 שעות היה מבטיח זמן שאין.
 */
export function timeLeftParts(ms: number): { amount: string; unit: string } {
  if (ms < 60 * 60 * 1000) return { amount: "פחות", unit: "משעה" };
  const hours = Math.floor(ms / (60 * 60 * 1000));
  if (hours < 24) return hours === 1 ? { amount: "שעה", unit: "אחת" } : { amount: String(hours), unit: "שעות" };
  const days = Math.floor(hours / 24);
  return days === 1 ? { amount: "יום", unit: "אחד" } : { amount: String(days), unit: "ימים" };
}

/** "היום", "מחר", או שם היום — לפי כמה ימים קדימה המשמרת */
export function dayLabel(daysAhead: number, dayName: string): string {
  if (daysAhead === 0) return "היום";
  if (daysAhead === 1) return "מחר";
  return dayName;
}
