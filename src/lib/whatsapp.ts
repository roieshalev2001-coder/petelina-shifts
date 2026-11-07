/**
 * בניית קישורי שליחה בוואטסאפ.
 *
 * wa.me דורש מספר בפורמט בינלאומי ללא סימנים: 972501234567
 *
 * הנרמול עבר ל-src/lib/phone.ts: מרגע שהכניסה למערכת היא לפי טלפון, הוא
 * תשתית זהות ולא פרט של שליחת הודעות.
 */
import { normalizePhone } from "./phone";

export { normalizePhone };

/** ההודעה שנשלחת לעובד עם הקישור האישי שלו */
export function personalLinkMessage(fullName: string, link: string): string {
  return `היי ${fullName}, זה הקישור האישי שלך להגשת משמרות:\n${link}\n\nשמור אותו — הוא קבוע ומשמש לכל השבועות.`;
}

/**
 * קישור שפותח וואטסאפ עם ההודעה מוכנה.
 * ללא מספר טלפון תקין מחזיר null.
 */
export function whatsappUrl(phone: string | null, message: string): string | null {
  const normalized = normalizePhone(phone);
  if (!normalized) return null;
  return `https://wa.me/${normalized}?text=${encodeURIComponent(message)}`;
}

/**
 * קישור שפותח וואטסאפ עם ההודעה כבר כתובה, ומסך בחירה למי לשלוח.
 *
 * בלי מספר — כך וואטסאפ שואל לאיזה צ'אט, וקבוצות מופיעות שם כמו כל צ'אט.
 * זו הדרך היחידה להגיע לקבוצה עם טקסט מוכן: קישור הזמנה לקבוצה
 * (`chat.whatsapp.com`) אינו מקבל טקסט כלל. ראה settings.ts.
 */
export function whatsappShareUrl(message: string): string {
  return `https://wa.me/?text=${encodeURIComponent(message)}`;
}
