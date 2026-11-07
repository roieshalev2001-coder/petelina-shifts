/**
 * מנרמל את עמודת הטלפון לכל העובדים.
 *
 * הטלפון הפך לשם המשתמש בכניסה, ולכן הוא חייב להישמר באותה צורה שבה
 * מחפשים אותו. היום הוא שמור כפי שהוקלד (`05X…`), והכניסה מחפשת את
 * הצורה המנורמלת (`9725X…`) — בלי הריצה הזו אף אחד לא ייכנס.
 *
 * הפונקציה אידמפוטנטית (יש על כך בדיקת תכונה ב-src/lib/phone.test.ts),
 * ולכן הרצה חוזרת אינה משנה דבר.
 *
 * הרצה יבשה (ברירת המחדל, לא כותב כלום):
 *   npx tsx --env-file=.env scripts/backfill-phones.ts
 *
 * להחיל:
 *   npx tsx --env-file=.env scripts/backfill-phones.ts --apply
 */
import { prisma } from "@/lib/db";
import { formatPhone, normalizePhone } from "@/lib/phone";

const apply = process.argv.includes("--apply");

async function main() {
  const employees = await prisma.employee.findMany({
    select: { id: true, fullName: true, phone: true, active: true },
    orderBy: { fullName: "asc" },
  });

  const changes: { id: string; fullName: string; from: string; to: string }[] = [];
  const broken: string[] = [];
  const seen = new Map<string, string[]>();

  for (const employee of employees) {
    if (!employee.phone) continue;
    const normalized = normalizePhone(employee.phone);
    if (!normalized) {
      broken.push(`${employee.fullName} (${employee.phone})`);
      continue;
    }
    seen.set(normalized, [...(seen.get(normalized) ?? []), employee.fullName]);
    if (normalized !== employee.phone) {
      changes.push({
        id: employee.id,
        fullName: employee.fullName,
        from: employee.phone,
        to: normalized,
      });
    }
  }

  const duplicates = [...seen.entries()].filter(([, names]) => names.length > 1);

  for (const change of changes) {
    console.log(`  ${change.fullName}: ${change.from} → ${formatPhone(change.to)}`);
  }
  console.log(`\n${changes.length} מתוך ${employees.length} דורשים עדכון.`);

  if (broken.length > 0) {
    console.log(`\nטלפונים שאינם ניתנים לנרמול (${broken.length}):`);
    for (const line of broken) console.log(`  ${line}`);
  }

  /*
   * הכפילויות עוצרות את ההחלה.
   *
   * שני עובדים עם אותו טלפון הם שני אנשים עם אותו שם משתמש. הכניסה
   * מסרבת לנחש ביניהם, ולכן שניהם יינעלו בחוץ — ובנוסף האינדקס הייחודי
   * שאמור להתווסף אחרי הריצה הזו פשוט ייכשל.
   */
  if (duplicates.length > 0) {
    console.log(`\nטלפונים כפולים (${duplicates.length}):`);
    for (const [phone, names] of duplicates) {
      console.log(`  ${formatPhone(phone)} — ${names.join(", ")}`);
    }
    console.log(
      "\nיש לתקן את הכפילויות לפני ההחלה: שני עובדים עם אותו טלפון הם שני\n" +
        "אנשים עם אותו שם משתמש, ושניהם לא יוכלו להיכנס.",
    );
    process.exitCode = 1;
    return;
  }

  if (!apply) {
    console.log("\nהרצה יבשה. להחלה: --apply");
    return;
  }

  for (const change of changes) {
    await prisma.employee.update({
      where: { id: change.id },
      data: { phone: change.to },
    });
  }
  console.log(`\nהוחל: ${changes.length} טלפונים עודכנו.`);
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
