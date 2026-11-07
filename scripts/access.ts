/**
 * ניהול גישה משורת הפקודה.
 *
 * זו דלת החירום הקבועה של המערכת. עד היום היה `MANAGER_PASSWORD` — סיסמה
 * אחת משותפת שישבה במשתנה סביבה ופתחה את אזור הניהול לכל מי שידע אותה.
 * במקומה נשארת הסקריפט הזה: אין דרך להיכנס דרך הדפדפן בלי חשבון, ואם
 * חשבון המנהל האחרון ננעל או נמחק — כאן מחזירים אותו.
 *
 * הסקריפט **כן** רץ מול מסד הייצור, בניגוד ל-db:seed ול-simulate. זו מטרתו.
 * לכן הוא מדפיס מול איזה שרת הוא עובד לפני כל כתיבה, ולעולם לא מדפיס את
 * מחרוזת החיבור עצמה.
 *
 *   npx tsx scripts/access.ts list
 *   npx tsx scripts/access.ts bootstrap "רואי שלו" 050-1234567
 *   npx tsx scripts/access.ts grant 050-1234567
 *   npx tsx scripts/access.ts revoke 050-1234567
 *   npx tsx scripts/access.ts reset 050-1234567
 */
import { randomBytes } from "node:crypto";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";
import { generatePasscode, hashPasscode } from "@/lib/passcode";
import { formatPhone, normalizePhone } from "@/lib/phone";

function connectionLabel(url: string): string {
  try {
    // רק המארח והמסד — שם המשתמש והסיסמה לא מודפסים לעולם
    const parsed = new URL(url);
    return `${parsed.hostname}${parsed.pathname}`;
  } catch {
    return "(מחרוזת חיבור לא תקינה)";
  }
}

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL אינו מוגדר.");
  process.exit(1);
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: url }),
  // הסקריפט הזה הוא המקום היחיד שמייצר גיבובים, ולכן ההשמטה הגלובלית
  // של הלקוח האפליקטיבי לא רלוונטית כאן — הוא בונה לקוח משלו
});

/** מאתר עובד לפי טלפון, ומסרב לנחש כשיש יותר מאחד */
async function findByPhone(raw: string) {
  const phone = normalizePhone(raw);
  if (!phone) {
    console.error(`"${raw}" אינו מספר טלפון תקין.`);
    process.exit(1);
  }

  const matches = await prisma.employee.findMany({
    where: { phone },
    select: { id: true, fullName: true, canManage: true, active: true },
    orderBy: { fullName: "asc" },
  });

  if (matches.length === 0) {
    console.error(`לא נמצא עובד עם הטלפון ${formatPhone(phone)}.`);
    process.exit(1);
  }
  if (matches.length > 1) {
    console.error(
      `יש ${matches.length} עובדים עם הטלפון ${formatPhone(phone)}: ` +
        `${matches.map((m) => m.fullName).join(", ")}.\n` +
        `אי אפשר לזהות מי מהם. יש לתקן את הכפילות קודם.`,
    );
    process.exit(1);
  }
  return matches[0];
}

async function main() {
  const [command, ...args] = process.argv.slice(2);
  console.log(`מסד: ${connectionLabel(url!)}\n`);

  switch (command) {
    case "list": {
      const employees = await prisma.employee.findMany({
        where: { OR: [{ canManage: true }, { active: true }] },
        select: {
          id: true,
          fullName: true,
          phone: true,
          canManage: true,
          active: true,
          mustChangePasscode: true,
          lockedUntil: true,
        },
        orderBy: [{ canManage: "desc" }, { fullName: "asc" }],
      });

      // מי כבר יש לו קוד — סינון לפי העמודה בלי לטעון את הגיבוב עצמו
      const withCode = new Set(
        (
          await prisma.employee.findMany({
            where: { passcodeHash: { not: null } },
            select: { id: true },
          })
        ).map((e) => e.id),
      );

      const managers = employees.filter((e) => e.canManage);
      console.log(`מנהלים (${managers.length}):`);
      for (const e of managers) {
        /*
         * "אין קוד" ו"קוד ראשוני" הם שני מצבים שונים, וההבחנה חשובה דווקא
         * כאן: מי שאין לו קוד אינו יכול להיכנס כלל, ומי שיש לו קוד ראשוני
         * ייכנס ויתבקש להחליף. הצגת שניהם כאותו דבר הייתה שולחת אותך לחפש
         * תקלה במקום להריץ reset.
         */
        const flags = [
          e.active ? null : "לא פעיל",
          !withCode.has(e.id)
            ? "אין קוד — הרץ reset"
            : e.mustChangePasscode
              ? "קוד ראשוני"
              : null,
          e.lockedUntil && e.lockedUntil > new Date() ? "נעול" : null,
        ].filter(Boolean);
        console.log(
          `  ${e.fullName} · ${formatPhone(e.phone)}` +
            (flags.length ? ` · ${flags.join(", ")}` : ""),
        );
      }
      if (managers.length === 0) {
        console.log("  — אין אף מנהל. הרץ bootstrap.");
      }
      console.log(`\nסך הכול עובדים פעילים: ${employees.filter((e) => e.active).length}`);
      break;
    }

    /*
     * יוצר חשבון ניהול חדש.
     *
     * roles ריק ו-maxShifts אפס בכוונה: החשבון הזה הוא של המנהל, לא של
     * עובד במשמרות. שניהם מוציאים אותו מהשיבוץ — הפותר בודק
     * roles.includes(slot.role) שנכשל על מחרוזת ריקה, ו-candidates מחזיר
     * "at-max" על מכסה אפס. הטופס בממשק דוחה תפקידים ריקים, ולכן החשבון
     * הזה נוצר דווקא כאן.
     */
    case "bootstrap": {
      const [fullName, rawPhone] = args;
      if (!fullName || !rawPhone) {
        console.error('שימוש: bootstrap "שם מלא" 050-1234567');
        process.exit(1);
      }
      const phone = normalizePhone(rawPhone);
      if (!phone) {
        console.error(`"${rawPhone}" אינו מספר טלפון תקין.`);
        process.exit(1);
      }

      const existing = await prisma.employee.findMany({
        where: { phone },
        select: { fullName: true },
      });
      if (existing.length > 0) {
        console.error(
          `הטלפון ${formatPhone(phone)} כבר משויך ל${existing.map((e) => e.fullName).join(", ")}.\n` +
            `להרשאת ניהול לחשבון קיים: grant ${rawPhone}`,
        );
        process.exit(1);
      }

      const passcode = generatePasscode();
      const employee = await prisma.employee.create({
        data: {
          fullName,
          phone,
          roles: "",
          requiredShifts: 0,
          maxShifts: 0,
          seniority: 5,
          active: true,
          needsReview: false,
          canManage: true,
          passcodeHash: hashPasscode(passcode),
          mustChangePasscode: true,
          token: randomBytes(16).toString("base64url"),
        },
        select: { fullName: true },
      });

      console.log(`נוצר חשבון ניהול עבור ${employee.fullName}.`);
      console.log(`  טלפון: ${formatPhone(phone)}`);
      console.log(`  קוד ראשוני: ${passcode}`);
      console.log(`\nהקוד לא נשמר בשום מקום — רק הגיבוב שלו.`);
      console.log(`בכניסה הראשונה תתבקש לבחור קוד משלך.`);
      break;
    }

    case "grant":
    case "revoke": {
      const [rawPhone] = args;
      if (!rawPhone) {
        console.error(`שימוש: ${command} 050-1234567`);
        process.exit(1);
      }
      const employee = await findByPhone(rawPhone);
      const canManage = command === "grant";

      if (!canManage) {
        const others = await prisma.employee.count({
          where: { canManage: true, active: true, id: { not: employee.id } },
        });
        if (others === 0) {
          console.error(
            `${employee.fullName} הוא המנהל האחרון. שלילת ההרשאה הייתה משאירה ` +
              `את המערכת בלי אף אחד שיכול להיכנס לאזור הניהול.`,
          );
          process.exit(1);
        }
      }

      await prisma.employee.update({
        where: { id: employee.id },
        data: { canManage },
      });
      console.log(
        `${employee.fullName}: הרשאת ניהול ${canManage ? "ניתנה" : "נשללה"}.`,
      );
      break;
    }

    case "reset": {
      const [rawPhone] = args;
      if (!rawPhone) {
        console.error("שימוש: reset 050-1234567");
        process.exit(1);
      }
      const employee = await findByPhone(rawPhone);
      const passcode = generatePasscode();

      await prisma.employee.update({
        where: { id: employee.id },
        data: {
          passcodeHash: hashPasscode(passcode),
          mustChangePasscode: true,
          // איפוס משחרר גם נעילה — אחרת קוד חדש עדיין לא היה עובד
          failedAttempts: 0,
          lastFailedAt: null,
          lockedUntil: null,
        },
      });

      console.log(`${employee.fullName}: נקבע קוד חדש.`);
      console.log(`  קוד ראשוני: ${passcode}`);
      break;
    }

    default:
      console.log(
        [
          "פקודות:",
          "  list                          — מי מנהל, ומה מצב הכניסה שלו",
          '  bootstrap "שם מלא" 050-1234567 — יוצר חשבון ניהול חדש',
          "  grant 050-1234567             — נותן הרשאת ניהול לעובד קיים",
          "  revoke 050-1234567            — שולל הרשאת ניהול",
          "  reset 050-1234567             — קובע קוד כניסה חדש",
        ].join("\n"),
      );
      process.exitCode = command ? 1 : 0;
  }
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
