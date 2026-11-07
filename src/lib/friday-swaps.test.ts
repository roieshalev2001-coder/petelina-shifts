import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  applySwap,
  cancelBlock,
  claimBlock,
  decisionBlock,
  offerBlock,
  type PlanRef,
} from "./friday-swaps";

const TODAY = "2026-08-19";

const plan = (over: Partial<PlanRef> = {}): PlanRef => ({
  id: "p1",
  date: "2026-09-04",
  role: "waiter",
  employeeId: "אני",
  ...over,
});

describe("הצעת שישי", () => {
  it("שישי שלי ולפני הפרסום — מותר", () => {
    assert.equal(
      offerBlock({
        plan: plan(),
        employeeId: "אני",
        hasOpenOffer: false,
        weekPublished: false,
        today: TODAY,
      }),
      null,
    );
  });

  it("שישי של מישהו אחר — אסור", () => {
    assert.equal(
      offerBlock({
        plan: plan({ employeeId: "אחר" }),
        employeeId: "אני",
        hasOpenOffer: false,
        weekPublished: false,
        today: TODAY,
      }),
      "not-yours",
    );
  });

  /*
   * הגבול בין שני המנגנונים. מרגע שהשבוע פורסם המציאות היא הסידור,
   * ולוח החילופים הרגיל הוא הכלי — שני מסלולים על אותה משמרת היו
   * יכולים להזיז אותה פעמיים.
   */
  it("אחרי פרסום השבוע — עוברים ללוח החילופים", () => {
    assert.equal(
      offerBlock({
        plan: plan(),
        employeeId: "אני",
        hasOpenOffer: false,
        weekPublished: true,
        today: TODAY,
      }),
      "week-published",
    );
  });

  it("שישי שעבר — אסור", () => {
    assert.equal(
      offerBlock({
        plan: plan({ date: "2026-08-07" }),
        employeeId: "אני",
        hasOpenOffer: false,
        weekPublished: false,
        today: TODAY,
      }),
      "past",
    );
  });

  it("הצעה כפולה נחסמת", () => {
    assert.equal(
      offerBlock({
        plan: plan(),
        employeeId: "אני",
        hasOpenOffer: true,
        weekPublished: false,
        today: TODAY,
      }),
      "already-offered",
    );
  });
});

describe("לקיחת הצעה", () => {
  const offer = { status: "open", mode: "give", offeredById: "אני" };

  it("מלצר פנוי יכול לקחת מסירה", () => {
    assert.equal(
      claimBlock({
        offer,
        offered: plan(),
        claimerId: "אחר",
        claimerRoles: ["waiter"],
        myDates: [],
      }),
      null,
    );
  });

  it("הצעה שנתפסה כבר אינה זמינה", () => {
    assert.equal(
      claimBlock({
        offer: { ...offer, status: "pending" },
        offered: plan(),
        claimerId: "אחר",
        claimerRoles: ["waiter"],
        myDates: [],
      }),
      "not-open",
    );
  });

  it("אי אפשר לקחת את ההצעה של עצמך", () => {
    assert.equal(
      claimBlock({
        offer,
        offered: plan(),
        claimerId: "אני",
        claimerRoles: ["waiter"],
        myDates: [],
      }),
      "own-offer",
    );
  });

  it("ברמן אינו יכול לקחת משבצת מלצר", () => {
    assert.equal(
      claimBlock({
        offer,
        offered: plan(),
        claimerId: "אחר",
        claimerRoles: ["bartender"],
        myDates: [],
      }),
      "wrong-role",
    );
  });

  /* אותו אילוץ שהמסד אוכף, רק שנאמר בעברית לפני שהוא נופל כשגיאה */
  it("מי שכבר משובץ באותו שישי אינו יכול לקחת עוד משבצת בו", () => {
    assert.equal(
      claimBlock({
        offer,
        offered: plan(),
        claimerId: "אחר",
        claimerRoles: ["waiter"],
        myDates: ["2026-09-04"],
      }),
      "already-on-that-day",
    );
  });
});

describe("החלפה — שישי תמורת שישי", () => {
  const offer = { status: "open", mode: "trade", offeredById: "אני" };

  it("החלפה תקינה עוברת", () => {
    assert.equal(
      claimBlock({
        offer,
        offered: plan(),
        claimerId: "אחר",
        claimerRoles: ["waiter"],
        myDates: ["2026-09-18"],
        inReturn: plan({ id: "p2", date: "2026-09-18", employeeId: "אחר" }),
      }),
      null,
    );
  });

  it("החלפה בלי להציע שישי בתמורה נחסמת", () => {
    assert.equal(
      claimBlock({
        offer,
        offered: plan(),
        claimerId: "אחר",
        claimerRoles: ["waiter"],
        myDates: [],
      }),
      "trade-needs-friday",
    );
  });

  /*
   * בלי הבדיקה הזאת אפשר היה "להחליף" עם שישי של מישהו שלישי, כלומר
   * לשבץ אדם למשמרת שלא ביקש בלי שאיש ישאל אותו.
   */
  it("אי אפשר להציע בתמורה שישי שאינו שלך", () => {
    assert.equal(
      claimBlock({
        offer,
        offered: plan(),
        claimerId: "אחר",
        claimerRoles: ["waiter"],
        myDates: [],
        inReturn: plan({ id: "p2", date: "2026-09-18", employeeId: "שלישי" }),
      }),
      "trade-not-yours",
    );
  });

  it("שני השישיים חייבים להיות ימים שונים", () => {
    assert.equal(
      claimBlock({
        offer,
        offered: plan(),
        claimerId: "אחר",
        claimerRoles: ["waiter"],
        myDates: [],
        inReturn: plan({ id: "p2", date: "2026-09-04", employeeId: "אחר" }),
      }),
      "trade-same-day",
    );
  });
});

describe("מה זז באישור", () => {
  it("מסירה מזיזה שורה אחת", () => {
    assert.deepEqual(
      applySwap({ mode: "give", offered: plan(), claimerId: "אחר" }),
      [{ planId: "p1", employeeId: "אחר" }],
    );
  });

  /*
   * שתי השורות, ובאותה טרנזקציה. מצב ביניים שבו רק אחת זזה משאיר את
   * אחד השניים משובץ פעמיים ואת השני בכלל לא.
   */
  it("החלפה מזיזה את שתי השורות, כל אחת לבעליה החדש", () => {
    assert.deepEqual(
      applySwap({
        mode: "trade",
        offered: plan(),
        claimerId: "אחר",
        inReturn: plan({ id: "p2", date: "2026-09-18", employeeId: "אחר" }),
      }),
      [
        { planId: "p1", employeeId: "אחר" },
        { planId: "p2", employeeId: "אני" },
      ],
    );
  });

  it("החלפה בלי שישי בתמורה מתנהגת כמסירה ולא ממציאה שורה", () => {
    assert.deepEqual(
      applySwap({ mode: "trade", offered: plan(), claimerId: "אחר", inReturn: null }),
      [{ planId: "p1", employeeId: "אחר" }],
    );
  });
});

describe("הכרעה וביטול", () => {
  it("רק הצעה שנתפסה מגיעה להכרעה", () => {
    assert.equal(decisionBlock({ status: "pending" }), null);
    assert.equal(decisionBlock({ status: "open" }), "not-pending");
    assert.equal(decisionBlock({ status: "done" }), "not-pending");
  });

  it("אפשר לבטל הצעה פתוחה שלך בלבד", () => {
    const offer = { status: "open", offeredById: "אני" };
    assert.equal(cancelBlock({ offer, employeeId: "אני" }), null);
    assert.equal(cancelBlock({ offer, employeeId: "אחר" }), "not-yours");
  });

  /* אחרי שמישהו תפס, הביטול הוא החלטה של המנהל ולא של המציע */
  it("הצעה שנתפסה אינה ניתנת לביטול על ידי המציע", () => {
    assert.equal(
      cancelBlock({
        offer: { status: "pending", offeredById: "אני" },
        employeeId: "אני",
      }),
      "not-open",
    );
  });
});
