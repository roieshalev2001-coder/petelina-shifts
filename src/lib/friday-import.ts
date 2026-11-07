/**
 * ייבוא סבב שישי מגיליון.
 *
 * הסבב האמיתי חי בגיליון שרואי מתחזק, ולא בראש של האלגוריתם. הקובץ הזה
 * קורא הדבקה משם ומתרגם אותה לשיבוצים.
 *
 * **הקונבנציה של הגיליון**: כל עמודה היא שישי, והסדר שבו השמות רשומים
 * הוא סדר שעות ההגעה. מכאן שהמיקום הוא נתון ולא קישוט — ומכאן גם
 * שהסוגרים, אם יש כאלה בתבנית, הם האחרונים, בלי לומר זאת במפורש: משבצות
 * הסגירה הן האחרונות בתבנית, ולכן הן נופלות במקומן מעצמן.
 *
 * **הברמנים רשומים בראש העמודה** (השורות הכחולות הכהות בגיליון של רואי),
 * ומתחתם המלצרים. ראה `leading` ב-parseFridaySheet.
 *
 * טהור לחלוטין: בלי מסד, בלי שעון (הוא מוזרק), בלי אקראיות. מה שנכנס
 * לכאן הוא טקסט ורשימת עובדים, ומה שיוצא הוא תיאור של מה *יקרה* —
 * שום דבר לא נכתב לפני שהמנהל ראה אותו ואישר.
 */
import { zonedDayOfWeek, zonedParts, zonedTime, toDateInputValue } from "./time";

export type RosterPerson = { id: string; fullName: string };

export type ImportEntry = {
  /** התפקיד שהשורה הזו מתמלאת בו — הבלוק הפותח או הרשימה הראשית */
  role: string;
  /** החל מ-1, לפי הסדר בתוך התפקיד — זה מה שקובע את שעת ההגעה */
  position: number;
  /** החל מ-1, מספר השם בעמודה כפי שהוא בגיליון — להודעות למנהל */
  row: number;
  /** הטקסט כפי שהודבק, לשחזור בהודעת השגיאה */
  raw: string;
  /** null = לא הותאם לאיש */
  employeeId: string | null;
  /** השם המלא כפי שהוא במערכת, כשהותאם */
  fullName: string | null;
};

export type ImportColumn = {
  /** "YYYY-MM-DD" */
  date: string;
  /** תא הכותרת כפי שהודבק */
  raw: string;
  entries: ImportEntry[];
};

export type ImportProblem =
  | { kind: "bad-date"; raw: string }
  | { kind: "not-friday"; raw: string; date: string }
  | { kind: "unknown-name"; raw: string; date: string; position: number }
  | {
      kind: "ambiguous-name";
      raw: string;
      date: string;
      position: number;
      candidates: string[];
    }
  | { kind: "duplicate"; raw: string; date: string; positions: number[] }
  | { kind: "over-capacity"; date: string; role: string; got: number; capacity: number };

/** רשימה של תפקיד אחד: מי יכול להופיע בו, וכמה משבצות יש לו בשישי */
export type ImportBlock = {
  role: string;
  roster: RosterPerson[];
  capacity: number;
};

export type ImportPreview = {
  columns: ImportColumn[];
  problems: ImportProblem[];
  /** כמה שיבוצים ייכתבו בפועל */
  matched: number;
  /** כמה שמות היו בהדבקה */
  total: number;
};

/**
 * נרמול שם להשוואה.
 *
 * הגיליון נכתב ביד לאורך זמן, ולכן יש בו רווחים כפולים, גרשיים שונים
 * ורווחים בלתי־שבירים שנדבקים בהעתקה. אף אחד מהם אינו הבדל אמיתי בין
 * שני אנשים.
 */
export function normalizeName(value: string): string {
  return value
    .replace(/[‎‏‪-‮]/g, "") // סימני כיווניות שנדבקים בהעתקה מ-RTL
    .replace(/[ \t]/g, " ")
    .replace(/["'׳״`]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * מוצא את העובד שהשם מתכוון אליו.
 *
 * שתי מדרגות, ובכוונה בסדר הזה: התאמה מדויקת קודמת, ורק אחריה התאמה
 * לפי תחילת השם. בלי הסדר הזה "נועם" — שהוא שם מלא של אחד העובדים —
 * היה נבלע על ידי "נועם אלמוג" ו"נועם ברגר" והופך לדו־משמעי.
 *
 * דו־משמעות אינה נפתרת בניחוש אלא מדווחת. שיבוץ של האדם הלא נכון לשישי
 * גרוע בהרבה משורה אחת שהמנהל צריך להשלים ידנית.
 */
export function matchName(
  raw: string,
  roster: RosterPerson[],
): { person: RosterPerson } | { candidates: RosterPerson[] } {
  const needle = normalizeName(raw);
  if (!needle) return { candidates: [] };

  const exact = roster.filter((p) => normalizeName(p.fullName) === needle);
  if (exact.length === 1) return { person: exact[0] };
  if (exact.length > 1) return { candidates: exact };

  /*
   * גבול מילה ולא תת־מחרוזת: "גלעד" צריך למצוא את "גלעד פרץ", אבל
   * אסור לו למצוא את "מייקל". בלי הרווח בסוף, כל שם קצר היה תופס.
   */
  const prefix = roster.filter((p) =>
    normalizeName(p.fullName).startsWith(`${needle} `),
  );
  if (prefix.length === 1) return { person: prefix[0] };
  return { candidates: prefix };
}

/**
 * קורא תא תאריך מהגיליון.
 *
 * מקבל 28/8, 28.8, 28/08/2026 ו-2026-08-28. השנה אינה חובה כי בגיליון
 * היא לא נכתבת: היא נגזרת מ`now` — נבחרת השנה שמניחה את התאריך קדימה,
 * כך שהדבקה בדצמבר של "2/1" מכוונת לינואר הבא ולא לזה שעבר.
 */
export function parseSheetDate(raw: string, now: Date): Date | null {
  const cleaned = normalizeName(raw);
  const iso = cleaned.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (iso) {
    return zonedTime(Number(iso[1]), Number(iso[2]), Number(iso[3]));
  }

  const dmy = cleaned.match(/^(\d{1,2})[./](\d{1,2})(?:[./](\d{2,4}))?$/);
  if (!dmy) return null;

  const day = Number(dmy[1]);
  const month = Number(dmy[2]);
  if (day < 1 || day > 31 || month < 1 || month > 12) return null;

  if (dmy[3]) {
    const y = Number(dmy[3]);
    return zonedTime(y < 100 ? 2000 + y : y, month, day);
  }

  const here = zonedParts(now);
  const candidate = zonedTime(here.year, month, day);
  // יותר מחודשיים אחורה — כנראה התכוונו לשנה הבאה
  const twoMonths = 62 * 24 * 60 * 60 * 1000;
  return candidate.getTime() < now.getTime() - twoMonths
    ? zonedTime(here.year + 1, month, day)
    : candidate;
}

/** מפצל שורת הדבקה לתאים. גיליונות מדביקים טאבים; פסיק הוא נפילה אחורה. */
function splitRow(line: string): string[] {
  return (line.includes("\t") ? line.split("\t") : line.split(",")).map((c) =>
    normalizeName(c),
  );
}

/**
 * מתרגם הדבקה מהגיליון לתיאור של מה שייכתב.
 *
 * `capacity` הוא מספר המשבצות של אותו תפקיד בשישי — נגזר מהתבנית ולא
 * מוגדר כאן, כך ששינוי בתבנית ממשיך להיות מקור האמת.
 *
 * `leading` הוא בלוק אופציונלי בראש כל עמודה — הברמנים. השמות הראשונים
 * בעמודה נבדקים מול רשימת הברמנים בלבד, עד שהבלוק מתמלא או עד השם
 * הראשון שאינו ברמן; מכאן והלאה כולם מלצרים.
 *
 * **לפי המקום ולא לפי השם לבד**, כי כך הגיליון בנוי — וכי השם לבדו אינו
 * מספיק: "נועם" הוא ארבעה אנשים, אבל רק אחד מהם ברמן. מול רשימת הברמנים
 * הוא חד־משמעי, ומול כולם יחד הוא היה נדחה. הדבקה של מלצרים בלבד לא
 * משתנה: השם הראשון בה אינו ברמן, ולכן הבלוק פשוט ריק.
 *
 * `trailing` הוא הצורה החדשה של הגיליון (מאוקטובר 2026): המלצרים, שורה
 * ריקה, ואז הברמנים **בתחתית**. כל מה שאחרי השורה הריקה הראשונה נקרא מול
 * הרשימה של `trailing` בלבד. בלי שורה ריקה — אין בלוק תחתון, וההדבקה
 * נקראת בדיוק כמו קודם.
 */
export function parseFridaySheet(args: {
  text: string;
  roster: RosterPerson[];
  capacity: number;
  /** התפקיד של הרשימה הראשית */
  role?: string;
  leading?: ImportBlock;
  trailing?: ImportBlock;
  now?: Date;
}): ImportPreview {
  const role = args.role ?? "waiter";
  const now = args.now ?? new Date();
  const problems: ImportProblem[] = [];
  const columns: ImportColumn[] = [];
  let total = 0;

  const all = args.text.split(/\r?\n/);
  const blank = (l: string) => normalizeName(l).length === 0;
  const lines = all.filter((l) => !blank(l));
  if (lines.length < 2) return { columns, problems, matched: 0, total: 0 };

  /*
   * השורה הריקה הראשונה שאחרי שורת נתונים כלשהי מפרידה בין הרשימה
   * הראשית לבלוק התחתון — כמו בגיליון. שורות ריקות לפני הנתונים לא נחשבות.
   */
  const headerAt = all.findIndex((l) => !blank(l));
  let splitAt = -1;
  if (args.trailing) {
    let seenData = false;
    for (let i = headerAt + 1; i < all.length; i++) {
      if (!blank(all[i])) seenData = true;
      else if (seenData) {
        splitAt = i;
        break;
      }
    }
  }
  const header = splitRow(lines[0]);
  const mainLines = splitAt === -1 ? all.slice(headerAt + 1) : all.slice(headerAt + 1, splitAt);
  const rows = mainLines.filter((l) => !blank(l)).map(splitRow);
  const tailRows = splitAt === -1 ? [] : all.slice(splitAt + 1).filter((l) => !blank(l)).map(splitRow);

  header.forEach((cell, col) => {
    if (!cell) return;

    const date = parseSheetDate(cell, now);
    if (!date) {
      problems.push({ kind: "bad-date", raw: cell });
      return;
    }
    const key = toDateInputValue(date);
    if (zonedDayOfWeek(date) !== 5) {
      problems.push({ kind: "not-friday", raw: cell, date: key });
      return;
    }

    const entries: ImportEntry[] = [];
    /*
     * המיקום נספר על השמות שנכתבו ולא על מספר השורה: תא ריק באמצע
     * העמודה הוא שורה שנמחקה בגיליון, לא משבצת שצריך לדלג עליה — ולולא
     * זה כל מי שאחריו היה זז משבצת אחת קדימה ומגיע בשעה הלא נכונה.
     */
    // בצורה החדשה (ברמנים בתחתית) אין בלוק פותח: השם הראשון הוא מלצר, גם
    // אם במקרה הוא גם ברמן
    let inLeading = splitAt === -1 && Boolean(args.leading && args.leading.capacity > 0);
    let leadingCount = 0;
    let mainCount = 0;
    for (const sheetRow of rows) {
      const raw = sheetRow[col] ?? "";
      if (!raw) continue;
      total++;
      const rowNumber = entries.length + 1;

      if (inLeading && args.leading) {
        const lead = matchName(raw, args.leading.roster);
        if ("person" in lead) {
          leadingCount++;
          entries.push({
            role: args.leading.role,
            position: leadingCount,
            row: rowNumber,
            raw,
            employeeId: lead.person.id,
            fullName: lead.person.fullName,
          });
          if (leadingCount >= args.leading.capacity) inLeading = false;
          continue;
        }
        // השם הראשון שאינו ברמן סוגר את הבלוק — מכאן והלאה הרשימה הראשית
        inLeading = false;
      }

      const found = matchName(raw, args.roster);
      mainCount++;
      if ("person" in found) {
        entries.push({
          role,
          position: mainCount,
          row: rowNumber,
          raw,
          employeeId: found.person.id,
          fullName: found.person.fullName,
        });
      } else {
        entries.push({
          role,
          position: mainCount,
          row: rowNumber,
          raw,
          employeeId: null,
          fullName: null,
        });
        if (found.candidates.length > 1) {
          problems.push({
            kind: "ambiguous-name",
            raw,
            date: key,
            position: rowNumber,
            candidates: found.candidates.map((c) => c.fullName),
          });
        } else {
          problems.push({ kind: "unknown-name", raw, date: key, position: rowNumber });
        }
      }
    }

    // הבלוק התחתון — הברמנים בצורה החדשה של הגיליון
    let tailCount = 0;
    for (const sheetRow of tailRows) {
      const raw = sheetRow[col] ?? "";
      if (!raw || !args.trailing) continue;
      total++;
      tailCount++;
      const rowNumber = entries.length + 1;
      const found = matchName(raw, args.trailing.roster);
      entries.push({
        role: args.trailing.role,
        position: tailCount,
        row: rowNumber,
        raw,
        employeeId: "person" in found ? found.person.id : null,
        fullName: "person" in found ? found.person.fullName : null,
      });
      if (!("person" in found)) {
        problems.push(
          found.candidates.length > 1
            ? {
                kind: "ambiguous-name",
                raw,
                date: key,
                position: rowNumber,
                candidates: found.candidates.map((c) => c.fullName),
              }
            : { kind: "unknown-name", raw, date: key, position: rowNumber },
        );
      }
    }

    // אותו אדם פעמיים באותו שישי — במסד יש על זה אילוץ, וכאן זה נאמר בעברית
    const seen = new Map<string, number[]>();
    for (const e of entries) {
      if (!e.employeeId) continue;
      if (!seen.has(e.employeeId)) seen.set(e.employeeId, []);
      seen.get(e.employeeId)!.push(e.row);
    }
    for (const [id, positions] of seen) {
      if (positions.length < 2) continue;
      problems.push({
        kind: "duplicate",
        raw: entries.find((e) => e.employeeId === id)!.fullName ?? "",
        date: key,
        positions,
      });
    }

    // הבלוק הפותח אינו יכול לחרוג — הוא נסגר כשהוא מתמלא
    if (mainCount > args.capacity) {
      problems.push({
        kind: "over-capacity",
        date: key,
        role,
        got: mainCount,
        capacity: args.capacity,
      });
    }

    columns.push({ date: key, raw: cell, entries });
  });

  const matched = columns
    .flatMap((c) => c.entries)
    .filter((e) => e.employeeId).length;

  return { columns, problems, matched, total };
}

export const PROBLEM_LABEL: Record<ImportProblem["kind"], string> = {
  "bad-date": "לא הצלחתי לקרוא את התאריך",
  "not-friday": "התאריך אינו יום שישי",
  "unknown-name": "אין עובד בשם הזה",
  "ambiguous-name": "השם מתאים ליותר מאחד",
  duplicate: "אותו אדם מופיע פעמיים באותו שישי",
  "over-capacity": "יותר שמות ממשבצות התבנית — בשבוע עצמו יתווסף בלוק",
};
