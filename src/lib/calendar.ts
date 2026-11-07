import { addDays, toMinutes, zonedAtMinutes } from "./time";

/**
 * ייצוא משמרות ליומן — iCalendar (RFC 5545) וקישורי גוגל קלנדר.
 *
 * הקובץ טהור ואינו נוגע ב-Prisma, כדי שהבדיקות יישארו נטולות מסד כמו כל
 * השאר. ההורדה (src/app/me/calendar), המנוי (src/app/api/calendar/[token])
 * ו-loadSwapBoard הם קוראים דקים שלו — כך שמה שנפתח בקישור של גוגל ומה
 * שיוצא בקובץ הם אותו חישוב בדיוק.
 */

export type CalendarEvent = {
  uid: string;
  start: Date;
  end: Date;
  summary: string;
  description?: string;
  location?: string;
  /** משמרת שנמסרה — נפלטת כדי שהורדה חוזרת תסיר אותה מהיומן */
  cancelled?: boolean;
};

const PRODID = "-//Petelina//Shifts//HE";
const LOCATION = "פטלינה";

/** "20260825T041500Z" — תמיד UTC, ולכן חף מהשעון של התהליך */
export function toICSTimestamp(date: Date): string {
  const p = (n: number, width = 2) => String(n).padStart(width, "0");
  return (
    `${p(date.getUTCFullYear(), 4)}${p(date.getUTCMonth() + 1)}${p(date.getUTCDate())}` +
    `T${p(date.getUTCHours())}${p(date.getUTCMinutes())}${p(date.getUTCSeconds())}Z`
  );
}

/** התווים ש-RFC 5545 מחייב לברוח מהם בערך טקסטואלי */
export function escapeICSText(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}

/**
 * קיפול שורה ל-75 אוקטטים, עם רווח בתחילת כל שורת המשך.
 *
 * הספירה היא ב**בתים ולא בתווים**: אות עברית היא שני בתים ב-UTF-8, וחיתוך
 * נאיבי לפי אורך המחרוזת היה שובר רצף UTF-8 באמצע והופך את הקובץ לג׳יבריש.
 * לכן צוברים תו-תו לפי Buffer.byteLength ולעולם לא חותכים בתוך תו.
 */
export function foldICSLine(line: string): string {
  const LIMIT = 75;
  const out: string[] = [];
  let current = "";
  let bytes = 0;
  // שורת המשך מתחילה ברווח, שנספר גם הוא במכסת האוקטטים שלה
  let prefix = 0;

  for (const char of line) {
    const size = Buffer.byteLength(char, "utf8");
    if (bytes + size + prefix > LIMIT) {
      out.push(current);
      current = "";
      bytes = 0;
      prefix = 1;
    }
    current += char;
    bytes += size;
  }
  out.push(current);

  return out.map((part, i) => (i === 0 ? part : ` ${part}`)).join("\r\n");
}

/** מחזיר מחרוזת מקופלת לצורתה המקורית — קיים בשביל בדיקת ההלוך-חזור */
export function unfoldICSLine(folded: string): string {
  return folded.replace(/\r\n /g, "");
}

/**
 * בונה אירוע יומן ממשבצת ומהשעות שהעובד באמת עובד.
 *
 * השעות נבנות ב-`zonedAtMinutes`, כלומר על היום הקלנדרי **בישראל** של
 * `date` — ולא ב-setHours שתלוי בשעון התהליך. זה לא הידור: בשרת שרץ ב-UTC
 * (וזה מה שקורה בייצור) הדפוס הקודם הפיק אירועי יומן שלוש שעות מאוחר מדי,
 * כלומר משמרת 07:15 נחתה אצל העובד ב-10:15.
 */
export function shiftEvent(args: {
  slotId: string;
  date: Date;
  /** "HH:MM" — השעות בפועל של העובד, לא בהכרח של המשבצת */
  startTime: string;
  endTime: string;
  summary: string;
  description?: string;
  cancelled?: boolean;
}): CalendarEvent {
  const start = zonedAtMinutes(args.date, toMinutes(args.startTime));

  // משמרות היום אינן חוצות חצות, אבל משבצת עתידית של 23:30–01:00 לא צריכה
  // לייצר אירוע באורך שלילי
  let end = zonedAtMinutes(args.date, toMinutes(args.endTime));
  if (end <= start) end = zonedAtMinutes(addDays(args.date, 1), toMinutes(args.endTime));

  return {
    uid: `${args.slotId}@petelina.shifts`,
    start,
    end,
    summary: args.summary,
    description: args.description,
    location: LOCATION,
    cancelled: args.cancelled,
  };
}

function eventLines(event: CalendarEvent, stamp: string, sequence: number): string[] {
  const lines = [
    "BEGIN:VEVENT",
    `UID:${event.uid}`,
    `DTSTAMP:${stamp}`,
    `DTSTART:${toICSTimestamp(event.start)}`,
    `DTEND:${toICSTimestamp(event.end)}`,
    `SEQUENCE:${sequence}`,
    `SUMMARY:${escapeICSText(event.summary)}`,
  ];
  if (event.description) {
    lines.push(`DESCRIPTION:${escapeICSText(event.description)}`);
  }
  if (event.location) {
    lines.push(`LOCATION:${escapeICSText(event.location)}`);
  }
  if (event.cancelled) lines.push("STATUS:CANCELLED");
  lines.push("END:VEVENT");
  return lines;
}

/**
 * קובץ iCalendar שלם.
 *
 * בלי METHOD בכוונה: קובץ להורדה אינו הודעת iTIP, ו-METHOD רק מבלבל לקוחות.
 *
 * SEQUENCE הוא חותמת הזמן בשניות של רגע ההפקה. הוא חייב לעלות כדי שלקוח
 * יזהה הורדה חוזרת כגרסה חדשה של אותו UID ולא כאירוע נוסף, ואין לנו מונה
 * גרסאות — שניות מאז 1970 הן המונה העולה הזול והנכון.
 */
export function buildICS(
  events: CalendarEvent[],
  now: Date = new Date(),
  /**
   * למנוי (יומן שנרשם לכתובת ומתעדכן לבד): שם ליומן, וכל כמה זמן לבקש
   * שוב. אפל מכבד את זה; גוגל מחליט לבד, בדרך כלל פעם בכמה שעות.
   */
  subscription?: { name: string; refreshHours: number },
): string {
  const stamp = toICSTimestamp(now);
  const sequence = Math.floor(now.getTime() / 1000);

  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    `PRODID:${PRODID}`,
    "CALSCALE:GREGORIAN",
    ...(subscription
      ? [
          `X-WR-CALNAME:${escapeICSText(subscription.name)}`,
          `REFRESH-INTERVAL;VALUE=DURATION:PT${subscription.refreshHours}H`,
          `X-PUBLISHED-TTL:PT${subscription.refreshHours}H`,
        ]
      : []),
    ...events.flatMap((e) => eventLines(e, stamp, sequence)),
    "END:VCALENDAR",
  ];

  // RFC 5545 מחייב CRLF. שורה עם \n בלבד נדחית בשקט אצל חלק מהלקוחות,
  // וזה נראה למשתמש כמו "היומן פשוט לא נפתח".
  return lines.map(foldICSLine).join("\r\n") + "\r\n";
}

/**
 * קישור "הוספה ליומן" של גוגל למשמרת אחת.
 *
 * גוגל תומך באירוע יחיד לכל קישור, ולכן זה משלים את הקובץ ולא מחליף אותו —
 * אבל הוא לחיצה אחת ועובד בוודאות בכל טלפון, גם כשקובץ .ics לא נפתח חלק.
 */
export function googleCalendarUrl(event: CalendarEvent): string {
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: event.summary,
    dates: `${toICSTimestamp(event.start)}/${toICSTimestamp(event.end)}`,
  });
  if (event.description) params.set("details", event.description);
  if (event.location) params.set("location", event.location);
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}
