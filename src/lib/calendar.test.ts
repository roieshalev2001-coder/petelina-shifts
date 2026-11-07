import assert from "node:assert/strict";
import { zonedTime } from "./time";
import { describe, it } from "node:test";
import {
  buildICS,
  escapeICSText,
  foldICSLine,
  googleCalendarUrl,
  shiftEvent,
  toICSTimestamp,
  unfoldICSLine,
} from "./calendar";

/*
 * כל הבדיקות כאן חייבות לעבור גם ב-TZ=UTC.
 *
 * לכן חשבון התאריך נבדק **ביחסיות** לחצות של אותו יום ולא מול מחרוזת UTC
 * מוחלטת: shiftEvent בונה את הרגע מהשעון המקומי של התהליך, ולכן טענה כמו
 * "07:15 בישראל הם 04:15Z" הייתה נכשלת תחת TZ=UTC. זו בדיוק המלכודת שהפילה
 * כאן פעם אחת את שעת ההגשה שהוצגה לעובדים.
 */

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

/** 18/8/2026, חצות מקומית */
// חצות בישראל במפורש: shiftEvent בונה על היום הקלנדרי בישראל,
// ובדיקה שנשענת על שעון התהליך הייתה עוברת כאן ונכשלת בייצור
const DAY = zonedTime(2026, 8, 18);

describe("חותמת זמן ל-iCalendar", () => {
  it("מנוסחת ב-UTC", () => {
    assert.equal(
      toICSTimestamp(new Date(Date.UTC(2026, 7, 25, 4, 15, 0))),
      "20260825T041500Z",
    );
  });

  it("מרפדת אפסים בכל שדה", () => {
    assert.equal(
      toICSTimestamp(new Date(Date.UTC(2026, 0, 3, 7, 5, 9))),
      "20260103T070509Z",
    );
  });
});

describe("בניית אירוע ממשמרת", () => {
  const event = shiftEvent({
    slotId: "slot-1",
    date: DAY,
    startTime: "07:15",
    endTime: "13:00",
    summary: "משמרת בפטלינה",
  });

  it("ההתחלה היא היסט מחצות אותו יום", () => {
    assert.equal(event.start.getTime() - DAY.getTime(), 7 * HOUR + 15 * MINUTE);
  });

  it("הסיום נגזר מאותו יום", () => {
    assert.equal(event.end.getTime() - DAY.getTime(), 13 * HOUR);
  });

  it("אורך המשמרת נשמר", () => {
    assert.equal(event.end.getTime() - event.start.getTime(), 5 * HOUR + 45 * MINUTE);
  });

  it("המזהה יציב לפי המשבצת", () => {
    const again = shiftEvent({
      slotId: "slot-1",
      date: DAY,
      startTime: "08:00",
      endTime: "14:00",
      summary: "אחר",
    });
    // אותה משבצת — אותו UID, כדי שהורדה חוזרת תעדכן ולא תשכפל
    assert.equal(again.uid, event.uid);
    assert.equal(event.uid, "slot-1@petelina.shifts");
  });

  it("משמרת שחוצה חצות מסתיימת למחרת ולא באורך שלילי", () => {
    const overnight = shiftEvent({
      slotId: "s",
      date: DAY,
      startTime: "23:30",
      endTime: "01:00",
      summary: "לילה",
    });
    assert.ok(overnight.end > overnight.start);
    assert.equal(overnight.end.getTime() - overnight.start.getTime(), 90 * MINUTE);
  });
});

describe("בריחה מתווים מיוחדים", () => {
  it("פסיק, נקודה-פסיק ולוכסן הפוך", () => {
    assert.equal(escapeICSText("א,ב;ג\\ד"), "א\\,ב\\;ג\\\\ד");
  });

  it("שורה חדשה הופכת לרצף \\n", () => {
    assert.equal(escapeICSText("שורה\nשנייה"), "שורה\\nשנייה");
  });

  it("הלוכסן בורח ראשון ולא מכפיל את מה שאחריו", () => {
    // אילו הסדר היה הפוך, "\," היה הופך ל-"\\\," ומתפרש כלוכסן ואז פסיק
    assert.equal(escapeICSText("\\,"), "\\\\\\,");
  });
});

describe("קיפול שורות", () => {
  const longHebrew =
    "SUMMARY:" + "משמרת בפטלינה עם תיאור ארוך במיוחד שנועד לחצות את גבול שבעים וחמישה האוקטטים יותר מפעם אחת".repeat(2);

  it("אף שורה אינה חורגת מ-75 אוקטטים", () => {
    for (const line of foldICSLine(longHebrew).split("\r\n")) {
      assert.ok(
        Buffer.byteLength(line, "utf8") <= 75,
        `שורה באורך ${Buffer.byteLength(line, "utf8")}: ${line}`,
      );
    }
  });

  it("שורות ההמשך מתחילות ברווח", () => {
    const [, ...rest] = foldICSLine(longHebrew).split("\r\n");
    assert.ok(rest.length > 0, "הטקסט אמור להתקפל ליותר משורה אחת");
    for (const line of rest) assert.ok(line.startsWith(" "));
  });

  it("פתיחת הקיפול מחזירה את המקור בדיוק", () => {
    // הבדיקה החזקה: אם הקיפול שבר רצף UTF-8 באמצע, ההשוואה הזו תיכשל
    assert.equal(unfoldICSLine(foldICSLine(longHebrew)), longHebrew);
  });

  it("שורה קצרה נשארת כמות שהיא", () => {
    assert.equal(foldICSLine("VERSION:2.0"), "VERSION:2.0");
  });
});

describe("קובץ iCalendar שלם", () => {
  const events = [
    shiftEvent({
      slotId: "a",
      date: DAY,
      startTime: "07:15",
      endTime: "13:00",
      summary: "משמרת בפטלינה",
      description: "מלצר",
    }),
    shiftEvent({
      slotId: "b",
      date: DAY,
      startTime: "16:30",
      endTime: "23:00",
      summary: "משמרת בפטלינה",
      cancelled: true,
    }),
  ];
  const ics = buildICS(events, new Date(Date.UTC(2026, 7, 17, 9, 0, 0)));

  it("כל שורה מסתיימת ב-CRLF", () => {
    // \n בלי \r נדחה בשקט אצל חלק מהלקוחות
    assert.ok(ics.endsWith("\r\n"));
    assert.equal(ics.split("\n").length - 1, ics.split("\r\n").length - 1);
  });

  it("עטיפת VCALENDAR תקינה", () => {
    assert.ok(ics.startsWith("BEGIN:VCALENDAR\r\n"));
    assert.ok(ics.trimEnd().endsWith("END:VCALENDAR"));
    assert.ok(ics.includes("VERSION:2.0"));
    assert.ok(ics.includes("PRODID:-//Petelina//Shifts//HE"));
  });

  it("BEGIN ו-END של האירועים מזדווגים", () => {
    const begins = ics.split("BEGIN:VEVENT").length - 1;
    const ends = ics.split("END:VEVENT").length - 1;
    assert.equal(begins, 2);
    assert.equal(ends, 2);
  });

  it("בלי METHOD — זה קובץ להורדה ולא הודעת iTIP", () => {
    assert.ok(!ics.includes("METHOD:"));
  });

  it("משמרת שנמסרה מסומנת כמבוטלת", () => {
    assert.ok(ics.includes("STATUS:CANCELLED"));
    assert.equal(ics.split("STATUS:CANCELLED").length - 1, 1);
  });

  it("SEQUENCE עולה עם זמן ההפקה", () => {
    const later = buildICS(events, new Date(Date.UTC(2026, 7, 17, 10, 0, 0)));
    const seq = (s: string) => Number(/SEQUENCE:(\d+)/.exec(s)![1]);
    assert.ok(seq(later) > seq(ics));
  });
});

describe("קישור לגוגל קלנדר", () => {
  const event = shiftEvent({
    slotId: "a",
    date: DAY,
    startTime: "07:15",
    endTime: "13:00",
    summary: "משמרת בפטלינה",
    description: "מלצר",
  });
  const url = new URL(googleCalendarUrl(event));

  it("מצביע על טופס היצירה של גוגל", () => {
    assert.equal(url.origin + url.pathname, "https://calendar.google.com/calendar/render");
    assert.equal(url.searchParams.get("action"), "TEMPLATE");
  });

  it("העברית עוברת מקודדת ומפוענחת חזרה נכון", () => {
    assert.equal(url.searchParams.get("text"), "משמרת בפטלינה");
    assert.equal(url.searchParams.get("details"), "מלצר");
    assert.equal(url.searchParams.get("location"), "פטלינה");
  });

  it("טווח הזמן בפורמט שגוגל מצפה לו", () => {
    const dates = url.searchParams.get("dates")!;
    assert.match(dates, /^\d{8}T\d{6}Z\/\d{8}T\d{6}Z$/);
    assert.equal(dates, `${toICSTimestamp(event.start)}/${toICSTimestamp(event.end)}`);
  });
});

describe("מנוי יומן", () => {
  const now = new Date(Date.UTC(2026, 9, 25, 9, 0, 0));

  it("מנוי נושא שם ליומן ובקשה להתעדכן כל שעה", () => {
    const ics = buildICS([], now, { name: "משמרות פטלינה", refreshHours: 1 });
    assert.ok(ics.includes("X-WR-CALNAME:משמרות פטלינה\r\n"), ics);
    assert.ok(ics.includes("REFRESH-INTERVAL;VALUE=DURATION:PT1H\r\n"), ics);
    assert.ok(ics.includes("X-PUBLISHED-TTL:PT1H\r\n"), ics);
  });

  it("הורדה רגילה — בלי שורות של מנוי", () => {
    const ics = buildICS([], now);
    assert.ok(!ics.includes("X-WR-CALNAME"), ics);
    assert.ok(!ics.includes("REFRESH-INTERVAL"), ics);
  });
});
