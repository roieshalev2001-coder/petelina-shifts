import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  matchName,
  normalizeName,
  parseFridaySheet,
  parseSheetDate,
  type RosterPerson,
} from "./friday-import";
import { toDateInputValue, zonedTime } from "./time";

/** רשימת מלצרים שמשקפת את המלכודות האמיתיות: שם קצר, ושני "נועם" */
const ROSTER: RosterPerson[] = [
  { id: "1", fullName: "גלעד פרץ" },
  { id: "2", fullName: "נעמה גבאי" },
  { id: "3", fullName: "נועם אלמוג" },
  { id: "4", fullName: "נועם ברגר" },
  { id: "5", fullName: "הילה שמעוני" },
  { id: "6", fullName: "ליאור דהן" },
  { id: "7", fullName: "דור רבינוביץ" },
  { id: "8", fullName: "מאיה נחום" },
  { id: "9", fullName: "אסף אוחיון" },
];

/** רביעי, 19.8.2026 — אותו יום שבו הגיליון האמיתי נקרא */
const NOW = zonedTime(2026, 8, 19, 12, 0);

describe("נרמול שמות", () => {
  it("מאחד רווחים כפולים וגרשיים", () => {
    assert.equal(normalizeName("  גלעד   פרץ "), "גלעד פרץ");
    assert.equal(normalizeName('נועם ״אלמוג״'), "נועם אלמוג");
  });

  it("מסיר סימני כיווניות שנדבקים בהעתקה מגיליון בעברית", () => {
    assert.equal(normalizeName("‏גלעד פרץ‎"), "גלעד פרץ");
  });
});

describe("התאמת שם לעובד", () => {
  it("שם מלא מותאם", () => {
    const r = matchName("נעמה גבאי", ROSTER);
    assert.ok("person" in r && r.person.id === "2");
  });

  it("שם פרטי בלבד מותאם כשהוא יחיד", () => {
    const r = matchName("גלעד", ROSTER);
    assert.ok("person" in r && r.person.id === "1");
  });

  /*
   * זו הבדיקה שמצדיקה את כל המנגנון. "נועם" מתאים לשניים, וניחוש כאן
   * היה מכניס את האדם הלא נכון למשמרת — ואף אחד לא היה יודע עד שישי.
   */
  it("שם שמתאים לשניים מדווח ולא מנוחש", () => {
    const r = matchName("נועם", ROSTER);
    assert.ok(!("person" in r));
    assert.deepEqual(
      "candidates" in r ? r.candidates.map((c) => c.fullName).sort() : [],
      ["נועם אלמוג", "נועם ברגר"],
    );
  });

  it("התאמה היא על גבול מילה ולא על תת־מחרוזת", () => {
    const roster = [{ id: "x", fullName: "מייקל כהן" }];
    assert.ok(!("person" in matchName("מיי", roster)));
  });

  it("שם שאינו קיים אינו מותאם", () => {
    assert.ok(!("person" in matchName("בן הראלי", ROSTER)));
  });
});

describe("קריאת תאריך מהגיליון", () => {
  const key = (d: Date | null) => (d ? toDateInputValue(d) : null);

  it("קורא 28/8 כשישי הקרוב", () => {
    assert.equal(key(parseSheetDate("28/8", NOW)), "2026-08-28");
  });

  it("מקבל נקודה, אפס מוביל ושנה מלאה", () => {
    assert.equal(key(parseSheetDate("4.9", NOW)), "2026-09-04");
    assert.equal(key(parseSheetDate("04/09", NOW)), "2026-09-04");
    assert.equal(key(parseSheetDate("4/9/2026", NOW)), "2026-09-04");
    assert.equal(key(parseSheetDate("2026-09-04", NOW)), "2026-09-04");
  });

  /*
   * הדבקה בדצמבר של "2/1" מתכוונת לינואר הבא. בלי גלישת השנה היא הייתה
   * נוחתת אחת עשרה חודשים אחורה, על שישי שכבר עבר.
   */
  it("תאריך שכבר עבר בהרבה נקרא כשנה הבאה", () => {
    const december = zonedTime(2026, 12, 20, 12, 0);
    assert.equal(key(parseSheetDate("1/1", december)), "2027-01-01");
  });

  it("תאריך שעבר לפני שבוע נשאר בשנה הנוכחית", () => {
    assert.equal(key(parseSheetDate("14/8", NOW)), "2026-08-14");
  });

  it("טקסט שאינו תאריך מוחזר כ-null", () => {
    assert.equal(parseSheetDate("מלצרים", NOW), null);
    assert.equal(parseSheetDate("32/8", NOW), null);
  });
});

/** בונה הדבקה בפורמט של גיליון: שורת תאריכים, ואחריה שורות שמות */
function sheet(dates: string[], rows: string[][]): string {
  return [dates, ...rows].map((r) => r.join("\t")).join("\n");
}

describe("ייבוא הגיליון", () => {
  it("עמודה תקינה הופכת לשיבוצים לפי סדר ההגעה", () => {
    const { columns, problems, matched } = parseFridaySheet({
      text: sheet(["28/8"], [["נעמה גבאי"], ["ליאור דהן"], ["הילה שמעוני"]]),
      roster: ROSTER,
      capacity: 9,
      now: NOW,
    });
    assert.deepEqual(problems, []);
    assert.equal(matched, 3);
    assert.equal(columns.length, 1);
    assert.equal(columns[0].date, "2026-08-28");
    assert.deepEqual(
      columns[0].entries.map((e) => [e.position, e.fullName]),
      [
        [1, "נעמה גבאי"],
        [2, "ליאור דהן"],
        [3, "הילה שמעוני"],
      ],
    );
  });

  it("כמה עמודות = כמה שישיים", () => {
    const { columns } = parseFridaySheet({
      text: sheet(
        ["28/8", "4/9"],
        [
          ["נעמה גבאי", "דור רבינוביץ"],
          ["ליאור דהן", "מאיה נחום"],
        ],
      ),
      roster: ROSTER,
      capacity: 9,
      now: NOW,
    });
    assert.deepEqual(
      columns.map((c) => [c.date, c.entries.map((e) => e.fullName)]),
      [
        ["2026-08-28", ["נעמה גבאי", "ליאור דהן"]],
        ["2026-09-04", ["דור רבינוביץ", "מאיה נחום"]],
      ],
    );
  });

  /*
   * הבדיקה החשובה ביותר בקובץ.
   *
   * תא ריק באמצע עמודה הוא שורה שנמחקה בגיליון, לא משבצת ריקה. אם
   * המיקום היה נספר לפי מספר השורה, כל מי שמתחת לחור היה זז משבצת אחת
   * וכולם היו מגיעים בשעה הלא נכונה — ובקצה, מי שלא אמור לסגור היה סוגר.
   */
  it("תא ריק אינו מזיז את מי שמתחתיו", () => {
    const { columns } = parseFridaySheet({
      text: sheet(["28/8"], [["נעמה גבאי"], [""], ["ליאור דהן"], ["הילה שמעוני"]]),
      roster: ROSTER,
      capacity: 9,
      now: NOW,
    });
    assert.deepEqual(
      columns[0].entries.map((e) => [e.position, e.fullName]),
      [
        [1, "נעמה גבאי"],
        [2, "ליאור דהן"],
        [3, "הילה שמעוני"],
      ],
    );
  });

  it("שם שאינו קיים נשמר במקומו ומדווח", () => {
    const { columns, problems, matched, total } = parseFridaySheet({
      text: sheet(["28/8"], [["נעמה גבאי"], ["בן הראלי"], ["ליאור דהן"]]),
      roster: ROSTER,
      capacity: 9,
      now: NOW,
    });
    assert.equal(total, 3);
    assert.equal(matched, 2, "רק שניים ייכתבו");
    // המיקום נשמר: ליאור דהן נשאר שלישי ולא עולה לשני
    assert.deepEqual(
      columns[0].entries.map((e) => [e.position, e.employeeId]),
      [
        [1, "2"],
        [2, null],
        [3, "6"],
      ],
    );
    assert.deepEqual(problems, [
      { kind: "unknown-name", raw: "בן הראלי", date: "2026-08-28", position: 2 },
    ]);
  });

  it("שם דו־משמעי מדווח עם המועמדים", () => {
    const { problems } = parseFridaySheet({
      text: sheet(["28/8"], [["נועם"]]),
      roster: ROSTER,
      capacity: 9,
      now: NOW,
    });
    assert.equal(problems.length, 1);
    assert.equal(problems[0].kind, "ambiguous-name");
  });

  it("אותו אדם פעמיים באותו שישי מדווח", () => {
    const { problems } = parseFridaySheet({
      text: sheet(["28/8"], [["ליאור דהן"], ["נעמה גבאי"], ["ליאור דהן"]]),
      roster: ROSTER,
      capacity: 9,
      now: NOW,
    });
    const dup = problems.find((p) => p.kind === "duplicate");
    assert.ok(dup);
    assert.deepEqual(dup.kind === "duplicate" ? dup.positions : [], [1, 3]);
  });

  it("יותר שמות ממשבצות מדווח", () => {
    const { problems } = parseFridaySheet({
      text: sheet(["28/8"], [["נעמה גבאי"], ["ליאור דהן"], ["הילה שמעוני"]]),
      roster: ROSTER,
      capacity: 2,
      now: NOW,
    });
    assert.deepEqual(problems, [
      { kind: "over-capacity", date: "2026-08-28", role: "waiter", got: 3, capacity: 2 },
    ]);
  });

  it("תאריך שאינו שישי נדחה ולא נכתב", () => {
    const { columns, problems } = parseFridaySheet({
      text: sheet(["27/8"], [["נעמה גבאי"]]),
      roster: ROSTER,
      capacity: 9,
      now: NOW,
    });
    assert.equal(columns.length, 0, "העמודה כולה לא נכנסת");
    assert.equal(problems[0].kind, "not-friday");
  });

  it("כותרת שאינה תאריך מדווחת ולא מפילה את השאר", () => {
    const { columns, problems } = parseFridaySheet({
      text: sheet(["מלצרים", "28/8"], [["", "נעמה גבאי"]]),
      roster: ROSTER,
      capacity: 9,
      now: NOW,
    });
    assert.equal(problems[0].kind, "bad-date");
    assert.deepEqual(columns.map((c) => c.date), ["2026-08-28"]);
  });

  it("הדבקה ריקה אינה מפילה", () => {
    const empty = parseFridaySheet({
      text: "   \n\n",
      roster: ROSTER,
      capacity: 9,
      now: NOW,
    });
    assert.deepEqual(empty.columns, []);
    assert.equal(empty.total, 0);
  });

  it("מקבל גם הדבקה מופרדת בפסיקים", () => {
    const { columns } = parseFridaySheet({
      text: "28/8,4/9\nנעמה גבאי,דור רבינוביץ",
      roster: ROSTER,
      capacity: 9,
      now: NOW,
    });
    assert.deepEqual(
      columns.map((c) => c.entries[0].fullName),
      ["נעמה גבאי", "דור רבינוביץ"],
    );
  });
});

/** ברמנים כמו בגיליון האמיתי: "נועם" אחד, ושמות פרטיים בלבד */
const BARTENDERS: RosterPerson[] = [
  { id: "b1", fullName: "יונתן" },
  { id: "b2", fullName: "נועם וולך" },
  { id: "b3", fullName: "אלון זילבר" },
  { id: "b4", fullName: "ערן אילוז" },
  { id: "b5", fullName: "עדי בירנבאום" },
];

/** רביעי, 7.10.2026 — כשהגיליון של אוקטובר נקרא */
const OCT = zonedTime(2026, 10, 7, 12, 0);

describe("ייבוא הגיליון עם שורות הברמנים", () => {
  const withBartenders = (text: string) =>
    parseFridaySheet({
      text,
      roster: ROSTER,
      capacity: 7,
      leading: { role: "bartender", roster: BARTENDERS, capacity: 2 },
      now: OCT,
    });

  it("השורות שבראש העמודה הן ברמנים, והשאר מלצרים — כל תפקיד נספר בנפרד", () => {
    const { columns, problems } = withBartenders(
      sheet(["16/10"], [["יונתן"], ["נועם"], ["דור רבינוביץ"], ["אסף אוחיון"]]),
    );
    assert.deepEqual(problems, []);
    assert.deepEqual(
      columns[0].entries.map((e) => [e.role, e.position, e.row, e.fullName]),
      [
        ["bartender", 1, 1, "יונתן"],
        ["bartender", 2, 2, "נועם וולך"],
        ["waiter", 1, 3, "דור רבינוביץ"],
        ["waiter", 2, 4, "אסף אוחיון"],
      ],
    );
  });

  it("\"נועם\" חד־משמעי מול הברמנים, גם כשיש שני מלצרים בשם הזה", () => {
    const { columns, problems } = withBartenders(sheet(["16/10"], [["נועם"]]));
    assert.deepEqual(problems, []);
    assert.equal(columns[0].entries[0].employeeId, "b2");
  });

  it("הדבקה של מלצרים בלבד לא משתנה — הבלוק פשוט ריק", () => {
    const { columns, problems } = withBartenders(
      sheet(["16/10"], [["דור רבינוביץ"], ["אסף אוחיון"]]),
    );
    assert.deepEqual(problems, []);
    assert.deepEqual(
      columns[0].entries.map((e) => [e.role, e.position]),
      [
        ["waiter", 1],
        ["waiter", 2],
      ],
    );
  });

  it("הבלוק נסגר כשהוא מתמלא, גם אם השם הבא הוא ברמן", () => {
    const { columns, problems } = withBartenders(
      sheet(["16/10"], [["יונתן"], ["אלון"], ["עדי"]]),
    );
    assert.deepEqual(
      columns[0].entries.map((e) => e.role),
      ["bartender", "bartender", "waiter"],
    );
    // ברמן שלישי אינו מלצר — מדווח, ולא נכתב בשקט
    assert.equal(problems[0].kind, "unknown-name");
  });

  it("מעבר לקיבולת המלצרים מדווח לפי התפקיד", () => {
    const names = ["גלעד פרץ", "נעמה גבאי", "הילה שמעוני", "ליאור דהן", "דור רבינוביץ", "מאיה נחום", "אסף אוחיון", "נועם אלמוג"];
    const { problems } = withBartenders(sheet(["16/10"], [["יונתן"], ...names.map((n) => [n])]));
    assert.deepEqual(problems, [
      { kind: "over-capacity", date: "2026-10-16", role: "waiter", got: 8, capacity: 7 },
    ]);
  });
});

describe("הצורה החדשה של הגיליון: ברמנים בתחתית", () => {
  const parse = (text: string) =>
    parseFridaySheet({
      text,
      roster: ROSTER,
      capacity: 7,
      leading: { role: "bartender", roster: BARTENDERS, capacity: 2 },
      trailing: { role: "bartender", roster: BARTENDERS, capacity: 2 },
      now: OCT,
    });

  it("מלצרים, שורה ריקה, ואז הברמנים — כל תפקיד נספר בנפרד", () => {
    const text = [
      ["23/10", "30/10"].join("\t"),
      ["הילה שמעוני", "דור רבינוביץ"].join("\t"),
      ["ליאור דהן", ""].join("\t"),
      ["", ""].join("\t"),
      ["עדי בירנבאום", "אלון זילבר"].join("\t"),
      ["ערן אילוז", "יונתן"].join("\t"),
    ].join("\n");
    const { columns, problems } = parse(text);
    assert.deepEqual(problems, []);
    assert.deepEqual(
      columns[0].entries.map((e) => [e.role, e.position, e.fullName]),
      [
        ["waiter", 1, "הילה שמעוני"],
        ["waiter", 2, "ליאור דהן"],
        ["bartender", 1, "עדי בירנבאום"],
        ["bartender", 2, "ערן אילוז"],
      ],
    );
    assert.deepEqual(
      columns[1].entries.map((e) => [e.role, e.position]),
      [
        ["waiter", 1],
        ["bartender", 1],
        ["bartender", 2],
      ],
    );
  });

  it("בלי שורה ריקה — נקרא בדיוק כמו קודם (ברמנים בראש)", () => {
    const { columns } = parse(sheet(["16/10"], [["יונתן"], ["נועם"], ["דור רבינוביץ"]]));
    assert.deepEqual(
      columns[0].entries.map((e) => e.role),
      ["bartender", "bartender", "waiter"],
    );
  });
});
