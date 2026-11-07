"use client";

import { useState, useTransition } from "react";
import { Badge, Button, Card, Notice } from "@/components/ui";
import { ROLE_LABEL, ROLE_LABEL_PLURAL, type Role } from "@/lib/domain";
import { PROBLEM_LABEL, type ImportPreview } from "@/lib/friday-import";

/**
 * ייבוא הסבב מהגיליון, בשני צעדים.
 *
 * הצעד הראשון קורא ומראה; רק הצעד השני כותב. זה לא נימוס — ייבוא כותב
 * את הסבב של שמונה שישיים בבת אחת, ושם שלא הותאם או תאריך שנקרא לא נכון
 * הם דברים שצריך לראות לפני, לא לגלות בשישי בבוקר.
 */
export function ImportRotation({
  preview,
  apply,
}: {
  preview: (text: string) => Promise<ImportPreview>;
  apply: (text: string) => Promise<{ written: number; dates: string[] }>;
}) {
  const [text, setText] = useState("");
  const [result, setResult] = useState<ImportPreview | null>(null);
  const [done, setDone] = useState<{ written: number; dates: string[] } | null>(null);
  const [pending, start] = useTransition();

  const blocking = (result?.problems ?? []).filter(
    // מעבר לתבנית אינו חוסם: מלצר שמיני מקבל בלוק משלו כשהשבוע נפתח
    (p) => p.kind === "bad-date" || p.kind === "not-friday",
  );

  return (
    <Card className="mb-4">
      <h2 className="mb-1 font-semibold">ייבוא מהגיליון</h2>
      <p className="mb-3 text-xs text-muted">
        העתק מהגיליון את שורת התאריכים ואת כל השמות שמתחתיה, כולל שורות
        הברמנים שבראש העמודה, והדבק כאן. הסדר בכל עמודה הוא סדר ההגעה.
      </p>

      <textarea
        aria-label="הדבקה מהגיליון"
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          setResult(null);
          setDone(null);
        }}
        rows={6}
        dir="rtl"
        placeholder={"9/10\t16/10\nרועי שלו\tיונתן\nעדי\tנועם\nענבל סגל\tדור רבינוביץ\nקרן אוחיון\tאסף אוחיון"}
        className="w-full border border-line bg-surface p-2 font-mono text-base"
      />

      <div className="mt-2 flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="ghost"
          disabled={pending || text.trim().length === 0}
          onClick={() =>
            start(async () => {
              setDone(null);
              setResult(await preview(text));
            })
          }
        >
          בדיקה
        </Button>

        {result && result.matched > 0 && blocking.length === 0 && (
          <Button
            type="button"
            disabled={pending}
            onClick={() =>
              start(async () => {
                setDone(await apply(text));
                setResult(null);
                setText("");
              })
            }
          >
            כתיבת {result.matched} שיבוצים
          </Button>
        )}
      </div>

      {done && (
        <Notice title={`נכתבו ${done.written} שיבוצים`}>
          <p className="text-sm">
            {done.dates.length} שישיים עודכנו. הם מסומנים כידניים, ולכן
            &quot;יצירה מחדש&quot; לא תדרוס אותם.
          </p>
        </Notice>
      )}

      {result && (
        <div className="mt-3 space-y-3">
          <p className="text-sm">
            <span className="num">{result.matched}</span> מתוך{" "}
            <span className="num">{result.total}</span> שמות הותאמו.
            {result.matched < result.total && (
              <span className="text-muted"> השאר יישארו ריקים.</span>
            )}
          </p>

          {result.problems.length > 0 && (
            <Notice title={`${result.problems.length} דברים לבדוק`}>
              <ul className="space-y-1 text-sm">
                {result.problems.map((p, i) => (
                  <li key={i}>
                    <span className="font-medium">{PROBLEM_LABEL[p.kind]}</span>
                    {" — "}
                    {p.kind === "bad-date" && <span>{p.raw}</span>}
                    {p.kind === "not-friday" && (
                      <span>
                        {p.raw} ({p.date})
                      </span>
                    )}
                    {p.kind === "unknown-name" && (
                      <span>
                        {p.raw} · {p.date} · מקום {p.position}
                      </span>
                    )}
                    {p.kind === "ambiguous-name" && (
                      <span>
                        {p.raw} · {p.date} — {p.candidates.join(" / ")}
                      </span>
                    )}
                    {p.kind === "duplicate" && (
                      <span>
                        {p.raw} · {p.date} · מקומות {p.positions.join(", ")}
                      </span>
                    )}
                    {p.kind === "over-capacity" && (
                      <span>
                        {p.date} — {p.got} שמות מול {p.capacity} משבצות{" "}
                        {ROLE_LABEL_PLURAL[p.role as Role] ?? p.role}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </Notice>
          )}

          <div className="overflow-x-auto">
            <table className="w-full text-right text-sm">
              <thead className="border-b border-line">
                <tr>
                  <th className="p-1 font-semibold">מקום</th>
                  {result.columns.map((c) => (
                    <th key={c.date} className="num p-1 font-semibold">
                      {c.raw}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {Array.from(
                  { length: Math.max(0, ...result.columns.map((c) => c.entries.length)) },
                  (_, row) => (
                    <tr key={row} className="border-b border-line/50">
                      <td className="num p-1 text-muted">{row + 1}</td>
                      {result.columns.map((c) => {
                        const e = c.entries[row];
                        if (!e) return <td key={c.date} className="p-1" />;
                        return (
                          <td key={c.date} className="p-1">
                            {/* התפקיד גלוי ליד כל שם — סיווג שגוי נראה לפני הכתיבה */}
                            {e.role !== "waiter" && (
                              <span className="ml-1 text-xs text-muted">
                                {ROLE_LABEL[e.role as Role] ?? e.role} ·
                              </span>
                            )}
                            {e.employeeId ? (
                              e.fullName
                            ) : (
                              <span className="text-muted">
                                {e.raw} <Badge tone="amber">לא הותאם</Badge>
                              </span>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ),
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </Card>
  );
}
