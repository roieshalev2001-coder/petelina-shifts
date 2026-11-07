import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildGrid,
  daySlotsInOrder,
  isContinuousDay,
  showsStartTime,
  type GridSlot,
} from "./grid";

/** משבצת לבדיקה. המזהה מקודד את היום והמיקום, כדי שהשגיאות ייקראו */
function slot(
  dayOfWeek: number,
  sortOrder: number,
  role: string,
  period: string,
  startTime: string,
  endTime: string,
  label: string | null = null,
): GridSlot {
  return {
    id: `d${dayOfWeek}-${sortOrder}`,
    dayOfWeek,
    role,
    period,
    startTime,
    endTime,
    label,
    sortOrder,
  };
}

/** ראשון כמו בתבנית בייצור: 16 משבצות, בוקר וערב */
const SUNDAY: GridSlot[] = [
  slot(0, 0, "manager", "morning", "07:00", "16:00", 'אחמ"ש בוקר'),
  slot(0, 1, "bartender", "morning", "07:15", "14:00", "ברמן בוקר"),
  slot(0, 2, "bartender", "morning", "12:30", "17:30", "ברמן צהריים"),
  slot(0, 3, "bartender", "evening", "17:30", "23:00", "ברמן ערב"),
  slot(0, 4, "waiter", "morning", "07:15", "13:00"),
  slot(0, 5, "waiter", "morning", "08:15", "15:00"),
  slot(0, 6, "waiter", "morning", "09:00", "16:00"),
  slot(0, 7, "waiter", "morning", "10:00", "17:00"),
  slot(0, 8, "waiter", "morning", "11:15", "17:00"),
  slot(0, 9, "waiter", "morning", "11:30", "17:00"),
  slot(0, 10, "manager", "evening", "16:00", "CLOSING", "אחראי ערב"),
  slot(0, 11, "waiter", "evening", "16:00", "22:15"),
  slot(0, 12, "waiter", "evening", "16:00", "22:15"),
  slot(0, 13, "waiter", "evening", "16:30", "CLOSING"),
  slot(0, 14, "waiter", "evening", "17:30", "CLOSING"),
  slot(0, 15, "waiter", "evening", "18:30", "22:00"),
];

/** שישי בתבנית של 7 מלצרים: 2 אחמ"שים, 2 ברמנים, הכול יום אחד רצוף */
const FRIDAY: GridSlot[] = [
  slot(5, 0, "manager", "allday", "07:00", "15:00", 'אחמ"ש בוקר'),
  slot(5, 1, "manager", "allday", "14:00", "CLOSING", 'אחמ"ש סגירה'),
  slot(5, 2, "bartender", "allday", "07:15", "14:00", "ברמן בוקר"),
  slot(5, 3, "bartender", "allday", "13:30", "CLOSING", "ברמן צהריים"),
  slot(5, 4, "waiter", "allday", "07:15", "15:00"),
  slot(5, 5, "waiter", "allday", "07:45", "15:00"),
  slot(5, 6, "waiter", "allday", "08:00", "15:30"),
  slot(5, 7, "waiter", "allday", "08:15", "16:00"),
  slot(5, 8, "waiter", "allday", "08:30", "16:00"),
  slot(5, 9, "waiter", "allday", "08:45", "16:30"),
  slot(5, 10, "waiter", "allday", "09:00", "16:30"),
];

const ids = (cell: { slots: GridSlot[] } | null) => cell?.slots.map((s) => s.id) ?? null;

describe("סידור בפריסת הגיליון", () => {
  it("יום חול: משבצת אחת לכל שורה, באותו תפקיד", () => {
    const rows = buildGrid(SUNDAY, [0]);
    assert.equal(rows.length, 16);
    rows.forEach((row, i) => {
      assert.deepEqual(ids(row.cells[0]), [`d0-${i}`]);
      assert.equal(row.cells[0]!.role, row.role);
    });
  });

  it("שישי: שני האחמ\"שים כתובים יחד בתא של אחמ\"ש הבוקר", () => {
    const rows = buildGrid([...SUNDAY, ...FRIDAY], [0, 5]);
    const first = rows[0];
    assert.equal(first.role, "manager");
    assert.deepEqual(ids(first.cells[1]), ["d5-0", "d5-1"]);
  });

  it("שישי: שורת אחראי הערב ממשיכה את המלצרים — בלי בלוק כתום באמצע", () => {
    const rows = buildGrid([...SUNDAY, ...FRIDAY], [0, 5]);
    const evening = rows.find((r) => r.prefix === "אחראי ערב")!;
    const cell = evening.cells[1]!;
    assert.equal(cell.role, "waiter");
    // המלצר השביעי: שישה בשורות המלצרים של הבוקר, והשביעי כאן
    assert.deepEqual(ids(cell), ["d5-10"]);
    // ובראשון השורה נשארת של אחראי הערב
    assert.equal(evening.cells[0]!.role, "manager");
  });

  it("שישי: המלצרים רצים ברצף לפי שעת ההגעה", () => {
    const rows = buildGrid([...SUNDAY, ...FRIDAY], [0, 5]);
    const waiters = daySlotsInOrder(rows, 1)
      .filter((x) => x.cell.role === "waiter")
      .map((x) => x.slot.startTime);
    assert.deepEqual(waiters, ["07:15", "07:45", "08:00", "08:15", "08:30", "08:45", "09:00"]);
  });

  it("רשימת היום עוברת על כל משבצת פעם אחת, גם בתא משותף", () => {
    const rows = buildGrid([...SUNDAY, ...FRIDAY], [0, 5]);
    const listed = daySlotsInOrder(rows, 1).map((x) => x.slot.id).sort();
    assert.deepEqual(listed, FRIDAY.map((s) => s.id).sort());
  });

  it("יום רציף מזוהה לפי הנתונים", () => {
    assert.equal(isContinuousDay(FRIDAY), true);
    assert.equal(isContinuousDay(SUNDAY), false);
    assert.equal(isContinuousDay([]), false);
  });

  it("שבוע שכולו יום רציף: אין שורת אחמ\"ש ריקה", () => {
    const rows = buildGrid(FRIDAY, [5]);
    assert.equal(rows.filter((r) => r.role === "manager").length, 1);
    assert.ok(rows.every((r) => r.cells.some(Boolean)));
  });

  it("משבצות עודפות מקבלות שורה בסוף הקבוצה שלהן", () => {
    // שני בלי ברמן ערב ועם מלצר נוסף — אותו מספר משבצות, ולכן ראשון נשאר המייצג
    const extra = slot(1, 16, "waiter", "evening", "19:00", "23:00");
    const monday = SUNDAY.filter((s) => s.label !== "ברמן ערב").map((s) => ({
      ...s,
      id: s.id.replace("d0", "d1"),
      dayOfWeek: 1,
    }));
    const rows = buildGrid([...SUNDAY, ...monday, extra], [0, 1]);
    const added = rows.find((r) => r.key === `x${extra.id}`)!;
    assert.equal(added.role, "waiter");
    assert.deepEqual(ids(added.cells[1]), [extra.id]);
    assert.equal(added.cells[0], null);
  });

  it("שישי: שעת הגעה רק למלצרים — לא לאחמ\"שים ולא לברמנים", () => {
    const shown = FRIDAY.filter(showsStartTime).map((s) => s.role);
    assert.ok(shown.every((r) => r === "waiter"));
    assert.equal(shown.length, 7);
    // ביום חול כל משבצת מציגה את השעה שלה כשהיא שונה מהשורה
    assert.ok(SUNDAY.every(showsStartTime));
  });
});

describe("שעות השורה אחרי שינוי שעות לעובד אחד", () => {
  /** ראשון–חמישי באותה תבנית, עם שינוי שעות ביום אחד או יותר */
  const week = (changed: Record<number, [string, string]>) =>
    [0, 1, 2, 3, 4].flatMap((day) =>
      SUNDAY.map((s) => {
        const own = s.sortOrder === 4 ? changed[day] : undefined;
        return {
          ...s,
          id: `d${day}-${s.sortOrder}`,
          dayOfWeek: day,
          ...(own ? { startTime: own[0], endTime: own[1] } : {}),
        };
      }),
    );
  const firstWaiterRow = (rows: ReturnType<typeof buildGrid>) =>
    rows.find((r) => r.role === "waiter")!;

  it("שינוי ביום המייצג לא מזיז את שעות השורה", () => {
    const rows = buildGrid(week({ 0: ["08:00", "13:00"] }), [0, 1, 2, 3, 4]);
    const row = firstWaiterRow(rows);
    assert.equal(row.startTime, "07:15");
    assert.equal(row.endTime, "13:00");
    // והתא של ראשון שומר את השעות שלו
    assert.equal(row.cells[0]!.slots[0].startTime, "08:00");
  });

  it("כשרוב הימים השתנו — השורה הולכת אחריהם", () => {
    const rows = buildGrid(
      week({ 0: ["08:00", "13:00"], 1: ["08:00", "13:00"], 2: ["08:00", "13:00"] }),
      [0, 1, 2, 3, 4],
    );
    assert.equal(firstWaiterRow(rows).startTime, "08:00");
  });

  it("'רק הגעה' בבלוק לא מפצל את הקולות — השורה נשארת בשעות של הרוב", () => {
    // שלושה ימים ב-07:15, ושניים מהם "רק הגעה"; שני ימים ב-08:00
    const slots = week({ 3: ["08:00", "13:00"], 4: ["08:00", "13:00"] }).map((s) =>
      s.sortOrder === 4 && (s.dayOfWeek === 1 || s.dayOfWeek === 2)
        ? { ...s, timeDisplay: "start" }
        : s,
    );
    assert.equal(firstWaiterRow(buildGrid(slots, [0, 1, 2, 3, 4])).startTime, "07:15");
  });
});

describe("בלוק נוסף בשבוע אחד", () => {
  it("מלצר בוקר נוסף יושב בסוף מלצרי הבוקר, לא אחרי הערב", () => {
    // שני בלי ברמן ערב — כך יש לו אותו מספר משבצות כמו לראשון, וראשון נשאר היום המייצג
    const monday = SUNDAY.filter((s) => s.label !== "ברמן ערב").map((s) => ({
      ...s,
      id: s.id.replace("d0", "d1"),
      dayOfWeek: 1,
    }));
    // "+ בלוק" נכנס תמיד בסוף הקבוצה שלו (ראה addWeekSlot) — אחרי מלצר הבוקר האחרון
    const extra = slot(1, 9.5, "waiter", "morning", "11:30", "17:00");
    const rows = buildGrid([...SUNDAY, ...monday, { ...extra, id: "extra" }], [0, 1]);
    const at = rows.findIndex((r) => r.key === "xextra");
    const lastMorningWaiter = rows.findLastIndex(
      (r, i) => i !== at && r.role === "waiter" && r.period === "morning",
    );
    assert.equal(at, lastMorningWaiter + 1);
    assert.equal(rows[at + 1].role, "manager"); // אחריו אחראי הערב
  });
});

describe("בלוק שנכנס באמצע היום", () => {
  it("מי שאחריו יורד שורה אחת — ביום שלו בלבד", () => {
    const monday = SUNDAY.filter((s) => s.label !== "ברמן ערב").map((s) => ({
      ...s,
      id: s.id.replace("d0", "d1"),
      dayOfWeek: 1,
    }));
    // מלצר בוקר 08:30 — בין 08:15 (sortOrder 5) ל-09:00 (sortOrder 6)
    const added = { ...slot(1, 5.5, "waiter", "morning", "08:30", "15:00"), id: "added" };
    const rows = buildGrid([...SUNDAY, ...monday, added], [0, 1]);
    const morning = rows.filter((r) => r.role === "waiter" && r.period === "morning");
    // ראשון לא זז
    assert.deepEqual(
      morning.map((r) => r.cells[0]?.slots[0].id ?? null),
      ["d0-4", "d0-5", "d0-6", "d0-7", "d0-8", "d0-9", null],
    );
    // בשני: החדש בשורה השלישית, וכל מי שאחריו שורה אחת למטה
    assert.deepEqual(
      morning.map((r) => r.cells[1]?.slots[0].id ?? null),
      ["d1-4", "d1-5", "added", "d1-6", "d1-7", "d1-8", "d1-9"],
    );
  });
});
