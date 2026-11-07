import { useCallback, useMemo, useSyncExternalStore } from "react";

/**
 * "למי כבר שלחתי ✓" ברשימות הוואטסאפ של מסך השבוע — התזכורות (Nudge.tsx)
 * וההודעות האישיות (PersonalSummaries.tsx).
 *
 * localStorage ולא המסד: זה עזר למנהל לא ללכת לאיבוד באמצע הרשימה, לא
 * רישום של מה נשלח בפועל — הלחיצה על "שלח" קורית בוואטסאפ, והאתר לא יודע
 * עליה. כשהאחסון חסום (גלישה פרטית) הסימונים נשמרים בזיכרון עד לרענון.
 *
 * `getKey` ולא מחרוזת: המפתח של התזכורות כולל את היום (מחר מתחילים מחדש),
 * וקריאה לשעון בזמן רינדור אינה טהורה.
 */
export function useSentMarks(getKey: () => string) {
  /*
   * בשרת ובשבריר השנייה שעד שהדף מתעורר, הסימונים עוד לא נקראו. אילו
   * "הבא בתור" היה מוצג כבר אז, הוא היה מצביע על הראשון ברשימה — ולחיצה
   * מהירה בטלפון איטי הייתה פותחת שוב צ'אט עם מי שכבר קיבל. לכן עד הקריאה
   * `ready` הוא false.
   */
  const raw = useSyncExternalStore(subscribe, () => readMarks(getKey()), () => UNREAD);
  const ready = raw !== UNREAD;
  const marked = useMemo(() => new Set(ready && raw ? raw.split(",") : []), [raw, ready]);

  /*
   * ✓ נרשם רק אחרי שהדפדפן כבר יצא לקישור.
   *
   * סימון מיידי מרנדר מחדש בתוך הלחיצה עצמה (useSyncExternalStore מסנכרן),
   * ו"הבא בתור" — אותו <a> — מקבל את הכתובת של הבא אחריו. הדפדפן קורא את
   * ה-href רק אחרי שכל המאזינים סיימו, ולכן לחיצה על אביב פתחה צ'אט עם
   * אופק. setTimeout רץ אחרי שהקישור כבר נפתח.
   *
   * הסימונים נקראים מחדש ברגע הכתיבה ולא מהרינדור, כדי ששתי לחיצות
   * רצופות לא ימחקו זו את זו.
   */
  const mark = useCallback(
    (id: string) =>
      window.setTimeout(() => {
        const key = getKey();
        const current = readMarks(key);
        writeMarks(key, [...(current ? current.split(",") : []), id]);
      }, 0),
    [getKey],
  );
  const reset = useCallback(() => writeMarks(getKey(), []), [getKey]);

  return { ready, marked, mark, reset };
}

const memory = new Map<string, string>();
const CHANGE = "sent-marks";
/** ערך שלא יכול להיות רשימת מזהים — "עוד לא נקרא" */
const UNREAD = "\u0000";

function readMarks(key: string): string {
  try {
    const v = localStorage.getItem(key);
    if (v !== null) return v;
  } catch {
    // נופל לזיכרון
  }
  return memory.get(key) ?? "";
}

function writeMarks(key: string, ids: string[]) {
  const value = [...new Set(ids)].join(",");
  memory.set(key, value);
  try {
    if (value) localStorage.setItem(key, value);
    else localStorage.removeItem(key);
  } catch {
    // נשאר בזיכרון בלבד
  }
  window.dispatchEvent(new Event(CHANGE));
}

function subscribe(onChange: () => void) {
  window.addEventListener(CHANGE, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(CHANGE, onChange);
    window.removeEventListener("storage", onChange);
  };
}
