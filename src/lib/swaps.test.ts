import assert from "node:assert/strict";
import { zonedTime } from "./time";
import { describe, it } from "node:test";
import {
  CANCEL_BLOCK_LABEL,
  CLAIM_BLOCK_LABEL,
  DECISION_BLOCK_LABEL,
  SWAP_CUTOFF_HOURS,
  cancelBlock,
  claimBlock,
  decisionBlock,
  isBeforeCutoff,
  minutesUntilShift,
  offerBlock,
  offeredHours,
  shiftStartsAt,
} from "./swaps";

/*
 * התאריכים נבנים עם הבנאי המקומי `new Date(2026, 7, 18, …)` ולא ממחרוזת ISO,
 * כדי שהסוויטה תעבור בכל אזור זמן — אותו דפוס כמו ב-time.test.ts.
 * חודש 7 = אוגוסט. 18/8/2026 הוא יום שלישי.
 */
// חצות בישראל במפורש — ראה ההערה ב-calendar.test.ts
const TUESDAY = zonedTime(2026, 8, 18);

/** משמרת ערב של מלצר, יום שלישי 16:30 */
const eveningShift = {
  slotId: "s1",
  role: "waiter" as const,
  dayOfWeek: 2,
  date: TUESDAY,
  startTime: "16:30",
  endTime: "23:00",
};

describe("מתי המשמרת מתחילה", () => {
  it("מחבר את שעת ההתחלה לתאריך המשבצת", () => {
    assert.deepEqual(shiftStartsAt(eveningShift), zonedTime(2026, 8, 18, 16, 30));
  });

  it("משמרת פתיחה מוקדמת", () => {
    assert.deepEqual(
      shiftStartsAt({ date: TUESDAY, startTime: "07:15" }),
      zonedTime(2026, 8, 18, 7, 15),
    );
  });

  it("סופר דקות אחורה כשהמשמרת כבר התחילה", () => {
    const now = zonedTime(2026, 8, 18, 17, 30);
    assert.equal(minutesUntilShift(eveningShift, now), -60);
  });
});

describe("חלון 24 השעות", () => {
  it("בדיוק 24 שעות לפני — עדיין מותר", () => {
    // הגבול עצמו נכלל: מי שמגלה יום מראש בדיוק לא ייחסם בגלל שנייה
    const now = zonedTime(2026, 8, 17, 16, 30);
    assert.equal(minutesUntilShift(eveningShift, now), SWAP_CUTOFF_HOURS * 60);
    assert.equal(isBeforeCutoff(eveningShift, now), true);
  });

  it("דקה אחרי הגבול — חסום", () => {
    assert.equal(isBeforeCutoff(eveningShift, zonedTime(2026, 8, 17, 16, 31)), false);
  });

  it("יומיים לפני — מותר", () => {
    assert.equal(isBeforeCutoff(eveningShift, zonedTime(2026, 8, 16, 9, 0)), true);
  });

  it("אחרי שהמשמרת התחילה — חסום", () => {
    assert.equal(isBeforeCutoff(eveningShift, zonedTime(2026, 8, 18, 17, 0)), false);
  });

  it("אורך החלון ניתן לשינוי", () => {
    const now = zonedTime(2026, 8, 17, 20, 0); // 20:30 שעות לפני
    assert.equal(isBeforeCutoff(eveningShift, now), false);
    assert.equal(isBeforeCutoff(eveningShift, now, 12), true);
  });
});

describe("השעות שהתופס מקבל", () => {
  it("משבצת רגילה — שעות המשבצת עצמן", () => {
    assert.deepEqual(offeredHours({ startTime: "08:15", endTime: "15:00" }, "23:00"), {
      start: "08:15",
      end: "15:00",
    });
  });

  it('"עד סגירה" נפתר לשעת הסגירה של אותו יום', () => {
    assert.deepEqual(offeredHours({ startTime: "16:30", endTime: "CLOSING" }, "23:00"), {
      start: "16:30",
      end: "23:00",
    });
  });

  it("בשישי הסגירה מוקדמת יותר", () => {
    // אותה משבצת בדיוק, שעת סגירה אחרת — ולכן ההצעה חייבת להקפיא את השעה
    assert.deepEqual(offeredHours({ startTime: "12:30", endTime: "CLOSING" }, "17:30"), {
      start: "12:30",
      end: "17:30",
    });
  });
});

describe("מי רשאי למסור משמרת", () => {
  const base = {
    weekStatus: "published",
    slot: eveningShift,
    assignedToId: "me",
    requesterId: "me",
    hasOpenOffer: false,
    now: zonedTime(2026, 8, 16, 9, 0),
  };

  it("המשמרת שלי בשבוע שפורסם, הרבה לפני — מותר", () => {
    assert.equal(offerBlock(base), null);
  });

  it("שבוע שטרם פורסם", () => {
    assert.equal(offerBlock({ ...base, weekStatus: "closed" }), "week-not-published");
  });

  it("משמרת של מישהו אחר", () => {
    assert.equal(offerBlock({ ...base, assignedToId: "someone-else" }), "not-your-shift");
  });

  it("משבצת ריקה אינה שלי למסור", () => {
    assert.equal(offerBlock({ ...base, assignedToId: null }), "not-your-shift");
  });

  it("כבר מסרתי אותה", () => {
    assert.equal(offerBlock({ ...base, hasOpenOffer: true }), "already-offered");
  });

  it("מאוחר מדי", () => {
    assert.equal(
      offerBlock({ ...base, now: zonedTime(2026, 8, 18, 9, 0) }),
      "past-cutoff",
    );
  });

  it('"כבר מוצעת" גובר על "מאוחר מדי" — אפשר עדיין לבטל', () => {
    assert.equal(
      offerBlock({ ...base, hasOpenOffer: true, now: zonedTime(2026, 8, 18, 9, 0) }),
      "already-offered",
    );
  });
});

describe("מי רשאי לתפוס משמרת", () => {
  const base = {
    offer: { status: "open", offeredById: "dana" },
    slot: eveningShift,
    claimer: { id: "ron", roles: "waiter" },
    claimerAssignedDays: [] as number[],
    now: zonedTime(2026, 8, 16, 9, 0),
  };

  it("מלצר פנוי באותו יום — מותר", () => {
    assert.equal(claimBlock(base), null);
  });

  it("מי שמסר לא יכול לתפוס את עצמו", () => {
    assert.equal(claimBlock({ ...base, claimer: { id: "dana", roles: "waiter" } }), "own-offer");
  });

  it("הצעה שכבר נתפסה", () => {
    assert.equal(
      claimBlock({ ...base, offer: { status: "claimed", offeredById: "dana" } }),
      "not-open",
    );
  });

  it("הצעה שבוטלה", () => {
    assert.equal(
      claimBlock({ ...base, offer: { status: "cancelled", offeredById: "dana" } }),
      "not-open",
    );
  });

  it("תפקיד לא מתאים — אחמ\"ש לא רואה משמרת מלצר", () => {
    assert.equal(
      claimBlock({ ...base, claimer: { id: "ron", roles: "manager" } }),
      "wrong-role",
    );
  });

  it("עובד רב-תפקידי כשיר לכל אחד מהם", () => {
    assert.equal(
      claimBlock({ ...base, claimer: { id: "ron", roles: "bartender,waiter" } }),
      null,
    );
  });

  it("כבר משובץ באותו יום", () => {
    assert.equal(claimBlock({ ...base, claimerAssignedDays: [2] }), "busy-same-day");
  });

  it("משובץ בימים אחרים — לא מפריע", () => {
    assert.equal(claimBlock({ ...base, claimerAssignedDays: [0, 1, 4] }), null);
  });

  it("מאוחר מדי לתפוס", () => {
    assert.equal(claimBlock({ ...base, now: zonedTime(2026, 8, 18, 9, 0) }), "past-cutoff");
  });
});

/*
 * סדר הבדיקות הוא חוזה: הוא קובע איזו הודעה העובד רואה כששתי סיבות
 * מתקיימות יחד. שינוי הסדר משנה את חוויית המשתמש, ולכן הוא מקובע כאן.
 */
describe("סדר העדיפות בין סיבות הפסילה", () => {
  const slot = eveningShift;
  const early = zonedTime(2026, 8, 16, 9, 0);
  const late = zonedTime(2026, 8, 18, 9, 0);

  it('"זו המשמרת שלך" גובר על תפקיד לא מתאים', () => {
    assert.equal(
      claimBlock({
        offer: { status: "open", offeredById: "dana" },
        slot,
        claimer: { id: "dana", roles: "manager" },
        claimerAssignedDays: [2],
        now: late,
      }),
      "own-offer",
    );
  });

  it('"כבר נתפסה" גובר על "מאוחר מדי"', () => {
    assert.equal(
      claimBlock({
        offer: { status: "claimed", offeredById: "dana" },
        slot,
        claimer: { id: "ron", roles: "waiter" },
        claimerAssignedDays: [],
        now: late,
      }),
      "not-open",
    );
  });

  it('"מאוחר מדי" גובר על תפקיד לא מתאים', () => {
    assert.equal(
      claimBlock({
        offer: { status: "open", offeredById: "dana" },
        slot,
        claimer: { id: "ron", roles: "manager" },
        claimerAssignedDays: [],
        now: late,
      }),
      "past-cutoff",
    );
  });

  it('תפקיד לא מתאים גובר על "תפוס באותו יום"', () => {
    assert.equal(
      claimBlock({
        offer: { status: "open", offeredById: "dana" },
        slot,
        claimer: { id: "ron", roles: "manager" },
        claimerAssignedDays: [2],
        now: early,
      }),
      "wrong-role",
    );
  });
});

/*
 * מכונת המצבים של האישור.
 *
 * המשמרת עוברת רק במעבר ל-claimed. הבדיקות כאן מקבעות מי יכול לעשות מה
 * בכל מצב — בלי מסד ובלי רשת, כי אלה הכללים ולא המימוש שלהם.
 */
describe("אישור חילוף", () => {
  const offer = (status: string, offeredById = "alice") => ({ status, offeredById });

  it("רק הצעה שממתינה ניתנת להכרעה", () => {
    assert.equal(decisionBlock(offer("pending")), null);
    for (const status of ["open", "claimed", "cancelled"]) {
      assert.equal(decisionBlock(offer(status)), "not-pending", status);
    }
  });

  it("תופס שני מקבל הודעה שמבדילה בין ממתין לנתפס", () => {
    const base = {
      slot: { date: TUESDAY, startTime: "16:30", role: "waiter" as const, dayOfWeek: 2 },
      claimer: { id: "bob", roles: "waiter" },
      claimerAssignedDays: [],
      now: zonedTime(2026, 8, 17, 10, 0),
    };
    assert.equal(claimBlock({ ...base, offer: offer("pending") }), "pending-approval");
    assert.equal(claimBlock({ ...base, offer: offer("claimed") }), "not-open");
    assert.equal(claimBlock({ ...base, offer: offer("open") }), null);
  });

  it("המוסר יכול לבטל רק כל עוד איש לא לקח", () => {
    assert.equal(cancelBlock({ offer: offer("open"), employeeId: "alice" }), null);
    assert.equal(
      cancelBlock({ offer: offer("pending"), employeeId: "alice" }),
      "not-open",
      "אחרי שמישהו לקח, ההחלטה אצל המנהל",
    );
    assert.equal(
      cancelBlock({ offer: offer("open"), employeeId: "bob" }),
      "not-yours",
    );
  });

  it("לכל חסימה יש הודעה בעברית", () => {
    for (const key of Object.keys(CLAIM_BLOCK_LABEL)) {
      assert.ok(CLAIM_BLOCK_LABEL[key as keyof typeof CLAIM_BLOCK_LABEL].length > 0, key);
    }
    assert.ok(DECISION_BLOCK_LABEL["not-pending"].length > 0);
    for (const key of Object.keys(CANCEL_BLOCK_LABEL)) {
      assert.ok(CANCEL_BLOCK_LABEL[key as keyof typeof CANCEL_BLOCK_LABEL].length > 0, key);
    }
  });
});
