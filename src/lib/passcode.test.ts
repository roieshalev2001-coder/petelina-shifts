import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  PASSCODE_LENGTH,
  weakPasscodeError,
  generatePasscode,
  hashPasscode,
  isValidPasscodeShape,
  verifyPasscode,
} from "./passcode";
import {
  DECAY_MINUTES,
  LOCK_MINUTES,
  MAX_ATTEMPTS,
  afterFailure,
  afterSuccess,
  lockStatus,
  type AttemptState,
} from "./lockout";

describe("גיבוב קוד הכניסה", () => {
  it("הקוד הנכון עובר", () => {
    const stored = hashPasscode("123456");
    assert.equal(verifyPasscode("123456", stored), true);
  });

  it("קוד שגוי נכשל", () => {
    const stored = hashPasscode("123456");
    assert.equal(verifyPasscode("123457", stored), false);
    assert.equal(verifyPasscode("", stored), false);
    assert.equal(verifyPasscode("1234567", stored), false);
  });

  it("אותו קוד מייצר גיבוב שונה בכל פעם — המלח אקראי", () => {
    assert.notEqual(hashPasscode("123456"), hashPasscode("123456"));
  });

  it("שני הגיבובים של אותו קוד שניהם תקפים", () => {
    assert.equal(verifyPasscode("123456", hashPasscode("123456")), true);
    assert.equal(verifyPasscode("123456", hashPasscode("123456")), true);
  });

  it("הפורמט השמור הוא scrypt עם הפרמטרים בתוכו", () => {
    const parts = hashPasscode("123456").split("$");
    assert.equal(parts.length, 6);
    assert.equal(parts[0], "scrypt");
    assert.equal(parts[1], "16384");
  });

  it("גיבוב חסר או פגום נכשל סגור ולא זורק", () => {
    assert.equal(verifyPasscode("123456", null), false);
    assert.equal(verifyPasscode("123456", ""), false);
    assert.equal(verifyPasscode("123456", "לא-גיבוב"), false);
    assert.equal(verifyPasscode("123456", "scrypt$a$b$c$d$e"), false);
    assert.equal(verifyPasscode("123456", "bcrypt$16384$8$1$aa$bb"), false);
  });
});

describe("ייצור קוד", () => {
  it("שש ספרות, כולל אפסים מובילים", () => {
    for (let i = 0; i < 50; i++) {
      const code = generatePasscode();
      assert.equal(code.length, PASSCODE_LENGTH);
      assert.match(code, /^\d{6}$/);
    }
  });

  it("לא מחזיר את אותו קוד שוב ושוב", () => {
    const codes = new Set(Array.from({ length: 30 }, generatePasscode));
    assert.ok(codes.size > 25, `רק ${codes.size} קודים שונים מתוך 30`);
  });

  it("בדיקת צורה", () => {
    assert.equal(isValidPasscodeShape("123456"), true);
    assert.equal(isValidPasscodeShape("12345"), false);
    assert.equal(isValidPasscodeShape("1234567"), false);
    assert.equal(isValidPasscodeShape("12345a"), false);
    assert.equal(isValidPasscodeShape(""), false);
  });
});

const CLEAN: AttemptState = {
  failedAttempts: 0,
  lastFailedAt: null,
  lockedUntil: null,
};
const T0 = new Date(2026, 7, 18, 10, 0, 0);
const minutesAfter = (n: number) => new Date(T0.getTime() + n * 60_000);

describe("נעילה אחרי ניסיונות כושלים", () => {
  it("ניסיון ראשון לא נועל", () => {
    const next = afterFailure(CLEAN, T0);
    assert.equal(next.failedAttempts, 1);
    assert.equal(next.lockedUntil, null);
    assert.equal(lockStatus(next, T0).locked, false);
  });

  it(`נועל בדיוק אחרי ${MAX_ATTEMPTS} ניסיונות`, () => {
    let state = CLEAN;
    for (let i = 0; i < MAX_ATTEMPTS - 1; i++) state = afterFailure(state, T0);
    assert.equal(lockStatus(state, T0).locked, false, "לפני האחרון עוד פתוח");

    state = afterFailure(state, T0);
    const status = lockStatus(state, T0);
    assert.equal(status.locked, true);
    assert.equal(status.locked && status.minutesLeft, LOCK_MINUTES);
  });

  it("הנעילה משתחררת אחרי הזמן", () => {
    let state = CLEAN;
    for (let i = 0; i < MAX_ATTEMPTS; i++) state = afterFailure(state, T0);
    assert.equal(lockStatus(state, minutesAfter(LOCK_MINUTES - 1)).locked, true);
    assert.equal(lockStatus(state, minutesAfter(LOCK_MINUTES + 1)).locked, false);
  });

  it("כניסה מוצלחת מאפסת הכול", () => {
    let state = CLEAN;
    for (let i = 0; i < 3; i++) state = afterFailure(state, T0);
    assert.deepEqual(afterSuccess(), CLEAN);
  });

  /*
   * בלי הדעיכה, עובד שטועה פעם בשבוע היה נעול אחרי חודש וחצי בלי שום
   * סיבה — המונה הוא הגנה מפני התקפה, לא זיכרון נצחי של שגיאות הקלדה.
   */
  it("המונה דועך אחרי שקט", () => {
    const stale = afterFailure(afterFailure(afterFailure(CLEAN, T0), T0), T0);
    assert.equal(stale.failedAttempts, 3);

    const later = afterFailure(stale, minutesAfter(DECAY_MINUTES + 1));
    assert.equal(later.failedAttempts, 1, "הכישלון הישן נשכח");
    assert.equal(later.lockedUntil, null);
  });

  it("כישלונות רצופים בתוך חלון הדעיכה כן נספרים", () => {
    let state = CLEAN;
    for (let i = 0; i < MAX_ATTEMPTS; i++) {
      state = afterFailure(state, minutesAfter(i));
    }
    assert.equal(lockStatus(state, minutesAfter(MAX_ATTEMPTS)).locked, true);
  });

  it("מספר הניסיונות שנותרו מוצג נכון", () => {
    const status = lockStatus(afterFailure(CLEAN, T0), T0);
    assert.equal(status.locked === false && status.attemptsLeft, MAX_ATTEMPTS - 1);
  });
});

describe("קוד חלש", () => {
  it("6 ספרות שאינן רצף — בסדר", () => {
    assert.equal(weakPasscodeError("482915"), null);
  });

  it("ספרה חוזרת או רצף — נדחה", () => {
    for (const code of ["111111", "123456", "654321", "345678"]) {
      assert.ok(weakPasscodeError(code), code);
    }
  });

  it("לא 6 ספרות — נדחה", () => {
    assert.ok(weakPasscodeError("12345"));
    assert.ok(weakPasscodeError("12a456"));
  });
});
