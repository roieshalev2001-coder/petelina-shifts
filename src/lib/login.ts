import { prisma } from "./db";
import { afterFailure, afterSuccess, lockMessage, lockStatus } from "./lockout";
import { hashPasscode, isValidPasscodeShape, verifyPasscode, weakPasscodeError } from "./passcode";
import { normalizePhone } from "./phone";

export type LoginResult =
  | { ok: true; employeeId: string; mustChange: boolean; canManage: boolean }
  | { ok: false; error: string };

/** תשובה אחת לטלפון לא קיים, לקוד שגוי ולעובד לא פעיל — ראה burnTime */
const GENERIC = "טלפון או קוד שגויים";

/*
 * גיבוב דמה, לשריפת אותו זמן כשאין עובד כזה.
 *
 * בלעדיו הכניסה הייתה מדליפה מי עובד כאן: בקשה עם טלפון קיים הייתה חוזרת
 * אחרי ~100ms של scrypt, ובקשה עם טלפון לא קיים כמעט מיד. מי שסורק מספרים
 * היה מקבל רשימת עובדים בלי לנחש אף קוד.
 *
 * מחושב עצלנית ולא בטעינת המודול, כדי לא להוסיף scrypt לזמן ההתעוררות
 * של השרת — שהוא ממילא הצוואר הצר כאן.
 */
let dummyHash: string | null = null;
function burnTime(passcode: string) {
  dummyHash ??= hashPasscode("000000");
  verifyPasscode(passcode, dummyHash);
}

/**
 * ניסיון כניסה: טלפון + קוד.
 *
 * זה המקום היחיד בקוד שקורא את `passcodeHash`. הלקוח מוגדר עם `omit`
 * גלובלי על השדה, וכאן הוא נפתח במפורש — כך שכל שאילתה אחרת בפרויקט,
 * גם כזו שתיכתב בעתיד, לא יכולה למשוך אותו בטעות.
 */
export async function attemptLogin(
  rawPhone: string,
  passcode: string,
): Promise<LoginResult> {
  const phone = normalizePhone(rawPhone);
  if (!phone || !isValidPasscodeShape(passcode)) {
    burnTime(passcode);
    return { ok: false, error: GENERIC };
  }

  /*
   * findMany ולא findUnique, למרות ש-`phone` הוא @unique מאז מיגרציית
   * 20260818090000.
   *
   * זו הגנה בשכבה שנייה ולא שריד: מה שתופס כפילות הוא האינדקס במסד, אבל
   * אם הוא ייפול אי פעם — אינדקס שנמחק בטעות, שחזור מגיבוי ישן — השאילתה
   * הזו עדיין תסרב לנחש. שתיקה כאן הייתה מכניסה אדם אחד לחשבון של אחר,
   * וזה כשל שאי אפשר לגלות מהצד השני.
   */
  const matches = await prisma.employee.findMany({
    where: { phone, active: true },
    omit: { passcodeHash: false },
  });

  if (matches.length > 1) {
    return {
      ok: false,
      error:
        "יש יותר מעובד אחד עם מספר הטלפון הזה, ולכן אי אפשר לזהות מי נכנס. פנה למנהל.",
    };
  }

  const employee = matches[0];
  if (!employee) {
    burnTime(passcode);
    return { ok: false, error: GENERIC };
  }

  const status = lockStatus(employee);
  if (status.locked) return { ok: false, error: lockMessage(status) };

  if (!verifyPasscode(passcode, employee.passcodeHash)) {
    await prisma.employee.update({
      where: { id: employee.id },
      data: afterFailure(employee),
    });
    return { ok: false, error: GENERIC };
  }

  await prisma.employee.update({
    where: { id: employee.id },
    data: afterSuccess(),
  });
  return {
    ok: true,
    employeeId: employee.id,
    mustChange: employee.mustChangePasscode,
    canManage: employee.canManage,
  };
}

/**
 * החלפת קוד ביוזמת העובד.
 *
 * דורשת את הקוד הנוכחי גם כשיש כבר סשן: מי שהשאיר טלפון פתוח לא צריך
 * שמישהו יוכל לנעול אותו מחוץ לחשבון שלו בשתי לחיצות.
 */
export async function changePasscode(args: {
  employeeId: string;
  current: string;
  next: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!isValidPasscodeShape(args.next)) {
    return { ok: false, error: "הקוד החדש חייב להיות בדיוק 6 ספרות" };
  }
  if (args.next === args.current) {
    return { ok: false, error: "הקוד החדש זהה לקוד הנוכחי" };
  }
  const weak = weakPasscodeError(args.next);
  if (weak) return { ok: false, error: weak };

  const [employee] = await prisma.employee.findMany({
    where: { id: args.employeeId },
    omit: { passcodeHash: false },
  });
  if (!employee) return { ok: false, error: "לא נמצא" };

  const status = lockStatus(employee);
  if (status.locked) return { ok: false, error: lockMessage(status) };

  if (!verifyPasscode(args.current, employee.passcodeHash)) {
    await prisma.employee.update({
      where: { id: employee.id },
      data: afterFailure(employee),
    });
    return { ok: false, error: "הקוד הנוכחי שגוי" };
  }

  await prisma.employee.update({
    where: { id: employee.id },
    data: {
      passcodeHash: hashPasscode(args.next),
      mustChangePasscode: false,
      ...afterSuccess(),
    },
  });
  return { ok: true };
}
