import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

/**
 * קוד הכניסה של העובד — גיבוב ואימות.
 *
 * `node:crypto` בלבד, בלי תלות חדשה. scrypt ולא SHA: הוא איטי בכוונה
 * ודורש זיכרון, כך שגיבוב שדלף אינו ניתן לפריצה בקצב סביר.
 *
 * **מה הגיבוב קונה ומה לא.** הוא מגן על הקודים אם המסד עצמו דולף. הוא
 * **לא** מגן מפני ניחוש דרך הטופס: שש ספרות הן מיליון אפשרויות, ותוקף
 * שיכול לנסות בלי הגבלה ימצה אותן. מי שנושא את ההגנה האמיתית הוא מנגנון
 * הנעילה ב-src/lib/lockout.ts, ולא הקובץ הזה.
 */

/** אורך הקוד. שש ספרות — מספיק קצר לזכור, ובשילוב הנעילה מספיק בטוח. */
export const PASSCODE_LENGTH = 6;

const N = 16384;
const R = 8;
const P = 1;
const KEYLEN = 32;
const SALT_BYTES = 16;
/** ברירת המחדל של maxmem נמוכה מהצריכה של N=16384; מציינים במפורש */
const MAXMEM = 64 * 1024 * 1024;

function derive(passcode: string, salt: Buffer): Buffer {
  return scryptSync(passcode.normalize("NFKC"), salt, KEYLEN, {
    N,
    r: R,
    p: P,
    maxmem: MAXMEM,
  });
}

/** `scrypt$N$r$p$salt$key`, שני החלקים האחרונים ב-base64url */
export function hashPasscode(passcode: string): string {
  const salt = randomBytes(SALT_BYTES);
  const key = derive(passcode, salt);
  return [
    "scrypt",
    N,
    R,
    P,
    salt.toString("base64url"),
    key.toString("base64url"),
  ].join("$");
}

/**
 * אימות בזמן קבוע.
 *
 * הפרמטרים נקראים מהמחרוזת השמורה ולא מהקבועים למעלה, כדי שאפשר יהיה
 * להעלות את עלות הגיבוב בעתיד בלי לפסול קודים קיימים.
 */
export function verifyPasscode(passcode: string, stored: string | null): boolean {
  if (!stored) return false;

  const parts = stored.split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;

  const [, n, r, p, saltB64, keyB64] = parts;
  let expected: Buffer;
  let actual: Buffer;
  try {
    expected = Buffer.from(keyB64, "base64url");
    actual = scryptSync(
      passcode.normalize("NFKC"),
      Buffer.from(saltB64, "base64url"),
      expected.length,
      { N: Number(n), r: Number(r), p: Number(p), maxmem: MAXMEM },
    );
  } catch {
    // פרמטרים פגומים במסד — נכשל סגור ולא מפיל את הבקשה
    return false;
  }

  if (expected.length !== actual.length) return false;
  return timingSafeEqual(expected, actual);
}

/**
 * קוד אקראי חדש.
 *
 * `randomInt` ולא `Math.random`: זהו סוד שמגן על גישה, ומחולל
 * פסאודו-אקראי צפוי היה הופך את כל ההגנה לתיאטרון.
 */
export function generatePasscode(): string {
  const max = 10 ** PASSCODE_LENGTH;
  // דגימה חוזרת כדי להימנע מהטיה מודולרית
  let value: number;
  do {
    value = randomBytes(4).readUInt32BE(0);
  } while (value >= Math.floor(0xffffffff / max) * max);
  return String(value % max).padStart(PASSCODE_LENGTH, "0");
}

/** האם מה שהמשתמש הקליד הוא בכלל בצורת קוד */
export function isValidPasscodeShape(passcode: string): boolean {
  return new RegExp(`^\\d{${PASSCODE_LENGTH}}$`).test(passcode);
}

/**
 * למה הקוד הזה לא מתאים, או null כשהוא בסדר: בדיוק 6 ספרות, ולא ספרה
 * חוזרת או רצף עולה/יורד — "111111", "123456", "654321".
 */
export function weakPasscodeError(passcode: string): string | null {
  if (!isValidPasscodeShape(passcode)) return "הקוד חייב להיות בדיוק 6 ספרות";
  const trivial =
    /^(\d)\1{5}$/.test(passcode) ||
    "0123456789".includes(passcode) ||
    "9876543210".includes(passcode);
  return trivial ? "קוד כזה קל מדי לניחוש. בחר ספרות אחרות." : null;
}
