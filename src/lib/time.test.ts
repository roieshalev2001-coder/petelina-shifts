import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  addDays,
  dateList,
  defaultDeadlineFor,
  fitSlot,
  formatDate,
  formatDateTime,
  formatDayMonth,
  formatRange,
  fromDateInputValue,
  nextAvailableWeekStart,
  overlaps,
  resolveEnd,
  startOfWeek,
  toDateInputValue,
  toHHMM,
  toMinutes,
  zonedDayOfWeek,
  zonedHour,
  zonedTime,
} from "./time";

describe("בחירת השבוע לפתיחה", () => {
  /*
   * 2026: 12/8 רביעי · 16/8 ראשון · 23/8 ראשון · 30/8 ראשון
   *
   * הכול נבנה ונקרא בשעון ישראל במפורש. הגרסה הקודמת השתמשה ב-`new Date(y,m,d)`
   * וב-`getDay()`, ששניהם עובדים בשעון התהליך — ולכן הבדיקות עברו במחשב
   * ולא אמרו דבר על השרת, שרץ ב-UTC.
   */
  const sunday = (day: number) => zonedTime(2026, 8, day);
  const at = (day: number) => zonedTime(2026, 8, day, 12);

  it("מחזיר תמיד יום ראשון", () => {
    for (const d of [10, 11, 12, 13, 14, 15, 16]) {
      const result = nextAvailableWeekStart([], at(d));
      assert.equal(zonedDayOfWeek(result), 0, `נכשל כשהופעל ב-${d}/8`);
      assert.equal(zonedHour(result), 0, "וחצות בישראל");
    }
  });

  it("בלי שבועות קיימים — מחזיר את ראשון הבא", () => {
    // רביעי 12/8 → השבוע מתחיל 9/8, הבא הוא 16/8
    assert.deepEqual(nextAvailableWeekStart([], at(12)), sunday(16));
  });

  it("אותה תוצאה מכל יום באותו שבוע", () => {
    const fromSunday = nextAvailableWeekStart([], sunday(9));
    const fromWednesday = nextAvailableWeekStart([], at(12));
    const fromSaturday = nextAvailableWeekStart([], at(15));
    assert.deepEqual(fromSunday, sunday(16));
    assert.deepEqual(fromWednesday, sunday(16));
    assert.deepEqual(fromSaturday, sunday(16));
  });

  it("מדלג על שבוע שכבר נפתח", () => {
    const result = nextAvailableWeekStart([sunday(16)], at(12));
    assert.deepEqual(result, sunday(23));
  });

  it("מדלג על רצף שבועות תפוסים", () => {
    const result = nextAvailableWeekStart(
      [sunday(16), sunday(23), sunday(30)],
      at(12),
    );
    assert.deepEqual(result, zonedTime(2026, 9, 6));
  });

  /*
   * הכלל התהפך כאן במכוון.
   *
   * קודם הפונקציה החזירה את יום ראשון הפנוי הקרוב ביותר, ולכן שבוע עתידי
   * שכבר נפתח לא "חסם" את מה שלפניו. בפועל זה הפך למילוי חורים אחורה:
   * רואי מחק שבוע, התאריך התפנה, והכפתור הציע לו לפתוח שוב בדיוק אותו
   * שבוע. היום ההצעה תמיד מתקדמת, והחזרת שבוע שנמחק נעשית מהארכיון.
   */
  it("לא מציע שבוע שמוקדם מהאחרון שקיים", () => {
    const result = nextAvailableWeekStart([sunday(30)], at(12));
    assert.deepEqual(result, zonedTime(2026, 9, 6));
  });

  it("המקרה שרואי נתקל בו: נשאר שבוע אחד עתידי אחרי מחיקה", () => {
    // 1/10/2026 חמישי. קיים רק 11/10 — הראשון הפנוי הוא 4/10, וזה בדיוק
    // השבוע שנמחק ואין להציע אותו שוב.
    const result = nextAvailableWeekStart(
      [zonedTime(2026, 10, 11)],
      zonedTime(2026, 10, 1, 12),
    );
    assert.deepEqual(result, zonedTime(2026, 10, 18));
  });

  it("שבוע ישן שנשאר במסד אינו גורר את ההצעה לעבר", () => {
    const result = nextAvailableWeekStart([sunday(16)], zonedTime(2026, 10, 1, 12));
    assert.deepEqual(result, zonedTime(2026, 10, 4));
  });

  it("המועד האחרון הוא שישי 20:00 שלפני", () => {
    const deadline = defaultDeadlineFor(sunday(16));
    assert.equal(zonedDayOfWeek(deadline), 5, "יום שישי");
    assert.equal(toDateInputValue(deadline), "2026-08-14");
    assert.equal(zonedHour(deadline), 20);
  });
});

describe("המרות זמן", () => {
  it("ממיר בין HH:MM לדקות", () => {
    assert.equal(toMinutes("07:15"), 435);
    assert.equal(toMinutes("00:00"), 0);
    assert.equal(toMinutes("23:00"), 1380);
    assert.equal(toHHMM(435), "07:15");
    assert.equal(toHHMM(1380), "23:00");
  });

  it("פותר CLOSING לשעת הסגירה", () => {
    assert.equal(resolveEnd("CLOSING", "23:00"), "23:00");
    assert.equal(resolveEnd("CLOSING", "17:30"), "17:30");
    assert.equal(resolveEnd("22:15", "23:00"), "22:15");
  });

  it("מציג טווח בסדר RTL כמו בגיליון", () => {
    assert.equal(formatRange("07:15", "15:00"), "15:00 - 07:15");
    assert.equal(formatRange("16:30", "CLOSING"), "עד סגירה - 16:30");
  });

  it("נגיעה בקצה אינה נחשבת חפיפה", () => {
    // משמרת בוקר שמסתיימת ב-15:00 ומשמרת ערב שמתחילה ב-15:00 אינן חופפות
    assert.equal(overlaps({ start: 435, end: 900 }, { start: 900, end: 1335 }), false);
    assert.equal(overlaps({ start: 435, end: 901 }, { start: 900, end: 1335 }), true);
  });
});

describe("fitSlot — פותחים, סוגרים והאמצע הגמיש", () => {
  // המשבצות האמיתיות מהגיליון
  const s0715_1500 = { start: toMinutes("07:15"), end: toMinutes("15:00") };
  const s0900_1600 = { start: toMinutes("09:00"), end: toMinutes("16:00") };
  const s1130_1700 = { start: toMinutes("11:30"), end: toMinutes("17:00") };
  const s1830_2200 = { start: toMinutes("18:30"), end: toMinutes("22:00") };

  it("ללא אילוץ — כל משבצת מתאימה במלואה", () => {
    assert.equal(fitSlot(s1130_1700, {}).kind, "full");
    assert.equal(fitSlot(s0715_1500, {}).kind, "full");
    assert.equal(fitSlot(s0715_1500, {}, { fixedStart: true, fixedEnd: true }).kind, "full");
  });

  it("חלון שמכיל את המשבצת בדיוק הוא התאמה מלאה", () => {
    assert.equal(
      fitSlot(s0715_1500, { earliestStart: "07:15", latestEnd: "15:00" }).kind,
      "full",
    );
  });

  describe("משבצת רגילה — גמישה משני הצדדים", () => {
    it("ירידה מוקדמת מותרת ומסומנת", () => {
      const fit = fitSlot(s0900_1600, { latestEnd: "15:00" });
      assert.equal(fit.kind, "partial");
      assert.equal(fit.kind === "partial" && fit.end, toMinutes("15:00"));
      assert.equal(fit.kind === "partial" && fit.endsEarly, true);
      assert.equal(fit.kind === "partial" && fit.startsLate, false);
      assert.equal(fit.kind === "partial" && fit.missingMinutes, 60);
    });

    it("הגעה מאוחרת מותרת ומסומנת", () => {
      const fit = fitSlot(s1130_1700, { earliestStart: "12:00" });
      assert.equal(fit.kind, "partial");
      assert.equal(fit.kind === "partial" && fit.start, toMinutes("12:00"));
      assert.equal(fit.kind === "partial" && fit.startsLate, true);
      assert.equal(fit.kind === "partial" && fit.endsEarly, false);
    });

    it("קיצור משני הצדדים בבת אחת", () => {
      const fit = fitSlot(s0715_1500, {
        earliestStart: "09:00",
        latestEnd: "14:00",
      });
      assert.equal(fit.kind, "partial");
      assert.equal(fit.kind === "partial" && fit.startsLate, true);
      assert.equal(fit.kind === "partial" && fit.endsEarly, true);
    });
  });

  /*
   * סטייה ממשבצת פותחת או סוגרת אינה פסילה אלא כיסוי חלקי מסומן.
   * הפותר ממילא לא נוגע בכיסוי חלקי, ולכן ההבטחה "לא ישובץ לבד מי שמאחר
   * לפתיחה" נשמרת — ראה הבדיקות ב-solve.test.ts. מה שמושג כאן: אחמ״ש
   * שיכול להגיע ב-09:00 יכול לרשום את זה, והמנהל מחליט.
   */
  describe("משבצת פותחת — איחור הוא כיסוי חלקי עם אזהרה", () => {
    const opener = { fixedStart: true };

    it("הגעה מאוחרת הופכת לכיסוי חלקי ומסומנת כשוברת פתיחה", () => {
      const fit = fitSlot(s0715_1500, { earliestStart: "09:00" }, opener);
      assert.equal(fit.kind, "partial");
      assert.equal(fit.kind === "partial" && fit.breaksOpening, true);
      assert.equal(fit.kind === "partial" && fit.breaksClosing, false);
      assert.equal(fit.kind === "partial" && fit.start, toMinutes("09:00"));
    });

    it("ירידה מוקדמת בה אינה שוברת את הפתיחה", () => {
      const fit = fitSlot(s0715_1500, { latestEnd: "13:00" }, opener);
      assert.equal(fit.kind, "partial");
      assert.equal(fit.kind === "partial" && fit.start, toMinutes("07:15"));
      assert.equal(fit.kind === "partial" && fit.breaksOpening, false);
    });
  });

  describe("משבצת סוגרת — ירידה מוקדמת היא כיסוי חלקי עם אזהרה", () => {
    const closer = { fixedEnd: true };

    it("ירידה מוקדמת הופכת לכיסוי חלקי ומסומנת כשוברת סגירה", () => {
      // 11:30–16:00 הן 4.5 שעות, מעל המינימום
      const fit = fitSlot(s1130_1700, { latestEnd: "16:00" }, closer);
      assert.equal(fit.kind, "partial");
      assert.equal(fit.kind === "partial" && fit.breaksClosing, true);
      assert.equal(fit.kind === "partial" && fit.breaksOpening, false);
      assert.equal(fit.kind === "partial" && fit.end, toMinutes("16:00"));
    });

    it("המינימום של 4 שעות גובר על האזהרה — נשאר פסול", () => {
      // 11:30–15:00 הן 3.5 שעות. גם משבצת סוגרת לא הופכת אותן לאפשרות:
      // הרכות מאפשרת אילוץ, היא לא מבטלת את רצפת אורך המשמרת.
      const fit = fitSlot(s1130_1700, { latestEnd: "15:00" }, closer);
      assert.equal(fit.kind, "none");
      assert.equal(fit.kind === "none" && fit.reason, "too-short");
    });

    it("הגעה מאוחרת בה אינה שוברת את הסגירה", () => {
      const fit = fitSlot(s1130_1700, { earliestStart: "12:30" }, closer);
      assert.equal(fit.kind, "partial");
      assert.equal(fit.kind === "partial" && fit.end, toMinutes("17:00"));
      assert.equal(fit.kind === "partial" && fit.breaksClosing, false);
    });
  });

  it("משבצת ללא דגלים לא מסמנת שבירה בכלל", () => {
    const fit = fitSlot(s0715_1500, { earliestStart: "09:00" });
    assert.equal(fit.kind, "partial");
    assert.equal(fit.kind === "partial" && fit.breaksOpening, false);
    assert.equal(fit.kind === "partial" && fit.breaksClosing, false);
  });

  describe("מינימום 4 שעות", () => {
    it("שיבוץ שנשארות בו פחות מ-4 שעות נפסל", () => {
      // מגיע ב-14:00 למשבצת שמסתיימת ב-17:00 = 3 שעות
      const fit = fitSlot(s1130_1700, { earliestStart: "14:00" });
      assert.equal(fit.kind, "none");
      assert.equal(fit.kind === "none" && fit.reason, "too-short");
    });

    it("בדיוק 4 שעות עובר", () => {
      const fit = fitSlot(s1130_1700, { earliestStart: "13:00" });
      assert.equal(fit.kind, "partial");
    });

    it("משבצת שקצרה מלכתחילה מ-4 שעות תקפה כהתאמה מלאה", () => {
      // 18:30-22:00 היא 3.5 שעות — המינימום חל על קיצור, לא על המשבצת עצמה
      assert.equal(fitSlot(s1830_2200, {}).kind, "full");
    });

    it("אבל כל סטייה במשבצת קצרה כזו נפסלת", () => {
      const fit = fitSlot(s1830_2200, { earliestStart: "19:00" });
      assert.equal(fit.kind, "none");
      assert.equal(fit.kind === "none" && fit.reason, "too-short");
    });
  });

  it("חלון שלא נוגע במשבצת כלל נפסל", () => {
    const fit = fitSlot(s0715_1500, { earliestStart: "16:00" });
    assert.equal(fit.kind, "none");
    assert.equal(fit.kind === "none" && fit.reason, "no-overlap");
  });

  it("אורך המינימום ניתן לשינוי", () => {
    const fit = fitSlot(s1130_1700, { earliestStart: "14:00" }, { minShiftMinutes: 120 });
    assert.equal(fit.kind, "partial");
  });
});

/**
 * הרגרסיה האמיתית שהתיקון הזה שומר עליה: המכולה בפריסה רצה ב-UTC, ואז
 * מועד אחרון של 23:00 הוצג לעובדים כ-20:00. הבדיקות כאן רצות על רגע קבוע
 * ב-UTC ולכן נכשלות אם מישהו יסיר את קיבוע אזור הזמן מהפורמטרים.
 */
describe("תצוגת תאריכים מקובעת לשעון ישראל", () => {
  // 19/8/2026 20:00 UTC = 23:00 בישראל (שעון קיץ, UTC+3)
  const instant = new Date("2026-08-19T20:00:00.000Z");

  it("שעה מוצגת בשעון ישראל ולא בשעון השרת", () => {
    assert.match(formatDateTime(instant), /23:00/);
  });

  it("תאריך מוצג בשעון ישראל", () => {
    assert.match(formatDate(instant), /19/);
  });

  it("חצות UTC לא נדחף ליום הקודם", () => {
    // 23/8 00:00 UTC הוא 03:00 בישראל — אותו יום, לא ה-22
    assert.equal(formatDayMonth(new Date("2026-08-23T00:00:00.000Z")), "23/8");
  });
});

/*
 * השעון של השרת.
 *
 * הבדיקות האלה נכשלות אם מישהו יחזיר setHours/getHours לחישובי התאריכים.
 * הן אינן תלויות ב-TZ של התהליך בכוונה — זו כל הנקודה — ולכן `npm test`
 * ו-`TZ=UTC npm test` חייבים לתת אותה תוצאה בדיוק.
 *
 * הראיה שזה לא תיאורטי: בייצור weekStart נשמר כ-2026-08-23T00:00:00.000Z,
 * כלומר 03:00 בישראל, למרות ש-TZ=Asia/Jerusalem מוגדר ב-.env.
 */
describe("בנייה בשעון ישראל ולא בשעון התהליך", () => {
  it("חצות בישראל בקיץ היא 21:00Z של היום הקודם", () => {
    assert.equal(
      zonedTime(2026, 8, 23).toISOString(),
      "2026-08-22T21:00:00.000Z",
    );
  });

  it("ובחורף 22:00Z, כי ההיסט משתנה", () => {
    assert.equal(
      zonedTime(2026, 1, 15).toISOString(),
      "2026-01-14T22:00:00.000Z",
    );
  });

  it("startOfWeek מחזיר חצות ישראלית של יום ראשון", () => {
    const start = startOfWeek(new Date("2026-08-26T12:00:00Z"));
    assert.equal(start.toISOString(), "2026-08-22T21:00:00.000Z");
    assert.equal(zonedDayOfWeek(start), 0);
    assert.equal(zonedHour(start), 0);
  });

  it("שבוע ששמור בטעות בחצות UTC עדיין נקרא כיום הנכון", () => {
    // הערך שקיים היום בייצור: 03:00 בישראל ב-23/8
    const stored = new Date("2026-08-23T00:00:00.000Z");
    assert.equal(toDateInputValue(stored), "2026-08-23");
    assert.equal(zonedDayOfWeek(stored), 0, "ראשון");
  });

  it("addDays מזיז ימים קלנדריים ולא 24 שעות", () => {
    // מעבר שעון קיץ בישראל 2026: שעון החורף נכנס ב-25/10
    const before = zonedTime(2026, 10, 24, 12);
    const after = addDays(before, 2);
    assert.equal(toDateInputValue(after), "2026-10-26");
    assert.equal(zonedHour(after), 12, "שעת הקיר נשמרת גם כשהיממה אינה 24 שעות");
  });

  it("המועד האחרון הוא 20:00 בישראל, לא 20:00Z", () => {
    const deadline = defaultDeadlineFor(zonedTime(2026, 8, 23));
    assert.equal(zonedHour(deadline), 20);
    assert.equal(deadline.toISOString(), "2026-08-21T17:00:00.000Z");
  });

  it("הלוך-חזור דרך שדה תאריך אינו מזיז את היום", () => {
    for (const day of ["2026-01-01", "2026-08-23", "2026-10-25", "2026-12-31"]) {
      assert.equal(toDateInputValue(fromDateInputValue(day)), day, day);
    }
  });
});

/*
 * הבאג שזה מקבע: התראת סבב שישי הציגה "שובצת ל: 18/9 ,28/8" — הסדר
 * הנכון נשלח, אבל תאריך הוא ריצת LTR והפסיקים הנייטרליים ביניהם צירפו
 * את כל הרשימה לריצה אחת שמוצגת הפוך בתוך משפט עברי.
 *
 * 25 עובדים קיבלו את הגרסה ההפוכה לפני שזה נתפס.
 */
describe("רשימת תאריכים בתוך טקסט עברי", () => {
  const FSI = "⁨";
  const PDI = "⁩";

  it("כל תאריך מבודד, כך שהרשימה נקראת בסדר שנשלח", () => {
    const out = dateList([zonedTime(2026, 8, 28), zonedTime(2026, 9, 18)]);
    assert.equal(out, `${FSI}28/8${PDI}, ${FSI}18/9${PDI}`);
  });

  it("תאריך יחיד מבודד ובלי מפריד", () => {
    const out = dateList([zonedTime(2026, 9, 4)]);
    assert.equal(out, `${FSI}4/9${PDI}`);
    assert.ok(!out.includes(","));
  });

  it("רשימה ריקה היא מחרוזת ריקה", () => {
    assert.equal(dateList([]), "");
  });

  /*
   * הסדר הלוגי הוא מה שנשמר — הבידוד אינו ממיין. אם מישהו יחליף אותו
   * ב-reverse "כדי שייראה נכון", זה ייפול.
   */
  it("אינו משנה את סדר הפריטים", () => {
    const out = dateList([zonedTime(2026, 9, 25), zonedTime(2026, 8, 28)]);
    assert.ok(out.indexOf("25/9") < out.indexOf("28/8"));
  });
});
