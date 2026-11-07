/**
 * מקצה לקצה של מסלול הכניסה, מול מסד פיתוח.
 *
 * יוצר עובדי בדיקה, מריץ עליהם את כל התרחישים ומנקה אחריו — כולל מחיקה
 * לפי תחילית השם. לכן הוא עובר דרך אותו שער כמו db:seed ו-simulate ומסרב
 * לרוץ מול המסד שב-DATABASE_URL:
 *
 *   E2E_DB="postgres://…" npm run test:e2e
 *
 * הייבוא של שכבת המסד נעשה **אחרי** קביעת DATABASE_URL, כי הלקוח נבנה
 * בזמן הייבוא וקורא את המשתנה אז.
 */
import { requireDevDatabase } from "@/lib/dev-db";

const TAG = "E2E-";
let failures = 0;

type Login = typeof import("@/lib/login");
type Db = typeof import("@/lib/db");
let attemptLogin: Login["attemptLogin"];
let changePasscode: Login["changePasscode"];
let prisma: Db["prisma"];

function check(label: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) failures++;
  console.log(`${ok ? "✓" : "✗"} ${label}`);
  if (!ok) console.log(`    ציפיתי: ${JSON.stringify(expected)}\n    קיבלתי: ${JSON.stringify(actual)}`);
}

let hashPasscode: typeof import("@/lib/passcode")["hashPasscode"];

async function makeEmployee(name: string, phone: string, passcode: string, extra = {}) {
  return prisma.employee.create({
    data: {
      fullName: TAG + name,
      phone,
      roles: "waiter",
      requiredShifts: 0,
      maxShifts: 5,
      seniority: 3,
      active: true,
      needsReview: false,
      token: TAG + Math.random().toString(36).slice(2),
      passcodeHash: hashPasscode(passcode),
      mustChangePasscode: true,
      ...extra,
    },
    select: { id: true },
  });
}

async function main() {
  process.env.DATABASE_URL = requireDevDatabase("E2E_DB", "npm run test:e2e");
  ({ attemptLogin, changePasscode } = await import("@/lib/login"));
  ({ prisma } = await import("@/lib/db"));
  ({ hashPasscode } = await import("@/lib/passcode"));

  await prisma.employee.deleteMany({ where: { fullName: { startsWith: TAG } } });

  // ---- 1. כניסה תקינה ----
  const alice = await makeEmployee("אליס", "972500000001", "482913");
  const good = await attemptLogin("050-0000001", "482913");
  check("כניסה עם קוד נכון", good, {
    ok: true,
    employeeId: alice.id,
    mustChange: true,
  });

  // ---- 2. פורמטים שונים של אותו מספר ----
  for (const form of ["0500000001", "+972-50-000-0001", "00972500000001", "972500000001"]) {
    const r = await attemptLogin(form, "482913");
    check(`אותו מספר בכתיב "${form}"`, r.ok, true);
  }

  // ---- 3. קוד שגוי ----
  const bad = await attemptLogin("0500000001", "111111");
  check("קוד שגוי נדחה", bad, { ok: false, error: "טלפון או קוד שגויים" });

  // ---- 4. טלפון שאינו קיים — אותה הודעה בדיוק ----
  const missing = await attemptLogin("0509999999", "482913");
  check("טלפון לא קיים מחזיר אותה הודעה", missing, {
    ok: false,
    error: "טלפון או קוד שגויים",
  });

  // ---- 5. חמישה כישלונות נועלים ----
  await prisma.employee.update({
    where: { id: alice.id },
    data: { failedAttempts: 0, lastFailedAt: null, lockedUntil: null },
  });
  const errors: string[] = [];
  for (let i = 0; i < 6; i++) {
    const r = await attemptLogin("0500000001", "000001");
    if (!r.ok) errors.push(r.error);
  }
  check("חמישה ניסיונות ואז נעילה", errors[5]?.startsWith("יותר מדי ניסיונות"), true);
  check("הניסיון החמישי עצמו עדיין גנרי", errors[4], "טלפון או קוד שגויים");

  // ---- 6. הקוד הנכון לא עוזר בזמן נעילה ----
  const whileLocked = await attemptLogin("0500000001", "482913");
  check("נעול — גם הקוד הנכון נדחה", whileLocked.ok, false);

  // ---- 7. פקיעת הנעילה ----
  await prisma.employee.update({
    where: { id: alice.id },
    data: { lockedUntil: new Date(Date.now() - 60_000) },
  });
  const afterLock = await attemptLogin("0500000001", "482913");
  check("אחרי שהנעילה פגה — כניסה מצליחה", afterLock.ok, true);

  // ---- 8. המונה מתאפס אחרי הצלחה ----
  const state = await prisma.employee.findUniqueOrThrow({
    where: { id: alice.id },
    select: { failedAttempts: true, lockedUntil: true, lastFailedAt: true },
  });
  check("המונה התאפס", state, {
    failedAttempts: 0,
    lockedUntil: null,
    lastFailedAt: null,
  });

  // ---- 9. החלפת קוד ----
  check(
    "קוד חדש טריוויאלי נדחה",
    await changePasscode({ employeeId: alice.id, current: "482913", next: "123456" }),
    { ok: false, error: "קוד כזה קל מדי לניחוש. בחר ספרות אחרות." },
  );
  check(
    "קוד נוכחי שגוי נדחה",
    await changePasscode({ employeeId: alice.id, current: "999999", next: "735024" }),
    { ok: false, error: "הקוד הנוכחי שגוי" },
  );
  await prisma.employee.update({
    where: { id: alice.id },
    data: { failedAttempts: 0, lastFailedAt: null, lockedUntil: null },
  });
  check(
    "החלפת קוד מצליחה",
    await changePasscode({ employeeId: alice.id, current: "482913", next: "735024" }),
    { ok: true },
  );
  const old = await attemptLogin("0500000001", "482913");
  check("הקוד הישן הפסיק לעבוד", old.ok, false);
  const fresh = await attemptLogin("0500000001", "735024");
  check("הקוד החדש עובד ו-mustChange כבוי", fresh, {
    ok: true,
    employeeId: alice.id,
    mustChange: false,
  });

  // ---- 10. עובד לא פעיל ----
  const bob = await makeEmployee("בוב", "972500000002", "624180", { active: false });
  check("עובד שהוצא לא נכנס", await attemptLogin("0500000002", "624180"), {
    ok: false,
    error: "טלפון או קוד שגויים",
  });

  // ---- 11. טלפון כפול — סירוב מפורש, לא ניחוש ----
  await makeEmployee("תום", "972580000003", "738214");
  await makeEmployee("גלעד", "972580000003", "738214");
  const dup = await attemptLogin("0580000003", "738214");
  check("טלפון כפול נחסם", dup, {
    ok: false,
    error: "יש יותר מעובד אחד עם מספר הטלפון הזה, ולכן אי אפשר לזהות מי נכנס. פנה למנהל.",
  });

  // ---- 12. הגיבוב לא דולף בשאילתה רגילה ----
  const row = await prisma.employee.findUniqueOrThrow({ where: { id: alice.id } });
  check("passcodeHash מושמט משאילתה רגילה", "passcodeHash" in row, false);

  await prisma.employee.deleteMany({ where: { fullName: { startsWith: TAG } } });
  void bob;

  console.log(failures === 0 ? "\nהכול עבר." : `\n${failures} בדיקות נכשלו.`);
  process.exitCode = failures === 0 ? 0 : 1;
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => prisma?.$disconnect());
