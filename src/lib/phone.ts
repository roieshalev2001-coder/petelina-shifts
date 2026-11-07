/**
 * נרמול מספרי טלפון ישראליים.
 *
 * הפונקציה הזו הייתה עד עכשיו פרט של שליחת וואטסאפ. מרגע שהכניסה למערכת
 * היא לפי טלפון, היא הפכה לתשתית זהות: **אותה פונקציה בדיוק** ממלאת את
 * העמודה במסד ומחפשת בה בכניסה. אם השתיים ייפרדו, עובד יישמר תחת מפתח
 * אחד ויחופש תחת אחר — הוא פשוט לא יצליח להיכנס, בזמן שהאינדקס הייחודי
 * ייראה תקין לגמרי.
 *
 * לכן היא חייבת לקיים `normalizePhone(normalizePhone(x)) === normalizePhone(x)`
 * לכל קלט. יש על כך בדיקה, והמיגרציה נשענת עליה.
 */

/** האורך של מספר ישראלי אחרי קידומת המדינה: 8 לקווי, 9 לנייד */
function isIsraeliSubscriber(digits: string): boolean {
  return digits.length === 8 || digits.length === 9;
}

/**
 * מנרמל לפורמט הבינלאומי ללא סימנים: 972501234567.
 * מחזיר null אם המספר לא נראה תקין.
 */
export function normalizePhone(phone: string | null | undefined): string | null {
  if (!phone) return null;

  let digits = phone.replace(/\D/g, "");
  if (!digits) return null;

  // קידומת יציאה בינלאומית: 00972... → 972...
  if (digits.startsWith("00")) digits = digits.slice(2);

  if (digits.startsWith("972")) {
    let rest = digits.slice(3);
    // "+972 050-1234567" — קידומת מדינה ואחריה אפס מקומי. הצורה הזו נפוצה
    // כשמעתיקים מספר מאנשי הקשר, ועד היום היא הוחזרה כ-null.
    if (rest.startsWith("0")) rest = rest.slice(1);
    return isIsraeliSubscriber(rest) ? `972${rest}` : null;
  }

  // מקומי: 0501234567 → 972501234567
  if (digits.startsWith("0")) {
    const rest = digits.slice(1);
    return isIsraeliSubscriber(rest) ? `972${rest}` : null;
  }

  // ישראלי בלי האפס המוביל: 501234567
  if (isIsraeliSubscriber(digits)) return `972${digits}`;

  // מספר זר — מועבר כמו שהוא אם האורך סביר
  return digits.length >= 10 && digits.length <= 15 ? digits : null;
}

/** "972501234567" → "050-1234567", לתצוגה בלבד */
export function formatPhone(phone: string | null | undefined): string {
  const normalized = normalizePhone(phone);
  if (!normalized || !normalized.startsWith("972")) return phone ?? "";
  const rest = normalized.slice(3);
  return `0${rest.slice(0, 2)}-${rest.slice(2)}`;
}
