import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  FRIDAY_LIMIT_LABEL,
  isFridayLimit,
  matchRotationToSlots,
  monthlyCap,
  nextFridays,
  offSiteFridayCounts,
  plannedAheadCounts,
  planFridays,
  rotationPeriods,
  type RotationPerson,
  type RotationSlot,
  type SeedSlot,
} from "./fridays";
import { toDateInputValue, zonedTime } from "./time";

function person(
  id: string,
  opts: Partial<RotationPerson> = {},
): RotationPerson {
  return {
    id,
    fullName: id,
    roles: ["waiter"],
    fridayLimit: "unlimited",
    worked: 0,
    closed: 0,
    ...opts,
  };
}

/** ארבעה שישיים, שתי משבצות מלצר רגילות בכל אחד */
function month(fridays: string[], perFriday = 2, role = "waiter"): RotationSlot[] {
  return fridays.flatMap((date) =>
    Array.from({ length: perFriday }, (_, i) => ({
      date,
      role,
      isClosing: false,
      position: i + 1,
    })),
  );
}

/** משבצות סגירה, אחת או יותר לכל שישי */
/** משבצות סגירה — האחרונות בתבנית, ולכן המיקומים הגבוהים */
function closing(fridays: string[], perFriday = 2, role = "waiter"): RotationSlot[] {
  return fridays.flatMap((date) =>
    Array.from({ length: perFriday }, (_, i) => ({
      date,
      role,
      isClosing: true,
      position: 100 + i,
    })),
  );
}

const FRIDAYS = ["2026-09-04", "2026-09-11", "2026-09-18", "2026-09-25"];

describe("מדרגות הפטור", () => {
  it("כל מדרגה ממופה למכסה חודשית", () => {
    assert.equal(monthlyCap("none"), 0);
    assert.equal(monthlyCap("one"), 1);
    assert.equal(monthlyCap("two"), 2);
    assert.equal(monthlyCap("unlimited"), null);
  });

  it("ערך לא מוכר נופל ל'בלי הגבלה' ולא מפיל", () => {
    assert.equal(isFridayLimit("bogus"), false);
    assert.equal(monthlyCap("bogus"), null);
  });

  it("לכל מדרגה יש תווית בעברית", () => {
    for (const key of Object.keys(FRIDAY_LIMIT_LABEL)) {
      assert.ok(FRIDAY_LIMIT_LABEL[key as keyof typeof FRIDAY_LIMIT_LABEL].length > 0);
    }
  });
});

describe("בניית הסבב", () => {
  it("מי שפטור לגמרי לא משובץ אף פעם", () => {
    const { entries } = planFridays({
      slots: month(FRIDAYS),
      people: [person("א", { fridayLimit: "none" }), person("ב"), person("ג")],
    });
    assert.equal(entries.filter((e) => e.employeeId === "א").length, 0);
  });

  it("'פעם בחודש' מקבל בדיוק אחד", () => {
    const { entries } = planFridays({
      slots: month(FRIDAYS),
      people: [person("א", { fridayLimit: "one" }), person("ב"), person("ג")],
    });
    assert.equal(entries.filter((e) => e.employeeId === "א").length, 1);
  });

  it("'פעמיים בחודש' מקבל לכל היותר שניים", () => {
    const { entries } = planFridays({
      slots: month(FRIDAYS),
      people: [person("א", { fridayLimit: "two" }), person("ב"), person("ג")],
    });
    assert.ok(entries.filter((e) => e.employeeId === "א").length <= 2);
  });

  it("מי שעבד פחות שישיים מקבל קודם", () => {
    const { entries } = planFridays({
      slots: month([FRIDAYS[0]], 1),
      people: [
        person("ותיק", { worked: 9 }),
        person("חדש", { worked: 1 }),
        person("בינוני", { worked: 5 }),
      ],
    });
    assert.equal(entries[0].employeeId, "חדש");
  });

  it("אותו אדם לא מקבל שתי משבצות באותו שישי", () => {
    const { entries } = planFridays({
      slots: month([FRIDAYS[0]], 3),
      people: [person("א"), person("ב"), person("ג")],
    });
    const ids = entries.map((e) => e.employeeId);
    assert.equal(new Set(ids).size, ids.length);
  });

  it("שני הסבבים אינם מתערבבים בין תפקידים", () => {
    const { entries } = planFridays({
      slots: [...month([FRIDAYS[0]], 1, "waiter"), ...month([FRIDAYS[0]], 1, "bartender")],
      people: [
        person("מלצר", { roles: ["waiter"] }),
        person("ברמן", { roles: ["bartender"] }),
      ],
    });
    assert.deepEqual(
      entries.map((e) => `${e.role}:${e.employeeId}`).sort(),
      ["bartender:ברמן", "waiter:מלצר"],
    );
  });

  it("משבצת שאין לה מועמד מדווחת ולא נעלמת", () => {
    const { entries, unfilled } = planFridays({
      slots: month([FRIDAYS[0]], 2),
      people: [person("יחיד")],
    });
    assert.equal(entries.length, 1);
    assert.equal(unfilled.length, 1, "השנייה נשארה בלי איש");
  });

  it("שיבוץ ידני נשמר, ונספר במכסה", () => {
    const { entries } = planFridays({
      slots: month([FRIDAYS[0]], 2),
      people: [person("א", { fridayLimit: "one" }), person("ב"), person("ג")],
      locked: [
        { date: FRIDAYS[0], role: "waiter", isClosing: false, position: 1, employeeId: "א" },
      ],
    });
    assert.equal(entries.filter((e) => e.employeeId === "א").length, 1);
    assert.equal(entries.length, 2, "המשבצת השנייה אוישה אוטומטית");
  });

  it("אותו קלט מייצר אותה תוכנית", () => {
    const input = {
      slots: month(FRIDAYS),
      people: [person("א"), person("ב"), person("ג"), person("ד")],
    };
    assert.deepEqual(planFridays(input).entries, planFridays(input).entries);
  });
});

/*
 * זו הבדיקה שבאמת חשובה: סבב יכול להיראות הוגן בחודש אחד ולהתקבע על אותם
 * אנשים לאורך זמן. שלושה חודשים רצופים, כשההיסטוריה מתעדכנת ביניהם.
 */
describe("הוגנות לאורך שלושה חודשים", () => {
  it("החלוקה מתיישרת ולא מתקבעת", () => {
    const people = ["א", "ב", "ג", "ד", "ה"].map((id) => person(id));
    const months = [
      ["2026-09-04", "2026-09-11", "2026-09-18", "2026-09-25"],
      ["2026-10-02", "2026-10-09", "2026-10-16", "2026-10-23"],
      ["2026-11-06", "2026-11-13", "2026-11-20", "2026-11-27"],
    ];

    for (const fridays of months) {
      const { entries } = planFridays({ slots: month(fridays), people });
      for (const e of entries) {
        people.find((p) => p.id === e.employeeId)!.worked++;
      }
    }

    const counts = people.map((p) => p.worked);
    const spread = Math.max(...counts) - Math.min(...counts);
    assert.ok(
      spread <= 1,
      `הפער בין מי שעבד הכי הרבה להכי מעט הוא ${spread}: ${people.map((p) => `${p.id}=${p.worked}`).join(" ")}`,
    );
  });
});

/*
 * סגירה בשישי היא סבב בתוך סבב.
 *
 * לא מספיק שהשישיים יתחלקו בהוגנות: אפשר לחלק שישיים שווה בשווה ועדיין
 * להשאיר את אותם שניים סוגרים כל שבוע, וזה בדיוק מה שרואי ביקש למנוע.
 */
describe("סבב הסגירה", () => {
  /* הרשאת הסגירה בוטלה — כל מי שבסבב יכול לסגור, וזה מקובע כאן */
  it("כל מי שבסבב יכול לסגור", () => {
    const { entries, unfilled } = planFridays({
      slots: closing([FRIDAYS[0]], 1),
      people: [person("כלשהו")],
    });
    assert.equal(entries.length, 1);
    assert.equal(unfilled.length, 0);
  });

  it("מי שסגר פחות סוגר קודם — גם אם עבד יותר שישיים", () => {
    const { entries } = planFridays({
      slots: closing([FRIDAYS[0]], 1),
      people: [
        person("סוגר-הרבה", { closed: 8, worked: 0 }),
        person("סוגר-מעט", { closed: 1, worked: 20 }),
      ],
    });
    assert.equal(entries[0].employeeId, "סוגר-מעט");
  });

  it("הזוג שסוגר מתחלף משישי לשישי", () => {
    const { entries } = planFridays({
      slots: closing(FRIDAYS.slice(0, 2), 2),
      people: ["א", "ב", "ג", "ד"].map((id) => person(id)),
    });
    const first = entries.filter((e) => e.date === FRIDAYS[0]).map((e) => e.employeeId);
    const second = entries.filter((e) => e.date === FRIDAYS[1]).map((e) => e.employeeId);
    assert.equal(first.length, 2);
    assert.equal(second.length, 2);
    assert.equal(
      first.filter((id) => second.includes(id)).length,
      0,
      `אותם אנשים סגרו פעמיים: ${first} מול ${second}`,
    );
  });

  it("הסגירה מחולקת לפני המשבצות הרגילות", () => {
    /*
     * אדם אחד, שתי משבצות. אם הרגילה תתמלא ראשונה היא תבלע אותו
     * והסגירה תישאר ריקה — ולסגירה יש קדימות, כי מי שיסגור נקבע לפי
     * מונה הסגירות ולא לפי מונה השישיים.
     */
    const { entries, unfilled } = planFridays({
      slots: [...month([FRIDAYS[0]], 1), ...closing([FRIDAYS[0]], 1)],
      people: [person("היחיד")],
    });
    assert.equal(entries.length, 1);
    assert.equal(entries[0].isClosing, true, "הסגירה קיבלה אותו");
    assert.equal(unfilled[0].isClosing, false, "הרגילה היא זו שנשארה");
  });

  it("מכסת השישיים חלה גם על סגירה", () => {
    const { entries } = planFridays({
      slots: closing(FRIDAYS, 1),
      people: [person("מוגבל", { fridayLimit: "one" }), person("רגיל")],
    });
    assert.equal(entries.filter((e) => e.employeeId === "מוגבל").length, 1);
  });
});

describe("הוגנות הסגירה לאורך שלושה חודשים", () => {
  it("גם השישיים וגם הסגירות מתיישרים", () => {
    const people = ["א", "ב", "ג", "ד", "ה", "ו"].map((id) => person(id));
    const months = [
      ["2026-09-04", "2026-09-11", "2026-09-18", "2026-09-25"],
      ["2026-10-02", "2026-10-09", "2026-10-16", "2026-10-23"],
      ["2026-11-06", "2026-11-13", "2026-11-20", "2026-11-27"],
    ];

    for (const fridays of months) {
      // כל שישי: שתי משבצות רגילות ושתי סגירות
      const { entries } = planFridays({
        slots: [...month(fridays, 2), ...closing(fridays, 2)],
        people,
      });
      for (const e of entries) {
        const p = people.find((x) => x.id === e.employeeId)!;
        p.worked++;
        if (e.isClosing) p.closed++;
      }
    }

    const workedSpread =
      Math.max(...people.map((p) => p.worked)) - Math.min(...people.map((p) => p.worked));
    const closedSpread =
      Math.max(...people.map((p) => p.closed)) - Math.min(...people.map((p) => p.closed));

    assert.ok(workedSpread <= 1, `פער בשישיים: ${workedSpread}`);
    assert.ok(
      closedSpread <= 1,
      `פער בסגירות: ${closedSpread} — ${people.map((p) => `${p.id}=${p.closed}`).join(" ")}`,
    );
  });
});

/*
 * מדרגת הפטור היא מכסה **חודשית**, אבל הסבב נבנה על אופק של שמונה
 * שישיים שחוצה את גבול החודש. מונה יחיד על כל האופק היה הופך את
 * "פעם בחודש" ל"פעם בחודשיים" — כלומר מעניק פטור כפול ממה שנקבע.
 */
describe("המכסה חודשית, גם באופק חוצה־חודשים", () => {
  const CROSS = [
    "2026-09-04", "2026-09-11", "2026-09-18", "2026-09-25",
    "2026-10-02", "2026-10-09", "2026-10-16", "2026-10-23",
  ];

  it("'פעם בחודש' מקבל אחד בכל חודש ולא אחד לאופק", () => {
    const { entries } = planFridays({
      slots: month(CROSS, 1),
      people: [person("מוגבל", { fridayLimit: "one" }), person("א"), person("ב")],
    });
    const mine = entries.filter((e) => e.employeeId === "מוגבל").map((e) => e.date);
    const perMonth = new Map<string, number>();
    for (const d of mine) perMonth.set(d.slice(0, 7), (perMonth.get(d.slice(0, 7)) ?? 0) + 1);

    assert.equal(mine.length, 2, `קיבל ${mine.length} במקום אחד בכל חודש: ${mine}`);
    assert.deepEqual([...perMonth.values()], [1, 1]);
  });

  it("'פעמיים בחודש' מקבל לכל היותר שניים בכל חודש", () => {
    const { entries } = planFridays({
      slots: month(CROSS, 1),
      people: [person("מוגבל", { fridayLimit: "two" }), person("א")],
    });
    const perMonth = new Map<string, number>();
    for (const e of entries.filter((x) => x.employeeId === "מוגבל")) {
      const k = e.date.slice(0, 7);
      perMonth.set(k, (perMonth.get(k) ?? 0) + 1);
    }
    for (const [k, n] of perMonth) assert.ok(n <= 2, `${k}: ${n}`);
  });
});

describe("אופק השישיים", () => {
  it("מחזיר את N השישיים הבאים ברצף", () => {
    // רביעי, 19.8.2026
    const from = new Date(Date.UTC(2026, 7, 19, 9, 0));
    const got = nextFridays(8, from).map((d) => toDateInputValue(d));
    assert.deepEqual(got, [
      "2026-08-21", "2026-08-28", "2026-09-04", "2026-09-11",
      "2026-09-18", "2026-09-25", "2026-10-02", "2026-10-09",
    ]);
  });

  it("שישי עצמו נכלל ואינו מדולג", () => {
    const friday = new Date(Date.UTC(2026, 7, 28, 9, 0));
    assert.equal(toDateInputValue(nextFridays(1, friday)[0]), "2026-08-28");
  });

  it("האופק חוצה גבול שנה", () => {
    const dec = new Date(Date.UTC(2026, 11, 25, 9, 0));
    const got = nextFridays(3, dec).map((d) => toDateInputValue(d));
    assert.deepEqual(got, ["2026-12-25", "2027-01-01", "2027-01-08"]);
  });
});

/*
 * הכלל שכל הסבב עומד עליו: הסדר שבו העובדים רשומים הוא סדר ההגעה,
 * ולכן השניים האחרונים סוגרים. הבדיקות כאן משתמשות בצורת התבנית
 * האמיתית של פטלינה — תשע משבצות מלצר, ששתי האחרונות "עד סגירה".
 */
describe("התאמת הסבב למשבצות", () => {
  /** תשע משבצות מלצר, ממוינות לפי שעת התחלה כמו בתבנית */
  const WAITER_SLOTS: SeedSlot[] = [
    { id: "07:15", role: "waiter", isClosing: false },
    { id: "07:45", role: "waiter", isClosing: false },
    { id: "08:15", role: "waiter", isClosing: false },
    { id: "08:45a", role: "waiter", isClosing: false },
    { id: "08:45b", role: "waiter", isClosing: false },
    { id: "09:15", role: "waiter", isClosing: false },
    { id: "09:45", role: "waiter", isClosing: false },
    { id: "10:00a", role: "waiter", isClosing: true },
    { id: "10:00b", role: "waiter", isClosing: true },
  ];

  const at = (position: number | null, isClosing = false) => ({
    role: "waiter",
    isClosing,
    position,
  });

  it("מיקום i נכנס למשבצת ה-i", () => {
    const { pairs } = matchRotationToSlots([at(1), at(3), at(7)], WAITER_SLOTS);
    assert.deepEqual(
      pairs.map((p) => p.slotId),
      ["07:15", "08:15", "09:45"],
    );
  });

  /* זו הבדיקה שרואי תיאר במילים שלו */
  it("השניים האחרונים הם הסגירה, בלי שנאמר להם", () => {
    const nine = Array.from({ length: 9 }, (_, i) => at(i + 1));
    const { pairs, unmatched } = matchRotationToSlots(nine, WAITER_SLOTS);
    assert.deepEqual(unmatched, []);
    const closers = pairs.filter((p) => {
      const slot = WAITER_SLOTS.find((s) => s.id === p.slotId)!;
      return slot.isClosing;
    });
    assert.deepEqual(
      closers.map((c) => c.entry.position),
      [8, 9],
      "רק המיקומים האחרונים נחתו על משבצות הסגירה",
    );
  });

  it("מיקום מחוץ לטווח מדווח ואינו נבלע", () => {
    const { pairs, unmatched } = matchRotationToSlots([at(1), at(12)], WAITER_SLOTS);
    assert.equal(pairs.length, 1);
    assert.deepEqual(unmatched.map((e) => e.position), [12]);
  });

  it("שני שיבוצים על אותו מיקום — השני מדווח ולא דורס", () => {
    const { pairs, unmatched } = matchRotationToSlots([at(2), at(2)], WAITER_SLOTS);
    assert.equal(pairs.length, 1);
    assert.equal(unmatched.length, 1);
  });

  it("תפקידים אינם מתערבבים", () => {
    const slots: SeedSlot[] = [
      ...WAITER_SLOTS,
      { id: "bar1", role: "bartender", isClosing: false },
      { id: "bar2", role: "bartender", isClosing: true },
    ];
    const { pairs } = matchRotationToSlots(
      [{ role: "bartender", isClosing: true, position: 2 }],
      slots,
    );
    assert.deepEqual(pairs.map((p) => p.slotId), ["bar2"]);
  });

  /*
   * שורות שנוצרו לפני עמודת המיקום. הן חייבות להמשיך לעבוד — הן קיימות
   * בייצור — אבל אסור להן לתפוס משבצת ששייכת למישהו עם מיקום מפורש.
   */
  it("שורה בלי מיקום מקבלת מה שנשאר, ולא גוזלת ממיקום מפורש", () => {
    const { pairs, unmatched } = matchRotationToSlots(
      [at(null), at(1)],
      WAITER_SLOTS,
    );
    assert.deepEqual(unmatched, []);
    const byPosition = new Map(pairs.map((p) => [p.entry.position, p.slotId]));
    assert.equal(byPosition.get(1), "07:15", "המפורש קיבל את שלו");
    assert.notEqual(byPosition.get(null), "07:15");
  });

  it("שורה ישנה עם סגירה נוחתת על משבצת סגירה", () => {
    const { pairs } = matchRotationToSlots([at(null, true)], WAITER_SLOTS);
    assert.equal(pairs[0].slotId, "10:00a");
  });
});

describe("שישיים מחוץ לאתר בהיסטוריה של הסבב", () => {
  // השבוע היחיד באתר מתחיל בראשון 11/10, והיום רביעי 7/10
  const weekStarts = [zonedTime(2026, 10, 11)];
  const today = zonedTime(2026, 10, 7);
  const row = (day: number, employeeId: string, extra: { source?: string; isClosing?: boolean } = {}) => ({
    date: zonedTime(2026, 10, day),
    employeeId,
    isClosing: extra.isClosing ?? false,
    source: extra.source ?? "manual",
  });

  it("שישי שעבר בלי שבוע באתר נספר", () => {
    const { worked } = offSiteFridayCounts({ rows: [row(2, "a")], weekStarts, today });
    assert.equal(worked.get("a"), 1);
  });

  it("שורה אוטומטית אינה עדות למה שקרה — לא נספרת", () => {
    const { worked } = offSiteFridayCounts({
      rows: [row(2, "a", { source: "auto" })],
      weekStarts,
      today,
    });
    assert.equal(worked.get("a"), undefined);
  });

  it("שישי שעוד לא הגיע לא נספר", () => {
    const { worked } = offSiteFridayCounts({ rows: [row(9, "a")], weekStarts, today });
    assert.equal(worked.get("a"), undefined);
  });

  it("שישי שיש לו שבוע באתר נספר מהשיבוצים ולא מכאן — אחרת היה נספר פעמיים", () => {
    const { worked } = offSiteFridayCounts({
      rows: [row(16, "a")],
      weekStarts,
      today: zonedTime(2026, 10, 20),
    });
    assert.equal(worked.get("a"), undefined);
  });

  it("סגירה נספרת בנפרד", () => {
    const { worked, closed } = offSiteFridayCounts({
      rows: [row(2, "a", { isClosing: true }), row(2, "b")],
      weekStarts,
      today,
    });
    assert.equal(worked.get("a"), 1);
    assert.equal(closed.get("a"), 1);
    assert.equal(closed.get("b"), undefined);
  });
});

describe("תקופות של 8 שישיים", () => {
  const keys = (dates: Date[]) => dates.map((d) => toDateInputValue(d));

  it("לפני 23/10: הנוכחית היא התמונה של רואי, והבאה מתחילה ב-18/12", () => {
    // רביעי 21/10/2026
    const { current, next } = rotationPeriods(new Date(Date.UTC(2026, 9, 21, 9)));
    assert.deepEqual(keys(current), [
      "2026-10-23", "2026-10-30", "2026-11-06", "2026-11-13",
      "2026-11-20", "2026-11-27", "2026-12-04", "2026-12-11",
    ]);
    assert.equal(keys(next)[0], "2026-12-18");
    assert.equal(keys(next)[7], "2027-02-05");
  });

  it("השישי האחרון של התקופה עדיין שייך אליה", () => {
    const { current } = rotationPeriods(new Date(Date.UTC(2026, 11, 11, 9)));
    assert.equal(keys(current)[0], "2026-10-23");
  });

  it("למחרת — הבאה הופכת לנוכחית", () => {
    const { current, next } = rotationPeriods(new Date(Date.UTC(2026, 11, 12, 9)));
    assert.equal(keys(current)[0], "2026-12-18");
    assert.equal(keys(next)[0], "2027-02-12");
  });

  it("כל תקופה היא 8 שישיים רצופים", () => {
    const { current, next } = rotationPeriods(new Date(Date.UTC(2027, 3, 1, 9)));
    const all = [...current, ...next];
    assert.equal(all.length, 16);
    for (let i = 1; i < all.length; i++) {
      assert.equal(Math.round((all[i].getTime() - all[i - 1].getTime()) / 86_400_000), 7);
    }
  });

  it("תאריך שלפני העוגן נופל בתקופה הקודמת, לא נשבר", () => {
    const { current } = rotationPeriods(new Date(Date.UTC(2026, 9, 1, 9)));
    assert.equal(keys(current)[7], "2026-10-16");
  });
});

describe("סידור אוטומטי אקראי", () => {
  const input = {
    slots: month(FRIDAYS),
    people: ["א", "ב", "ג", "ד", "ה", "ו", "ז", "ח"].map((id) => person(id)),
  };

  it("בלי random — אותה תוכנית כמו קודם", () => {
    assert.deepEqual(planFridays(input).entries, planFridays(input).entries);
  });

  it("עם random — תוכניות שונות, הוגנות באותה מידה", () => {
    // מחולל קבוע כדי שהבדיקה עצמה תהיה יציבה
    const seeded = (seed: number) => () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
    const a = planFridays({ ...input, random: seeded(1) }).entries;
    const b = planFridays({ ...input, random: seeded(7) }).entries;
    assert.notDeepEqual(a.map((e) => e.employeeId), b.map((e) => e.employeeId));
    // 8 משבצות ל-8 אנשים: כל אחד בדיוק פעם אחת, בשתי ההרצות
    for (const run of [a, b]) {
      const counts = new Map<string, number>();
      for (const e of run) counts.set(e.employeeId, (counts.get(e.employeeId) ?? 0) + 1);
      assert.deepEqual([...counts.values()], Array(8).fill(1));
    }
  });
});

describe("שישיים מתוכננים נספרים בתקופה הבאה", () => {
  const today = zonedTime(2026, 10, 21);
  const before = zonedTime(2026, 12, 18);
  const row = (y: number, m: number, d: number, employeeId: string, isClosing = false) => ({
    date: zonedTime(y, m, d),
    employeeId,
    isClosing,
  });

  it("נספר רק מה שבין היום לתחילת התקופה, ושאין לו שבוע באתר", () => {
    const { worked, closed } = plannedAheadCounts({
      rows: [
        row(2026, 10, 16, "past"), // עבר — כבר בהיסטוריה
        row(2026, 10, 23, "inWeek"), // יש לו שבוע — נספר דרך השיבוצים
        row(2026, 11, 6, "dana", true),
        row(2026, 11, 13, "dana"),
        row(2026, 12, 18, "next"), // התקופה עצמה
      ],
      weekStarts: [zonedTime(2026, 10, 18)],
      today,
      before,
    });
    assert.deepEqual([...worked.entries()], [["dana", 2]]);
    assert.deepEqual([...closed.entries()], [["dana", 1]]);
  });
});
