import Link from "next/link";
import { Badge, LinkButton, Num } from "@/components/ui";

/**
 * השבועות שלא נכנסו לגיבור — שורות שקטות מתחת לפס.
 *
 * שבוע שעוד מקבל הגשות: סטטוס וכפתור משני. שבוע שהמועד שלו עבר: אדום
 * "ההגשה נסגרה" וקישור למה שהעובד הגיש — לא כפתור "למילוי ההגשה" שמוביל
 * לטופס נעול, כמו שהיה עד 6.10.
 *
 * רכיב תצוגה טהור, כדי שמסך התצוגה (/preview) יריץ אותו עם הנתונים הכי
 * גרועים.
 */
export type WeekRow = {
  id: string;
  /** "18/10–23/10" */
  label: string;
  accepting: boolean;
  submitted: boolean;
  myMarks: number;
  /** המועד האחרון, מעוצב לתצוגה */
  deadline: string;
};

export function WeekRows({ rows }: { rows: WeekRow[] }) {
  if (rows.length === 0) return null;

  return (
    <section>
      <h2 className="section-title">שבועות</h2>
      <ul className="divide-y divide-line border-b border-line">
        {rows.map((w) =>
          w.accepting ? (
            <li key={w.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 py-4">
              <span className="font-bold">
                שבוע <span className="num">{w.label}</span>
              </span>
              {w.submitted ? (
                <Badge tone="green">נשלח ✓</Badge>
              ) : (
                <Badge tone="amber">טרם הוגש</Badge>
              )}
              <span className="text-sm text-muted">
                עד <Num>{w.deadline}</Num>
              </span>
              {/* הקישור נושא את מזהה השבוע: עם שני שבועות פתוחים,
                  "ההגשה" בלי מזהה אינה אומרת לאיזה מהם */}
              <LinkButton
                href={`/me/submit?week=${w.id}`}
                variant="secondary"
                size="sm"
                className="mr-auto"
              >
                {w.submitted ? "עדכון" : "למילוי ההגשה"}
              </LinkButton>
            </li>
          ) : (
            <li key={w.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 py-4">
              <span className="font-bold">
                שבוע <span className="num">{w.label}</span>
              </span>
              <Badge tone="red">ההגשה נסגרה</Badge>
              <Link
                href={`/me/submit?week=${w.id}`}
                className="mr-auto text-sm font-semibold underline underline-offset-4"
              >
                {w.submitted || w.myMarks > 0 ? "מה הגשתי" : "פרטים"}
              </Link>
            </li>
          ),
        )}
      </ul>
    </section>
  );
}
