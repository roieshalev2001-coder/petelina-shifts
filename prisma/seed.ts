/**
 * זריעת התבנית השבועית והעובדים מתוך סידור הדוגמה (16-21/8).
 *
 * הרצה: npm run db:seed
 *
 * כל מה שכאן ניתן לעריכה מאוחר יותר במסכי המנהל. במקומות שבהם הגיליון לא חשף
 * מידע (שעות האחמ"שים, שעות הסיום של מלצרי שישי) נבחרו ערכים סבירים והם
 * מסומנים בהערה ASSUMPTION.
 */
// tsx לא טוען .env מעצמו, בניגוד ל-Next ול-prisma.config.ts
import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { randomBytes } from "node:crypto";
import { PrismaClient } from "../src/generated/prisma/client";
import { requireDevDatabase } from "../src/lib/dev-db";
import { computeSlotFlags } from "../src/lib/openers";

/*
 * הזריעה מוחקת את **כל התבנית השבועית** לפני שהיא בונה אותה מחדש, ולכן
 * כל תיקון ידני של שעות אחמ״ש או שישי נעלם בהרצה חוזרת. היא גם תיצור
 * כפילות עם טוקן חדש לכל עובד שהשם שלו שונה מאז (ההתאמה היא לפי שם מלא
 * מדויק). לכן היא לא רצה מול המסד שבסביבה.
 */
const prisma = new PrismaClient({
  adapter: new PrismaPg({
    connectionString: requireDevDatabase("SEED_DB", "npm run db:seed"),
  }),
});

const CLOSING = "CLOSING";

type SeedSlot = {
  role: "manager" | "bartender" | "waiter";
  period: "morning" | "evening" | "allday";
  startTime: string;
  endTime: string;
  label?: string;
};

/** יום רגיל, ראשון–חמישי: 16 משבצות, בדיוק כסדר השורות בגיליון. */
const WEEKDAY_SLOTS: SeedSlot[] = [
  // ASSUMPTION: שעות האחמ"ש לא מופיעות בגיליון.
  { role: "manager", period: "morning", startTime: "07:00", endTime: "16:00", label: 'אחמ"ש בוקר' },

  { role: "bartender", period: "morning", startTime: "07:15", endTime: "14:00", label: "ברמן בוקר" },
  { role: "bartender", period: "morning", startTime: "12:30", endTime: "17:30", label: "ברמן צהריים" },
  { role: "bartender", period: "evening", startTime: "17:30", endTime: "23:00", label: "ברמן ערב" },

  // מלצר הפתיחה יורד ב-13:00 — מ-13:00 עד 15:00 יש 5 מלצרים במקום 6
  { role: "waiter", period: "morning", startTime: "07:15", endTime: "13:00" },
  { role: "waiter", period: "morning", startTime: "08:15", endTime: "15:00" },
  { role: "waiter", period: "morning", startTime: "09:00", endTime: "16:00" },
  { role: "waiter", period: "morning", startTime: "10:00", endTime: "17:00" },
  { role: "waiter", period: "morning", startTime: "11:15", endTime: "17:00" },
  { role: "waiter", period: "morning", startTime: "11:30", endTime: "17:00" },

  // ASSUMPTION: שעות אחראי הערב לא מופיעות בגיליון.
  { role: "manager", period: "evening", startTime: "16:00", endTime: CLOSING, label: "אחראי ערב" },

  { role: "waiter", period: "evening", startTime: "16:00", endTime: "22:15" },
  { role: "waiter", period: "evening", startTime: "16:00", endTime: "22:15" },
  { role: "waiter", period: "evening", startTime: "16:30", endTime: CLOSING },
  { role: "waiter", period: "evening", startTime: "17:30", endTime: CLOSING },
  { role: "waiter", period: "evening", startTime: "18:30", endTime: "22:00" },
];

/**
 * שישי: מבנה נפרד לגמרי — יום אחד רצוף בלי חלוקת בוקר/ערב,
 * 2 אחמ"שים, 2 ברמנים בלבד, ו-9 מלצרים בשעות עלייה מדורגות.
 */
const FRIDAY_SLOTS: SeedSlot[] = [
  // ASSUMPTION: שעות האחמ"שים בשישי.
  { role: "manager", period: "allday", startTime: "07:00", endTime: "15:00", label: 'אחמ"ש בוקר' },
  { role: "manager", period: "allday", startTime: "14:00", endTime: CLOSING, label: 'אחמ"ש סגירה' },

  { role: "bartender", period: "allday", startTime: "07:15", endTime: "14:00", label: "ברמן בוקר" },
  { role: "bartender", period: "allday", startTime: "13:30", endTime: CLOSING, label: "ברמן צהריים" },

  // שעות ההתחלה מדויקות מהגיליון. ASSUMPTION: שעות הסיום של שבע הראשונות.
  { role: "waiter", period: "allday", startTime: "07:15", endTime: "15:00" },
  { role: "waiter", period: "allday", startTime: "07:45", endTime: "15:00" },
  { role: "waiter", period: "allday", startTime: "08:15", endTime: "15:30" },
  { role: "waiter", period: "allday", startTime: "08:45", endTime: "16:00" },
  { role: "waiter", period: "allday", startTime: "08:45", endTime: "16:00" },
  { role: "waiter", period: "allday", startTime: "09:15", endTime: "16:30" },
  { role: "waiter", period: "allday", startTime: "09:45", endTime: "16:30" },
  { role: "waiter", period: "allday", startTime: "10:00", endTime: CLOSING },
  { role: "waiter", period: "allday", startTime: "10:00", endTime: CLOSING },
];

type SeedEmployee = {
  fullName: string;
  roles: string;
  /** מספר המשמרות שהעובד קיבל בשבוע הדוגמה — ברירת מחדל טובה ליעד השבועי */
  requiredShifts: number;
  /** הופיע בגיליון בשם פרטי בלבד — המנהל צריך להשלים שם מלא */
  needsReview?: boolean;
};

const EMPLOYEES: SeedEmployee[] = [
  // --- אחמ"שים (בגיליון בשם פרטי בלבד) ---
  { fullName: "ניר", roles: "manager", requiredShifts: 5, needsReview: true },
  { fullName: "נעמה", roles: "manager", requiredShifts: 3, needsReview: true },
  { fullName: "נועם", roles: "manager", requiredShifts: 2, needsReview: true },
  { fullName: "ירדן", roles: "manager", requiredShifts: 2, needsReview: true },

  // --- ברמנים (בגיליון בשם פרטי בלבד) ---
  { fullName: "רועי שלו", roles: "bartender", requiredShifts: 4 },
  { fullName: "עומר", roles: "bartender", requiredShifts: 4, needsReview: true },
  { fullName: "הדס", roles: "bartender", requiredShifts: 3, needsReview: true },
  { fullName: "נועם (ברמן)", roles: "bartender", requiredShifts: 3, needsReview: true },
  { fullName: "אריאל", roles: "bartender", requiredShifts: 2, needsReview: true },

  // --- מלצרים ---
  { fullName: "אסף אוחיון", roles: "waiter", requiredShifts: 5 },
  { fullName: "דור רבינוביץ", roles: "waiter", requiredShifts: 5 },
  { fullName: "ליאור בן שושן", roles: "waiter", requiredShifts: 4 },
  { fullName: "גלעד פרץ", roles: "waiter", requiredShifts: 4 },
  { fullName: "רותם אשכנזי", roles: "waiter", requiredShifts: 4 },
  { fullName: "ענבל סגל", roles: "waiter", requiredShifts: 4 },
  { fullName: "נעמה גבאי", roles: "waiter", requiredShifts: 4 },
  { fullName: "קרן אוחיון", roles: "waiter", requiredShifts: 4 },
  { fullName: "אביתר מזרחי", roles: "waiter", requiredShifts: 4 },
  { fullName: "שירן גולן", roles: "waiter", requiredShifts: 3 },
  { fullName: "אלעד חדד", roles: "waiter", requiredShifts: 3 },
  { fullName: "ליטל פרידמן", roles: "waiter", requiredShifts: 3 },
  { fullName: "תום פרץ", roles: "waiter", requiredShifts: 3 },
  { fullName: "נועם אלמוג", roles: "waiter", requiredShifts: 3 },
  { fullName: "ליאור דהן", roles: "waiter", requiredShifts: 3 },
  { fullName: "נועם ברגר", roles: "waiter", requiredShifts: 3 },
  { fullName: "אורן רוזן", roles: "waiter", requiredShifts: 2 },
  { fullName: "סתיו שפירא", roles: "waiter", requiredShifts: 1 },
  { fullName: "מאיה נחום", roles: "waiter", requiredShifts: 1 },
  { fullName: "הילה שמעוני", roles: "waiter", requiredShifts: 1 },
];

function newToken() {
  return randomBytes(16).toString("base64url");
}

type PreparedSlot = {
  dayOfWeek: number;
  role: string;
  period: string;
  startTime: string;
  endTime: string;
  label: string | null;
  sortOrder: number;
  fixedStart: boolean;
  fixedEnd: boolean;
};


/**
 * מסמן מי פותח ומי סוגר. הלוגיקה עצמה יושבת ב-src/lib/openers.ts כדי
 * שסקריפט תיקון של שבוע שכבר נפתח ישתמש באותה לוגיקה בדיוק, ושתהיה לה
 * בדיקת יחידה.
 */
function markOpenersAndClosers(slots: PreparedSlot[]): PreparedSlot[] {
  const flags = computeSlotFlags(slots);
  slots.forEach((slot, i) => {
    slot.fixedStart = flags[i].fixedStart;
    slot.fixedEnd = flags[i].fixedEnd;
  });
  return slots;
}

async function main() {
  console.log("זורע תבנית שבועית...");
  await prisma.templateSlot.deleteMany();

  const slots: PreparedSlot[] = [];

  // ראשון (0) עד חמישי (4) — יום רגיל. שישי (5) — מבנה נפרד. שבת (6) — סגור.
  for (let day = 0; day <= 4; day++) {
    WEEKDAY_SLOTS.forEach((s, i) => {
      slots.push({
        ...s,
        label: s.label ?? null,
        dayOfWeek: day,
        sortOrder: i,
        fixedStart: false,
        fixedEnd: false,
      });
    });
  }
  FRIDAY_SLOTS.forEach((s, i) => {
    slots.push({
      ...s,
      label: s.label ?? null,
      dayOfWeek: 5,
      sortOrder: i,
      fixedStart: false,
      fixedEnd: false,
    });
  });

  markOpenersAndClosers(slots);

  await prisma.templateSlot.createMany({ data: slots });
  console.log(`  ${slots.length} משבצות (${WEEKDAY_SLOTS.length} ליום א'-ה', ${FRIDAY_SLOTS.length} בשישי, שבת סגור)`);

  const sunday = slots
    .filter((s) => s.dayOfWeek === 0 && s.role === "waiter")
    .sort((a, b) => a.sortOrder - b.sortOrder);
  console.log("  מלצרי יום ראשון — פותחים וסוגרים:");
  for (const s of sunday) {
    const tags = [s.fixedStart && "פותחת", s.fixedEnd && "סוגרת"].filter(Boolean);
    console.log(
      `    ${s.startTime}-${s.endTime === CLOSING ? "סגירה" : s.endTime}${tags.length ? "  ← " + tags.join(" + ") : ""}`,
    );
  }

  console.log("זורע עובדים...");
  let created = 0;
  for (const e of EMPLOYEES) {
    const existing = await prisma.employee.findFirst({
      where: { fullName: e.fullName },
    });
    if (existing) continue;

    await prisma.employee.create({
      data: {
        fullName: e.fullName,
        roles: e.roles,
        token: newToken(),
        requiredShifts: e.requiredShifts,
        maxShifts: Math.max(6, e.requiredShifts + 2),
        needsReview: e.needsReview ?? false,
      },
    });
    created++;
  }
  console.log(`  ${created} עובדים חדשים (${EMPLOYEES.length} בסך הכל)`);
  console.log(
    "\nשים לב: משמרות החובה נזרעו לפי מספר ההופעות בשבוע הדוגמה — כדאי לעבור עליהן במסך העובדים.",
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
