import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { toMinutes } from "../time";
import { solve } from "./solve";
import type {
  SolverAvailability,
  SolverEmployee,
  SolverInput,
  SolverSlot,
} from "./types";

// ---------------------------------------------------------------------------
// עזרי בנייה
// ---------------------------------------------------------------------------

function slot(
  id: string,
  dayIndex: number,
  start: string,
  end: string,
  opts: Partial<SolverSlot> = {},
): SolverSlot {
  return {
    id,
    dayIndex,
    dayOfWeek: dayIndex,
    role: "waiter",
    period: "morning",
    start: toMinutes(start),
    end: toMinutes(end),
    isClosing: false,
    fixedStart: false,
    fixedEnd: false,
    standby: false,
    sortOrder: 0,
    ...opts,
  };
}

function employee(id: string, opts: Partial<SolverEmployee> = {}): SolverEmployee {
  return {
    id,
    fullName: id,
    roles: ["waiter"],
    requiredShifts: 0,
    maxShifts: 6,
    seniority: 3,
    preferredPeriod: null,
    ...opts,
  };
}

function avail(
  employeeId: string,
  slotId: string,
  opts: Partial<SolverAvailability> = {},
): SolverAvailability {
  return {
    employeeId,
    slotId,
    state: "available",
    earliestStart: null,
    latestEnd: null,
    ...opts,
  };
}

function run(input: Partial<SolverInput> & Pick<SolverInput, "slots" | "employees">) {
  return solve({
    availabilities: [],
    constraints: [],
    pinned: [],
    options: { timeBudgetMs: 500 },
    ...input,
  });
}

// ---------------------------------------------------------------------------

describe("שיבוץ בסיסי", () => {
  it("משבץ עובד למשבצת שסימן", () => {
    const { assignments } = run({
      slots: [slot("s1", 0, "07:15", "15:00")],
      employees: [employee("e1")],
      availabilities: [avail("e1", "s1")],
    });
    assert.equal(assignments.length, 1);
    assert.equal(assignments[0].employeeId, "e1");
  });

  it("לא משבץ עובד למשבצת שלא סימן", () => {
    const { assignments, report } = run({
      slots: [slot("s1", 0, "07:15", "15:00")],
      employees: [employee("e1")],
      availabilities: [],
    });
    assert.equal(assignments.length, 0);
    assert.equal(report.unfilled[0].reason, "no-submissions");
  });

  it("לא משבץ עובד לתפקיד שאינו שלו", () => {
    const { assignments } = run({
      slots: [slot("s1", 0, "07:15", "14:00", { role: "bartender" })],
      employees: [employee("e1", { roles: ["waiter"] })],
      availabilities: [avail("e1", "s1")],
    });
    assert.equal(assignments.length, 0);
  });

  /*
   * הרשאת הסגירה בוטלה — כולם יכולים לסגור. הבדיקה נשארה כדי לקבע את
   * הביטול: אם מישהו יחזיר פסילה על סגירה, היא תיפול.
   */
  it("משבצת סגירה פתוחה לכל מי שסימן אותה", () => {
    const { assignments } = run({
      slots: [slot("s1", 0, "16:30", "23:00", { isClosing: true, period: "evening" })],
      employees: [employee("e1")],
      availabilities: [avail("e1", "s1")],
    });
    assert.equal(assignments.length, 1);
  });
});

describe("אילוצים קשיחים", () => {
  it("לא משבץ עובד לשתי משמרות חופפות באותו יום", () => {
    const { assignments } = run({
      slots: [slot("s1", 0, "07:15", "15:00"), slot("s2", 0, "08:15", "15:00")],
      employees: [employee("e1")],
      availabilities: [avail("e1", "s1"), avail("e1", "s2")],
    });
    assert.equal(assignments.length, 1);
  });

  /*
   * המקסימום אינו אילוץ קשיח אלא מחיר. משבצת ריקה יקרה ממנו, ולכן כשאין
   * אף מועמד אחר העובד מקבל אותה בכל זאת — והחריגה מדווחת למנהל.
   */
  it("חורג ממקסימום המשמרות כשהחלופה היחידה היא משבצת ריקה", () => {
    const slots = [0, 1, 2, 3].map((d) => slot(`s${d}`, d, "07:15", "15:00"));
    const { assignments, report } = run({
      slots,
      employees: [employee("e1", { maxShifts: 2 })],
      availabilities: slots.map((s) => avail("e1", s.id)),
    });
    assert.equal(assignments.length, 4);
    assert.deepEqual(report.overMax, [
      { employeeId: "e1", max: 2, assigned: 4 },
    ]);
  });

  it("מעדיף מי שלא במקסימום על פני מי שכבר הגיע אליו", () => {
    const { assignments, report } = run({
      slots: [slot("s1", 0, "07:15", "15:00")],
      employees: [
        // "מלא" סימן "מעדיף" וכבר במקסימום; "פנוי" סימן רק "יכול"
        employee("full", { maxShifts: 0 }),
        employee("free", { maxShifts: 6 }),
      ],
      availabilities: [
        avail("full", "s1", { state: "preferred" }),
        avail("free", "s1", { state: "available" }),
      ],
    });
    assert.equal(assignments.length, 1);
    assert.equal(assignments[0].employeeId, "free");
    assert.deepEqual(report.overMax, []);
  });

  it("חריגה ממקסימום אינה שוברת את כלל המשמרת-ביום", () => {
    const slots = [
      slot("s1", 0, "07:15", "15:00"),
      slot("s2", 0, "15:00", "23:00", { period: "evening" }),
    ];
    const { assignments } = run({
      slots,
      employees: [employee("e1", { maxShifts: 0 })],
      availabilities: slots.map((s) => avail("e1", s.id)),
    });
    // משבצת אחת בלבד, למרות ששתיהן היו נשארות ריקות אחרת
    assert.equal(assignments.length, 1);
  });

  it("חריגה ממקסימום אינה שוברת את המנוחה בין ימים", () => {
    const slots = [
      // סגירה ב-23:00 ופתיחה ב-06:00 למחרת — שבע שעות, פחות מהמינימום
      slot("s1", 0, "16:00", "23:00", { period: "evening" }),
      slot("s2", 1, "06:00", "14:00"),
    ];
    const { assignments } = run({
      slots,
      employees: [employee("e1", { maxShifts: 0 })],
      availabilities: slots.map((s) => avail("e1", s.id)),
    });
    assert.equal(assignments.length, 1);
  });

  it('מכבד אילוץ "לא עובדים יחד" קשיח', () => {
    const { assignments } = run({
      slots: [slot("s1", 0, "07:15", "15:00"), slot("s2", 0, "08:15", "15:00")],
      employees: [employee("e1"), employee("e2")],
      availabilities: [
        avail("e1", "s1"),
        avail("e1", "s2"),
        avail("e2", "s1"),
        avail("e2", "s2"),
      ],
      constraints: [{ aId: "e1", bId: "e2", scope: "overlapping", hard: true }],
    });
    // רק אחד מהשניים יכול לעבוד — המשבצת השנייה נשארת ריקה
    assert.equal(assignments.length, 1);
  });

  it("אוכף מנוחה מינימלית בין סגירה לפתיחה למחרת", () => {
    const closing = slot("s1", 0, "17:30", "23:00", { isClosing: true, period: "evening" });
    const opening = slot("s2", 1, "07:15", "15:00");
    const { assignments } = run({
      slots: [closing, opening],
      employees: [employee("e1")],
      availabilities: [avail("e1", "s1"), avail("e1", "s2")],
      options: { timeBudgetMs: 500, minRestHours: 8 },
    });
    // 23:00 עד 07:15 = 8:15 שעות... גבולי. עם 9 שעות מנוחה זה בוודאי ייחסם:
    const strict = run({
      slots: [closing, opening],
      employees: [employee("e1")],
      availabilities: [avail("e1", "s1"), avail("e1", "s2")],
      options: { timeBudgetMs: 500, minRestHours: 9 },
    });
    assert.equal(strict.assignments.length, 1);
    assert.equal(assignments.length, 2, "8:15 שעות מנוחה עוברות סף של 8 שעות");
  });
});

describe("משמרות מקוצרות", () => {
  const s0900_1600 = slot("s1", 0, "09:00", "16:00");
  const s0715_1500 = slot("s2", 0, "07:15", "15:00");

  it('מעדיף התאמה מלאה על פני מקוצרת כשיש בחירה', () => {
    // עובד שחייב לרדת ב-15:00 סימן את שתי המשבצות.
    // 07:15-15:00 מתאימה לו במלואה, 09:00-16:00 רק מקוצרת — הוא צריך לקבל את הראשונה.
    const { assignments } = run({
      slots: [s0715_1500, s0900_1600],
      employees: [employee("e1"), employee("e2")],
      availabilities: [
        avail("e1", "s1", { latestEnd: "15:00" }),
        avail("e1", "s2", { latestEnd: "15:00" }),
        avail("e2", "s1"),
      ],
      constraints: [],
    });
    const e1 = assignments.find((a) => a.employeeId === "e1");
    assert.ok(e1);
    assert.equal(e1.slotId, "s2", "e1 שובץ למשבצת שמתאימה לו במלואה");
    assert.equal(e1.shortened, false);
  });

  it("לא משבץ חלקית גם כשזו האפשרות היחידה — משאיר ריק ומציע למנהל", () => {
    const { assignments, report } = run({
      slots: [s0900_1600],
      employees: [employee("e1")],
      availabilities: [avail("e1", "s1", { latestEnd: "15:00" })],
    });
    assert.equal(assignments.length, 0, "הפותר לא בוחר כיסוי חלקי בעצמו");

    const unfilled = report.unfilled[0];
    assert.equal(unfilled.reason, "only-partial-available");
    assert.equal(unfilled.partialOptions.length, 1);
    assert.deepEqual(unfilled.partialOptions[0], {
      employeeId: "e1",
      start: "09:00",
      end: "15:00",
      coveredMinutes: 360,
      slotMinutes: 420,
      state: "available",
      // משבצת רגילה, לא פותחת ולא סוגרת — אין מה לשבור
      breaksOpening: false,
      breaksClosing: false,
    });
  });

  it("האפשרויות ממוינות לפי כמה הן מכסות", () => {
    const { report } = run({
      slots: [s0900_1600],
      employees: [employee("a"), employee("b"), employee("c")],
      availabilities: [
        avail("a", "s1", { latestEnd: "13:30" }), // 4.5 שעות
        avail("b", "s1", { latestEnd: "15:30" }), // 6.5 שעות
        avail("c", "s1", { latestEnd: "14:00" }), // 5 שעות
      ],
    });
    assert.deepEqual(
      report.unfilled[0].partialOptions.map((o) => o.employeeId),
      ["b", "c", "a"],
    );
  });

  it("שום שיבוץ אוטומטי אינו מסומן כחלקי", () => {
    const slots = [0, 1, 2].map((d) => slot(`s${d}`, d, "09:00", "16:00"));
    const { assignments } = run({
      slots,
      employees: [employee("full"), employee("part")],
      availabilities: [
        ...slots.map((s) => avail("full", s.id)),
        ...slots.map((s) => avail("part", s.id, { latestEnd: "15:00" })),
      ],
    });
    assert.ok(assignments.every((a) => !a.shortened));
    assert.ok(assignments.every((a) => a.employeeId === "full"));
  });

  it("לא משבץ כשנשארות פחות מ-4 שעות", () => {
    const late = slot("s1", 0, "11:30", "17:00");
    const { assignments, report } = run({
      slots: [late],
      employees: [employee("e1")],
      availabilities: [avail("e1", "s1", { latestEnd: "15:00" })],
    });
    assert.equal(assignments.length, 0, "3.5 שעות בלבד — מתחת למינימום");
    assert.equal(report.unfilled[0].reason, "window-mismatch");
  });
});

describe("פותחים וסוגרים", () => {
  it("משבצת פותחת נשארת ריקה אם כל מי שסימן מגיע מאוחר", () => {
    const opener = slot("s1", 0, "07:15", "15:00", { fixedStart: true });
    const { assignments, report } = run({
      slots: [opener],
      employees: [employee("e1")],
      availabilities: [avail("e1", "s1", { earliestStart: "09:00" })],
    });
    // ההבטחה: הפותר לא משבץ לבד מי שמאחר לפתיחה. היא נשמרת גם אחרי
    // שאיחור הפך לכיסוי חלקי — הפותר פשוט לא נוגע בכיסוי חלקי.
    assert.equal(assignments.length, 0);
    assert.equal(report.unfilled[0].reason, "only-partial-available");
    // ומה שכן השתנה: האיחור מוצע למנהל כאפשרות, במקום להיעלם
    assert.equal(report.unfilled[0].partialOptions.length, 1);
    assert.equal(report.unfilled[0].partialOptions[0].employeeId, "e1");
  });

  it("משבצת פותחת מאוישת במי שזמין משעת ההתחלה", () => {
    const opener = slot("s1", 0, "07:15", "15:00", { fixedStart: true });
    const { assignments } = run({
      slots: [opener],
      employees: [employee("e1"), employee("e2")],
      availabilities: [
        avail("e1", "s1", { earliestStart: "09:00" }),
        avail("e2", "s1"),
      ],
    });
    assert.equal(assignments.length, 1);
    assert.equal(assignments[0].employeeId, "e2");
    assert.equal(assignments[0].actualStart, toMinutes("07:15"));
  });

  it("משבצת סוגרת נשארת ריקה אם כל מי שסימן יורד מוקדם", () => {
    const closer = slot("s1", 0, "11:30", "17:00", { fixedEnd: true });
    const { assignments, report } = run({
      slots: [closer],
      employees: [employee("e1")],
      availabilities: [avail("e1", "s1", { latestEnd: "16:00" })],
    });
    assert.equal(assignments.length, 0);
    assert.equal(report.unfilled[0].reason, "only-partial-available");
    assert.equal(report.unfilled[0].partialOptions.length, 1);
  });

  it("הגעה מאוחרת למשבצת סוגרת מותרת — אבל כאפשרות למנהל, לא אוטומטית", () => {
    const closer = slot("s1", 0, "11:30", "17:00", { fixedEnd: true });
    const { assignments, report } = run({
      slots: [closer],
      employees: [employee("e1")],
      availabilities: [avail("e1", "s1", { earliestStart: "12:30" })],
    });
    assert.equal(assignments.length, 0);
    assert.equal(report.unfilled[0].reason, "only-partial-available");
    assert.deepEqual(report.unfilled[0].partialOptions[0], {
      employeeId: "e1",
      start: "12:30",
      end: "17:00",
      coveredMinutes: 270,
      slotMinutes: 330,
      state: "available",
      breaksOpening: false,
      // מאחר אבל כן נשאר עד הסגירה — הסגירה לא נשברת
      breaksClosing: false,
    });
  });

  it("ירידה מוקדמת ממשבצת סוגרת מסומנת כשוברת סגירה, ומוצעת למנהל", () => {
    const closer = slot("s1", 0, "11:30", "17:00", { fixedEnd: true });
    const { assignments, report } = run({
      slots: [closer],
      employees: [employee("e1")],
      availabilities: [avail("e1", "s1", { latestEnd: "16:00" })],
    });
    // הפותר עדיין לא נוגע בזה לבד
    assert.equal(assignments.length, 0);
    const option = report.unfilled[0].partialOptions[0];
    assert.equal(option.employeeId, "e1");
    assert.equal(option.end, "16:00");
    assert.equal(option.breaksClosing, true);
    assert.equal(option.breaksOpening, false);
  });

  it("איחור למשבצת פותחת מסומן כשובר פתיחה", () => {
    const opener = slot("s1", 0, "07:15", "15:00", { fixedStart: true });
    const { assignments, report } = run({
      slots: [opener],
      employees: [employee("e1")],
      availabilities: [avail("e1", "s1", { earliestStart: "09:00" })],
    });
    assert.equal(assignments.length, 0);
    const option = report.unfilled[0].partialOptions[0];
    assert.equal(option.start, "09:00");
    assert.equal(option.breaksOpening, true);
    assert.equal(option.breaksClosing, false);
  });
});

describe("מעבר בין סבבים", () => {
  const morning = slot("m", 0, "07:15", "15:00", { period: "morning" });
  const evening = slot("e", 0, "16:30", "23:00", {
    period: "evening",
    isClosing: true,
  });

  it("מלצר לא מקבל בוקר וערב באותו יום גם כשמותר יותר ממשמרת ליום", () => {
    const { assignments } = run({
      slots: [morning, evening],
      employees: [employee("w1")],
      availabilities: [avail("w1", "m"), avail("w1", "e")],
      options: { timeBudgetMs: 500, onePerDay: false },
    });
    assert.equal(assignments.length, 1);
  });

  it("ברמן כן יכול — הכלל לא חל עליו", () => {
    const bMorning = slot("bm", 0, "07:15", "14:00", {
      role: "bartender",
      period: "morning",
    });
    const bEvening = slot("be", 0, "17:30", "23:00", {
      role: "bartender",
      period: "evening",
    });
    // minRestHours מנוטרל כדי לבודד את כלל הסבבים — אחרת פער של 3.5 שעות
    // בין המשמרות היה נחסם ע"י כלל המנוחה ולא ע"י מה שנבדק כאן
    const { assignments } = run({
      slots: [bMorning, bEvening],
      employees: [employee("b1", { roles: ["bartender"] })],
      availabilities: [avail("b1", "bm"), avail("b1", "be")],
      options: { timeBudgetMs: 500, onePerDay: false, minRestHours: 0 },
    });
    assert.equal(assignments.length, 2);
  });

  it("הדוח מסביר משבצת שנשארה ריקה בגלל מעבר סבבים", () => {
    const { report } = run({
      slots: [morning, evening],
      employees: [employee("w1")],
      availabilities: [avail("w1", "m"), avail("w1", "e")],
      options: { timeBudgetMs: 500, onePerDay: false },
    });
    assert.equal(report.unfilled.length, 1);
    assert.equal(report.unfilled[0].reason, "cross-round");
  });
});

describe("רצפת האיוש", () => {
  /** ארבע משבצות חופפות — הרצפה בשעות הליבה היא 4 */
  const slots = [
    slot("a", 0, "08:00", "16:00"),
    slot("b", 0, "08:00", "16:00"),
    slot("c", 0, "08:00", "16:00"),
    slot("d", 0, "08:00", "16:00"),
  ];

  it("מעדיף עובד שנשאר על פני יורד-מוקדם כשהרצפה בסכנה", () => {
    // לכל משבצת יש מועמד שנשאר ומועמד שיורד ב-12:00.
    // אם ייבחרו היורדים, הרצפה תתרוקן — הפותר צריך להעדיף את הנשארים.
    const employees = [
      ...["s1", "s2", "s3", "s4"].map((id) => employee(id)),
      ...["l1", "l2", "l3", "l4"].map((id) => employee(id)),
    ];
    const availabilities = slots.flatMap((s, i) => [
      avail(`s${i + 1}`, s.id),
      avail(`l${i + 1}`, s.id, { latestEnd: "12:00" }),
    ]);

    const { report } = run({ slots, employees, availabilities });
    assert.deepEqual(report.coverageGaps, [], "לא היו צריכים להיווצר חורי איוש");
  });

  it("כשכולם יורדים מוקדם — המשבצות נשארות ריקות והחור מדווח", () => {
    const employees = ["l1", "l2", "l3", "l4"].map((id) => employee(id));
    const availabilities = slots.map((s, i) =>
      avail(`l${i + 1}`, s.id, { latestEnd: "12:00" }),
    );

    const { assignments, report } = run({ slots, employees, availabilities });

    assert.equal(assignments.length, 0, "הפותר לא משבץ חלקית בעצמו");
    assert.equal(
      report.unfilled.filter((u) => u.partialOptions.length > 0).length,
      4,
      "לכל ארבע המשבצות יש אפשרות חלקית להציע למנהל",
    );

    // החור נובע מהמשבצות הריקות, ומכסה את כל היום
    assert.ok(report.coverageGaps.length > 0);
    assert.equal(report.coverageGaps[0].from, "08:00");
    assert.equal(report.coverageGaps[0].actual, 0);
    assert.equal(report.coverageGaps[0].required, 4);
  });
});

describe("מכסות והעדפות", () => {
  it("מעדיף עובד שרחוק ממכסת המשמרות שלו", () => {
    const slots = [slot("s1", 0, "07:15", "15:00")];
    const { assignments } = run({
      slots,
      employees: [
        employee("e1", { requiredShifts: 0 }),
        employee("e2", { requiredShifts: 5 }),
      ],
      availabilities: [avail("e1", "s1"), avail("e2", "s1")],
    });
    assert.equal(assignments[0].employeeId, "e2");
  });

  it('מעדיף משבצת שסומנה "מעדיף" על פני "יכול"', () => {
    // שתי המשבצות באותו יום: כלל המשמרת-ביום הוא שכופה את הבחירה, ולא
    // המקסימום — הוא רך ולכן לא היה מגביל לאחת
    const slots = [slot("s1", 0, "07:15", "15:00"), slot("s2", 0, "07:15", "15:00")];
    const { assignments } = run({
      slots,
      employees: [employee("e1")],
      availabilities: [
        avail("e1", "s1", { state: "available" }),
        avail("e1", "s2", { state: "preferred" }),
      ],
    });
    assert.equal(assignments.length, 1);
    assert.equal(assignments[0].slotId, "s2");
  });

  it("מדווח על עובדים שלא הגיעו למכסה", () => {
    const { report } = run({
      slots: [slot("s1", 0, "07:15", "15:00")],
      employees: [employee("e1", { requiredShifts: 3 })],
      availabilities: [avail("e1", "s1")],
    });
    assert.equal(report.shortfalls.length, 1);
    assert.equal(report.shortfalls[0].assigned, 1);
    assert.equal(report.shortfalls[0].required, 3);
    assert.equal(report.shortfalls[0].marked, 1);
  });

  it("מלצר שהגיש ואין לו אף משמרת קודם למשמרת נוספת של מי שכבר יש לו", () => {
    // בלי הכלל: e1 רחוק מהמכסה שלו ולוקח את שתיהן, ו-e2 נשאר באפס
    const slots = [slot("s1", 0, "07:15", "15:00"), slot("s2", 1, "07:15", "15:00")];
    const { assignments } = run({
      slots,
      employees: [
        employee("e1", { requiredShifts: 2, atLeastOne: true }),
        employee("e2", { atLeastOne: true }),
      ],
      availabilities: [avail("e1", "s1"), avail("e1", "s2"), avail("e2", "s2")],
    });
    const bySlot = new Map(assignments.map((a) => [a.slotId, a.employeeId]));
    assert.equal(bySlot.get("s1"), "e1");
    assert.equal(bySlot.get("s2"), "e2");
  });

  it("מדווח על מלצר שהגיש ונשאר בלי משמרת", () => {
    const { report } = run({
      slots: [slot("s1", 0, "07:15", "15:00")],
      employees: [employee("e1", { atLeastOne: true }), employee("e2", { atLeastOne: true })],
      availabilities: [avail("e1", "s1"), avail("e2", "s1")],
    });
    assert.equal(report.noShift?.length, 1);
  });
});

describe("נעיצה ודטרמיניזם", () => {
  it("לא מזיז שיבוץ נעוץ גם כשהוא לא אופטימלי", () => {
    const slots = [slot("s1", 0, "07:15", "15:00")];
    const { assignments } = run({
      slots,
      employees: [
        employee("e1", { requiredShifts: 0 }),
        employee("e2", { requiredShifts: 5 }),
      ],
      availabilities: [avail("e1", "s1"), avail("e2", "s1")],
      pinned: [
        {
          slotId: "s1",
          employeeId: "e1",
          actualStart: toMinutes("07:15"),
          actualEnd: toMinutes("15:00"),
          shortened: false,
        },
      ],
    });
    assert.equal(assignments.length, 1);
    assert.equal(assignments[0].employeeId, "e1", "הנעוץ נשמר למרות ש-e2 עדיף");
    assert.equal(assignments[0].pinned, true);
  });

  it("אותה קלט מפיקה אותה תוצאה", () => {
    const slots = [0, 1, 2, 3, 4].map((d) => slot(`s${d}`, d, "07:15", "15:00"));
    const employees = ["a", "b", "c"].map((id) => employee(id, { requiredShifts: 2 }));
    const availabilities = employees.flatMap((e) =>
      slots.map((s) => avail(e.id, s.id)),
    );

    const first = run({ slots, employees, availabilities });
    const second = run({ slots, employees, availabilities });

    assert.deepEqual(
      first.assignments.map((a) => `${a.slotId}:${a.employeeId}`).sort(),
      second.assignments.map((a) => `${a.slotId}:${a.employeeId}`).sort(),
    );
  });
});

describe("שלמות הסידור בקנה מידה מלא", () => {
  /**
   * משחזר את הגודל האמיתי: שבוע שלם, 16 משבצות ליום, ~29 עובדים.
   * הבדיקה הזו תופסת באגים של חיפוש מקומי שנראים רק כשיש מספיק מהלכים.
   */
  function buildRealisticWeek() {
    const slots: SolverSlot[] = [];
    for (let day = 0; day < 5; day++) {
      const spec: [string, string, SolverSlot["role"], SolverSlot["period"], boolean][] = [
        ["07:00", "16:00", "manager", "morning", false],
        ["07:15", "14:00", "bartender", "morning", false],
        ["12:30", "17:30", "bartender", "morning", false],
        ["17:30", "23:00", "bartender", "evening", false],
        ["07:15", "15:00", "waiter", "morning", false],
        ["08:15", "15:00", "waiter", "morning", false],
        ["09:00", "16:00", "waiter", "morning", false],
        ["10:00", "17:00", "waiter", "morning", false],
        ["11:15", "17:00", "waiter", "morning", false],
        ["11:30", "17:00", "waiter", "morning", false],
        ["16:00", "23:00", "manager", "evening", true],
        ["16:00", "22:15", "waiter", "evening", false],
        ["16:00", "22:15", "waiter", "evening", false],
        ["16:30", "23:00", "waiter", "evening", true],
        ["17:30", "23:00", "waiter", "evening", true],
        ["18:30", "22:00", "waiter", "evening", false],
      ];
      spec.forEach(([s, e, role, period, isClosing], i) => {
        slots.push(
          slot(`d${day}-${i}`, day, s, e, { role, period, isClosing, sortOrder: i }),
        );
      });
    }

    const employees: SolverEmployee[] = [
      ...["m1", "m2", "m3", "m4"].map((id) =>
        employee(id, { roles: ["manager"], requiredShifts: 3 }),
      ),
      ...["b1", "b2", "b3", "b4", "b5"].map((id) =>
        employee(id, { roles: ["bartender"], requiredShifts: 3 }),
      ),
      ...Array.from({ length: 20 }, (_, i) =>
        employee(`w${i}`, { roles: ["waiter"], requiredShifts: 3 }),
      ),
    ];

    // כל עובד מסמן ~40% מהמשבצות המתאימות לתפקידו, בפיזור דטרמיניסטי
    const availabilities: SolverAvailability[] = [];
    employees.forEach((emp, ei) => {
      slots.forEach((s, si) => {
        if (!emp.roles.includes(s.role)) return;
        if ((ei * 7 + si * 13) % 10 < 4) {
          availabilities.push(
            avail(emp.id, s.id, {
              state: (ei + si) % 3 === 0 ? "preferred" : "available",
              // חלק מהעובדים עם אילוץ "חייב לרדת עד"
              latestEnd: ei % 9 === 0 ? "15:00" : null,
            }),
          );
        }
      });
    });

    return { slots, employees, availabilities };
  }

  const { slots, employees, availabilities } = buildRealisticWeek();
  const result = run({
    slots,
    employees,
    availabilities,
    constraints: [
      { aId: "w1", bId: "w2", scope: "overlapping", hard: true },
      { aId: "w3", bId: "w4", scope: "sameDay", hard: true },
    ],
    options: { timeBudgetMs: 3000 },
  });

  it("אף עובד לא משובץ פעמיים באותו יום", () => {
    const byEmployeeDay = new Map<string, string[]>();
    for (const a of result.assignments) {
      const s = slots.find((x) => x.id === a.slotId)!;
      const key = `${a.employeeId}|${s.dayIndex}`;
      if (!byEmployeeDay.has(key)) byEmployeeDay.set(key, []);
      byEmployeeDay.get(key)!.push(a.slotId);
    }
    const doubles = [...byEmployeeDay.entries()].filter(([, v]) => v.length > 1);
    assert.deepEqual(doubles, [], "נמצא עובד עם שתי משמרות באותו יום");
  });

  it("אף משבצת לא מאוישת פעמיים", () => {
    const seen = new Set<string>();
    for (const a of result.assignments) {
      assert.ok(!seen.has(a.slotId), `המשבצת ${a.slotId} מאוישת יותר מפעם אחת`);
      seen.add(a.slotId);
    }
  });

  /*
   * המקסימום כבר אינו חסם — החסם הוא משמרת אחת ביום, וזה מה שנבדק כאן.
   * הוא גם התקרה האמיתית: שישה ימי עבודה, ולכן איש לא יגיע לשבע.
   */
  it("אף עובד לא משובץ לשתי משמרות באותו יום", () => {
    const seen = new Set<string>();
    for (const a of result.assignments) {
      const s = slots.find((x) => x.id === a.slotId)!;
      const key = `${a.employeeId}|${s.dayIndex}`;
      assert.ok(!seen.has(key), `${a.employeeId} שובץ פעמיים ביום ${s.dayIndex}`);
      seen.add(key);
    }
  });

  it("חריגה ממקסימום קורית רק כשלא היה אף מועמד אחר", () => {
    const counts = new Map<string, number>();
    for (const a of result.assignments) {
      counts.set(a.employeeId, (counts.get(a.employeeId) ?? 0) + 1);
    }

    for (const [id, n] of counts) {
      const emp = employees.find((e) => e.id === id)!;
      if (n <= emp.maxShifts) continue;

      // מי שחרג חייב להופיע בדוח — אחרת המנהל לא היה רואה את זה
      assert.ok(
        result.report.overMax?.some((o) => o.employeeId === id),
        `${id} חרג ל-${n} משמרות ולא דווח`,
      );
    }

    // ולהפך: כל מי שבדוח אכן חרג
    for (const o of result.report.overMax ?? []) {
      assert.ok(o.assigned > o.max, `${o.employeeId} דווח כחורג בלי לחרוג`);
    }
  });

  it("כל שיבוץ הוא למשבצת שהעובד סימן ובתפקיד שלו", () => {
    const marked = new Set(availabilities.map((a) => `${a.employeeId}|${a.slotId}`));
    for (const a of result.assignments) {
      assert.ok(marked.has(`${a.employeeId}|${a.slotId}`), `${a.employeeId} לא סימן ${a.slotId}`);
      const s = slots.find((x) => x.id === a.slotId)!;
      const emp = employees.find((e) => e.id === a.employeeId)!;
      assert.ok(emp.roles.includes(s.role));
    }
  });

  it("אילוצי 'לא עובדים יחד' נשמרים", () => {
    const dayOf = (slotId: string) => slots.find((s) => s.id === slotId)!.dayIndex;
    const days = (id: string) =>
      result.assignments.filter((a) => a.employeeId === id).map((a) => dayOf(a.slotId));
    // w3 ו-w4 באילוץ sameDay — אסור שיחלקו יום
    const shared = days("w3").filter((d) => days("w4").includes(d));
    assert.deepEqual(shared, [], "w3 ו-w4 משובצים באותו יום");
  });

  it("מאייש את רוב המשבצות", () => {
    const rate = result.report.filled / result.report.total;
    assert.ok(rate > 0.8, `אויש רק ${Math.round(rate * 100)}% מהמשבצות`);
  });
});

/*
 * מה שהחליף את "משבצות סגירה רק למורשי סגירה": ההרשאה בוטלה, ולכן מה
 * שנשאר לשמור עליו הוא לא מי *רשאי* לסגור אלא **על מי זה נופל**.
 *
 * שני ימים, ובכל יום סגירה אחת ומשמרת רגילה אחת. שני מלצרים שחייבים שתי
 * משמרות כל אחד — כלומר כל חלוקה מאיישת הכל ומגיעה למכסה, והדבר היחיד
 * שמבדיל בין "כל אחד סוגר פעם" ל"אחד סוגר פעמיים" הוא איזון הסגירות.
 */
describe("פיזור הסגירות", () => {
  const slots = [
    slot("a-close", 0, "16:30", "23:00", { isClosing: true, period: "evening" }),
    slot("a-reg", 0, "07:15", "15:00"),
    slot("b-close", 1, "16:30", "23:00", { isClosing: true, period: "evening" }),
    slot("b-reg", 1, "07:15", "15:00"),
  ];

  it("שני עובדים סוגרים פעם אחת כל אחד, ולא אחד פעמיים", () => {
    const employees = [
      employee("x", { requiredShifts: 2, maxShifts: 2 }),
      employee("y", { requiredShifts: 2, maxShifts: 2 }),
    ];
    const { assignments } = run({
      slots,
      employees,
      availabilities: employees.flatMap((e) => slots.map((s) => avail(e.id, s.id))),
    });

    const closers = assignments
      .filter((a) => slots.find((s) => s.id === a.slotId)!.isClosing)
      .map((a) => a.employeeId);
    assert.equal(closers.length, 2, "שתי הסגירות אוישו");
    assert.equal(
      new Set(closers).size,
      2,
      `אותו אדם סגר את שני הימים: ${closers.join(", ")}`,
    );
  });
});

describe("פיזור ותק", () => {
  /** שני ימים, שתי משבצות מלצר בכל אחד */
  const slots = [
    slot("a1", 0, "07:15", "15:00"),
    slot("a2", 0, "08:15", "15:00"),
    slot("b1", 1, "07:15", "15:00"),
    slot("b2", 1, "08:15", "15:00"),
  ];

  it("לא מרכז את הוותיקים ביום אחד ואת החדשים ביום אחר", () => {
    // שני ותיקים ושני חדשים, כולם זמינים לכל המשבצות ועם מכסה זהה.
    // הפיצול היחיד שמבדיל בין הפתרונות הוא פיזור הותק.
    const employees = [
      employee("v1", { seniority: 5, maxShifts: 1 }),
      employee("v2", { seniority: 5, maxShifts: 1 }),
      employee("r1", { seniority: 1, maxShifts: 1 }),
      employee("r2", { seniority: 1, maxShifts: 1 }),
    ];
    const availabilities = employees.flatMap((e) =>
      slots.map((s) => avail(e.id, s.id)),
    );

    const { assignments } = run({ slots, employees, availabilities });
    assert.equal(assignments.length, 4);

    const seniorityOf = (id: string) =>
      employees.find((e) => e.id === id)!.seniority;
    const dayOf = (slotId: string) => slots.find((s) => s.id === slotId)!.dayIndex;

    const byDay = new Map<number, number[]>();
    for (const a of assignments) {
      const d = dayOf(a.slotId);
      byDay.set(d, [...(byDay.get(d) ?? []), seniorityOf(a.employeeId)]);
    }

    for (const [day, levels] of byDay) {
      const mean = levels.reduce((s, n) => s + n, 0) / levels.length;
      assert.equal(mean, 3, `יום ${day} קיבל ${levels} — הוותק לא פוזר`);
    }
  });

  it("לא גובר על מכסת המשמרות של עובד", () => {
    // r1 חייב 2 משמרות, לכל השאר 0. פיזור ותק לא אמור למנוע ממנו לקבל אותן.
    const employees = [
      employee("v1", { seniority: 5, requiredShifts: 0 }),
      employee("r1", { seniority: 1, requiredShifts: 2 }),
    ];
    const availabilities = employees.flatMap((e) =>
      slots.map((s) => avail(e.id, s.id)),
    );

    const { assignments } = run({ slots, employees, availabilities });
    const r1 = assignments.filter((a) => a.employeeId === "r1").length;
    assert.equal(r1, 2, "המכסה גוברת על פיזור הותק");
  });
});

describe("דוח ההסבר", () => {
  it("מסביר משבצת ריקה בגלל אילוץ זוגי", () => {
    const { report } = run({
      slots: [slot("s1", 0, "07:15", "15:00"), slot("s2", 0, "08:15", "15:00")],
      employees: [employee("e1"), employee("e2")],
      availabilities: [
        avail("e1", "s1"),
        avail("e1", "s2"),
        avail("e2", "s1"),
        avail("e2", "s2"),
      ],
      constraints: [{ aId: "e1", bId: "e2", scope: "overlapping", hard: true }],
    });
    assert.equal(report.unfilled.length, 1);
    assert.equal(report.unfilled[0].reason, "blocked-by-pair");
  });

  it("סופר משבצות מלאות מול סך הכל", () => {
    const { report } = run({
      slots: [slot("s1", 0, "07:15", "15:00"), slot("s2", 1, "07:15", "15:00")],
      employees: [employee("e1")],
      availabilities: [avail("e1", "s1")],
    });
    assert.equal(report.filled, 1);
    assert.equal(report.total, 2);
  });

  it("מדווח על הפרת אילוץ רך במקום לחסום", () => {
    const { assignments, report } = run({
      slots: [slot("s1", 0, "07:15", "15:00"), slot("s2", 0, "08:15", "15:00")],
      employees: [employee("e1"), employee("e2")],
      availabilities: [avail("e1", "s1"), avail("e2", "s2")],
      constraints: [{ aId: "e1", bId: "e2", scope: "overlapping", hard: false }],
    });
    assert.equal(assignments.length, 2, "אילוץ רך לא חוסם שיבוץ");
    assert.equal(report.softViolations.length, 1);
  });
});

/*
 * משמרת כוננות (SB).
 *
 * לא תמיד קוראים לה להגיע בפועל, ולכן שתיים לאותו אדם באותו שבוע הן שתי
 * הבטחות שאולי לא ישולמו — ומי שספר עליהן נשאר בלי שעות.
 */
describe("משמרת כוננות פעם אחת בשבוע", () => {
  const sb = (id: string, dayIndex: number) =>
    slot(id, dayIndex, "18:30", "22:00", { standby: true });

  it("אותו עובד לא מקבל שתי כוננויות, גם בימים שונים", () => {
    const { assignments, report } = run({
      slots: [sb("sb-0", 0), sb("sb-1", 2)],
      employees: [employee("solo", { maxShifts: 6, requiredShifts: 2 })],
      availabilities: [
        avail("solo", "sb-0", { state: "preferred" }),
        avail("solo", "sb-1", { state: "preferred" }),
      ],
    });

    assert.equal(assignments.length, 1, "רק אחת מהשתיים אוישה");
    assert.equal(report.unfilled.length, 1);
    assert.equal(report.unfilled[0].reason, "all-on-standby");
  });

  it("שני עובדים שונים מקבלים כל אחד כוננות אחת", () => {
    const { assignments } = run({
      slots: [sb("sb-0", 0), sb("sb-1", 2)],
      employees: [
        employee("a", { maxShifts: 6, requiredShifts: 1 }),
        employee("b", { maxShifts: 6, requiredShifts: 1 }),
      ],
      availabilities: [
        avail("a", "sb-0", { state: "preferred" }),
        avail("a", "sb-1", { state: "preferred" }),
        avail("b", "sb-0", { state: "preferred" }),
        avail("b", "sb-1", { state: "preferred" }),
      ],
    });

    assert.equal(assignments.length, 2);
    assert.notEqual(
      assignments[0].employeeId,
      assignments[1].employeeId,
      "לא אותו אדם פעמיים",
    );
  });

  it("הכלל חל רק על משבצות כוננות ולא על משמרות רגילות", () => {
    const { assignments } = run({
      slots: [
        slot("plain-0", 0, "18:30", "22:00"),
        slot("plain-1", 2, "18:30", "22:00"),
      ],
      employees: [employee("solo", { maxShifts: 6, requiredShifts: 2 })],
      availabilities: [
        avail("solo", "plain-0", { state: "preferred" }),
        avail("solo", "plain-1", { state: "preferred" }),
      ],
    });
    assert.equal(assignments.length, 2, "שתי משמרות רגילות מותרות");
  });
});
