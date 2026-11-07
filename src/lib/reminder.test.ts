import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  REMINDER_WINDOW_HOURS,
  nextReminderRun,
  reminderBlocked,
  reminderStageFor,
  whoNeedsReminder,
} from "./week";

const now = new Date("2026-10-08T09:00:00.000Z");
const inHours = (h: number) => new Date(now.getTime() + h * 60 * 60 * 1000);

const week = (over: Partial<Parameters<typeof whoNeedsReminder>[0]["weeks"][number]> = {}) => ({
  id: "w1",
  status: "open",
  deadline: inHours(24),
  deletedAt: null,
  submittedIds: [],
  reminded: [],
  ...over,
});

const everyone = ["a", "b", "c"];
const run = (weeks: ReturnType<typeof week>[]) =>
  whoNeedsReminder({ weeks, employeeIds: everyone, now });

describe("מי מקבל תזכורת להגיש", () => {
  it("מועד אחרון מחר — כולם שלא הגישו, תזכורת \"יום לפני\"", () => {
    assert.deepEqual(run([week()]), [
      { weekId: "w1", stage: "day-before", employeeIds: ["a", "b", "c"] },
    ]);
  });

  it("מי שהגיש אינו מקבל", () => {
    assert.deepEqual(run([week({ submittedIds: ["b"] })]), [
      { weekId: "w1", stage: "day-before", employeeIds: ["a", "c"] },
    ]);
  });

  /*
   * ה-cron רץ פעמיים בכל יום, ובלי זה אותו עובד היה מקבל תזכורת בכל
   * ריצה עד המועד האחרון.
   */
  it("מי שכבר קיבל את התזכורת הזו אינו מקבל שוב", () => {
    const reminded = [
      { employeeId: "a", stage: "day-before" },
      { employeeId: "c", stage: "day-before" },
    ];
    assert.deepEqual(run([week({ reminded })]), [
      { weekId: "w1", stage: "day-before", employeeIds: ["b"] },
    ]);
  });

  it("כמה שעות לפני המועד — תזכורת אחרת, גם למי שקיבל את \"יום לפני\"", () => {
    const reminded = [{ employeeId: "a", stage: "day-before" }];
    assert.deepEqual(run([week({ deadline: inHours(3), reminded })]), [
      { weekId: "w1", stage: "last-hours", employeeIds: ["a", "b", "c"] },
    ]);
  });

  it("ידנית לא נחשבת — האוטומטית יוצאת בכל זאת", () => {
    const reminded = [{ employeeId: "a", stage: "manual" }];
    assert.deepEqual(run([week({ reminded })]), [
      { weekId: "w1", stage: "day-before", employeeIds: ["a", "b", "c"] },
    ]);
  });

  it("מועד אחרון רחוק מהחלון — לא נשלח כלום", () => {
    assert.deepEqual(run([week({ deadline: inHours(REMINDER_WINDOW_HOURS + 1) })]), []);
  });

  it("מועד אחרון שכבר חלף — לא נשלח כלום", () => {
    assert.deepEqual(run([week({ deadline: inHours(-1) })]), []);
  });

  it("שבוע שאינו פתוח אינו מזכיר", () => {
    assert.deepEqual(run([week({ status: "closed" })]), []);
    assert.deepEqual(run([week({ status: "published" })]), []);
  });

  it("שבוע מאורכב אינו מזכיר", () => {
    assert.deepEqual(run([week({ deletedAt: new Date() })]), []);
  });

  it("כשכולם הגישו אין שורה לשבוע", () => {
    assert.deepEqual(run([week({ submittedIds: everyone })]), []);
  });

  it("שני שבועות פתוחים — כל אחד בנפרד", () => {
    const result = run([
      week({ id: "near", deadline: inHours(10), submittedIds: ["a"] }),
      week({ id: "far", deadline: inHours(100) }),
      week({ id: "soon", deadline: inHours(30), submittedIds: ["b", "c"] }),
    ]);
    assert.deepEqual(result, [
      { weekId: "near", stage: "day-before", employeeIds: ["b", "c"] },
      { weekId: "soon", stage: "day-before", employeeIds: ["a"] },
    ]);
  });
});

describe("תזכורת לא יוצאת פעמיים", () => {
  const ago = (h: number) => new Date(now.getTime() - h * 60 * 60 * 1000);

  it("אוטומטית: פעם אחת בשבוע מכל סוג, גם אם השעון רץ שוב", () => {
    const previous = [{ stage: "day-before", createdAt: ago(48) }];
    assert.equal(reminderBlocked({ stage: "day-before", previous, now }), true);
    assert.equal(reminderBlocked({ stage: "last-hours", previous, now }), false);
  });

  /* 11/10: הכפתור נלחץ ב-15:40 ושוב ב-16:40 — 36 עובדים קיבלו פעמיים */
  it("ידנית: לחיצה שנייה אחרי שעה לא שולחת שוב", () => {
    const previous = [{ stage: "manual", createdAt: ago(1) }];
    assert.equal(reminderBlocked({ stage: "manual", previous, now }), true);
  });

  it("ידנית: אחרי יממה מותר שוב", () => {
    const previous = [{ stage: "manual", createdAt: ago(25) }];
    assert.equal(reminderBlocked({ stage: "manual", previous, now }), false);
  });

  it("כל סוג לעצמו: ידנית לא מבטלת אוטומטית, ולהפך", () => {
    assert.equal(
      reminderBlocked({ stage: "day-before", previous: [{ stage: "manual", createdAt: ago(1) }], now }),
      false,
    );
    assert.equal(
      reminderBlocked({ stage: "manual", previous: [{ stage: "day-before", createdAt: ago(1) }], now }),
      false,
    );
  });
});

describe("איזו תזכורת ומתי", () => {
  it("לפי הזמן שנשאר למועד", () => {
    assert.equal(reminderStageFor(inHours(40), now), null);
    assert.equal(reminderStageFor(inHours(30), now), "day-before");
    assert.equal(reminderStageFor(inHours(8), now), "last-hours");
    assert.equal(reminderStageFor(inHours(2), now), "last-hours");
    assert.equal(reminderStageFor(inHours(-1), now), null);
  });

  /*
   * המועד הרגיל: שישי 20:00 בשעון ישראל. בחורף (UTC+2) זה 18:00 UTC.
   * השעון רץ ב-09:00 וב-15:00 UTC.
   */
  const deadline = new Date("2026-10-30T18:00:00.000Z");
  const sunday = new Date("2026-10-25T08:00:00.000Z");

  it("\"יום לפני\" — חמישי ב-09:00 UTC (11:00 בחורף)", () => {
    assert.equal(
      nextReminderRun("day-before", deadline, sunday)?.toISOString(),
      "2026-10-29T09:00:00.000Z",
    );
  });

  it("\"כמה שעות לפני\" — שישי ב-15:00 UTC, שלוש שעות לפני המועד", () => {
    assert.equal(
      nextReminderRun("last-hours", deadline, sunday)?.toISOString(),
      "2026-10-30T15:00:00.000Z",
    );
  });

  it("מועד קרוב מדי — \"יום לפני\" כבר לא תצא", () => {
    const soon = new Date("2026-10-25T16:00:00.000Z");
    assert.equal(nextReminderRun("day-before", soon, sunday), null);
    assert.equal(
      nextReminderRun("last-hours", soon, sunday)?.toISOString(),
      "2026-10-25T09:00:00.000Z",
    );
  });

  it("מועד שעבר — שום דבר", () => {
    assert.equal(nextReminderRun("last-hours", inHours(-1), now), null);
  });
});
