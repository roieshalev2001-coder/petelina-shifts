"use client";

import { useState, useTransition } from "react";
import { ChangeHours } from "@/components/ChangeHours";
import { Dialog } from "@/components/Dialog";
import { Badge, Button, Num } from "@/components/ui";

export type FridayCell = { employeeId: string; fullName: string; published: boolean };

export type FridayPerson = {
  id: string;
  fullName: string;
  roles: string[];
  /** תווית ההגבלה ("פעם בחודש"), או null כשאין */
  limit: string | null;
  /** כמה שישיים עבד עד היום */
  worked: number;
  /** כמה שישיים יש לו בתקופה שמוצגת */
  inPeriod: number;
};

type Role = "waiter" | "bartender";
type Target = { date: string; dateLabel: string; role: Role; position: number };

const ROLE_NAME: Record<Role, string> = { waiter: "מלצר", bartender: "ברמן" };

/**
 * טבלת סבב שישי — בצורת הגיליון של רואי: עמודה לכל שישי, שורה לכל מקום
 * בסדר ההגעה, הברמנים למעלה ומתחתם המלצרים. אותם צבעים כמו בסידור השבועי
 * (`.schedule-table` ב-globals.css).
 *
 * לחיצה על משבצת פותחת רשימת עובדים — מי שעבד הכי מעט שישיים ראשון.
 * מלצר שמיני: "+ מלצר" מתחת לאחרון בעמודה. הוא פשוט המיקום הבא, ולכן
 * הסרה שלו היא ריקון המשבצת — בלי מושג נוסף.
 */
export function FridayGrid({
  dates,
  capacity,
  arrivals,
  cells,
  people,
  overrides,
  setCell,
  changeArrival,
}: {
  dates: { key: string; label: string }[];
  capacity: Record<Role, number>;
  /** שעת ההגעה לכל מיקום (אינדקס = מיקום − 1), כולל מקומות מעבר לתבנית */
  arrivals: Record<Role, (string | null)[]>;
  /** מפתח: `${date}|${role}|${position}` */
  cells: Record<string, FridayCell>;
  people: FridayPerson[];
  /** שעת הגעה ששונתה לשישי מסוים בלבד. מפתח כמו ב-cells */
  overrides: Record<string, string>;
  setCell: (date: string, role: string, position: number, employeeId: string | null) => Promise<void>;
  changeArrival: (
    date: string,
    role: string,
    position: number,
    startTime: string,
    scope: "date" | "always",
  ) => Promise<{ error?: string }>;
}) {
  const [target, setTarget] = useState<Target | null>(null);
  const [editingTime, setEditingTime] = useState(false);
  /** לחיצה על שעת ההגעה בעמודה הימנית — שינוי השורה בכל השישיים */
  const [rowTime, setRowTime] = useState<{ role: Role; position: number } | null>(null);
  const [pending, startTransition] = useTransition();

  const cellAt = (date: string, role: Role, position: number) =>
    cells[`${date}|${role}|${position}`];

  /** המיקום הגבוה שמאויש בעמודה, לתפקיד */
  const maxFilled = (date: string, role: Role) => {
    let max = 0;
    for (const key of Object.keys(cells)) {
      const [d, r, p] = key.split("|");
      if (d === date && r === role) max = Math.max(max, Number(p));
    }
    return max;
  };

  // לכל עמודה — איפה יושב ה"+ מלצר" שלה: אחרי הגבוה מבין התבנית והמאויש
  const plusAt = new Map(
    dates.map((d) => [d.key, Math.max(capacity.waiter, maxFilled(d.key, "waiter")) + 1]),
  );
  const waiterRows = Math.max(...dates.map((d) => plusAt.get(d.key)!));
  const bartenderRows = Math.max(capacity.bartender, ...dates.map((d) => maxFilled(d.key, "bartender")));

  const choose = (employeeId: string | null) => {
    if (!target) return;
    const t = target;
    startTransition(async () => {
      await setCell(t.date, t.role, t.position, employeeId);
      setTarget(null);
    });
  };

  const renderRow = (role: Role, position: number) => {
    const arrival = arrivals[role][position - 1];
    return (
      <tr key={`${role}-${position}`} data-role={role}>
        <th scope="row" className="sticky right-0 z-10 px-3 py-1.5 whitespace-nowrap">
          {position === 1 && <span className="block text-xs font-bold">{role === "waiter" ? "מלצרים" : "ברמנים"}</span>}
          {/* מקום שבתבנית — השעה שלו לחיצה ומשתנה בכל השישיים. מלצר
              שמיני אין לו שעה קבועה, ולכן שם רק "רק בשישי הזה" מתוך התא */}
          {arrival && position <= capacity[role] ? (
            <button
              type="button"
              onClick={() => setRowTime({ role, position })}
              title="שינוי שעת ההגעה בכל השישיים"
              className="num -mx-2 block w-[calc(100%+1rem)] cursor-pointer px-2 py-1 text-right transition hover:bg-brand/[0.07]"
            >
              {arrival}
            </button>
          ) : (
            <span className="num">{arrival ?? "—"}</span>
          )}
        </th>
        {dates.map((d) => {
          const cell = cellAt(d.key, role, position);
          const optional = position > capacity[role];
          const isPlus = role === "waiter" && !cell && position === plusAt.get(d.key);
          if (!cell && optional && !isPlus) return <td key={d.key} aria-hidden />;
          const open = () => {
            setEditingTime(false);
            setTarget({ date: d.key, dateLabel: d.label, role, position });
          };
          const override = overrides[`${d.key}|${role}|${position}`];
          return (
            <td
              key={d.key}
              data-role={role}
              className={!cell && !optional ? "cell-flag" : undefined}
            >
              <button
                type="button"
                onClick={open}
                aria-label={
                  cell
                    ? `${d.label}, ${ROLE_NAME[role]} ${arrival ?? ""}: ${cell.fullName}. שינוי`
                    : isPlus
                      ? `${d.label}: הוספת מלצר`
                      : `${d.label}, ${ROLE_NAME[role]} ${arrival ?? ""}: ריק. שיבוץ`
                }
                className="block min-h-9 w-full px-2 py-1 whitespace-nowrap transition-transform duration-150 ease-[var(--ease-out)] active:scale-[0.97]"
              >
                {cell ? (
                  <>
                    {cell.fullName}
                    {!cell.published && (
                      <span aria-hidden className="mr-1 text-brand">
                        •
                      </span>
                    )}
                    {/* שעה ששונתה לשישי הזה בלבד — שונה מעמודת השעות */}
                    {override && (
                      <span className="num block text-[11px] text-ink/70">{override}</span>
                    )}
                  </>
                ) : isPlus ? (
                  <span className="text-xs text-ink/55">+ מלצר</span>
                ) : (
                  <span className="text-ink/50">—</span>
                )}
              </button>
            </td>
          );
        })}
      </tr>
    );
  };

  const current = target ? cellAt(target.date, target.role, target.position) : undefined;
  const takenOnDate = new Map<string, number>();
  if (target) {
    for (const [key, cell] of Object.entries(cells)) {
      const [d, , p] = key.split("|");
      if (d === target.date) takenOnDate.set(cell.employeeId, Number(p));
    }
  }
  const options = target
    ? people
        .filter((p) => p.roles.includes(target.role) && p.id !== current?.employeeId)
        .sort(
          (a, b) =>
            Number(takenOnDate.has(a.id)) - Number(takenOnDate.has(b.id)) ||
            a.worked + a.inPeriod - (b.worked + b.inPeriod) ||
            a.fullName.localeCompare(b.fullName, "he"),
        )
    : [];

  return (
    <>
      <div className="schedule-table overflow-x-auto border border-line bg-surface">
        <table className="w-full min-w-[52rem] border-collapse text-sm">
          <thead>
            <tr>
              <th className="sticky right-0 z-10 w-20">
                <span className="sr-only">שעת הגעה</span>
              </th>
              {dates.map((d) => (
                <th key={d.key} className="px-2 py-2.5">
                  <span className="block font-bold">שישי</span>
                  <span className="num block text-xs font-normal text-ink/75">{d.label}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {/* הברמנים בראש הטבלה (החלטה של רואי), ואחריהם המלצרים */}
            {Array.from({ length: bartenderRows }, (_, i) => renderRow("bartender", i + 1))}
            {/* רווח בין הברמנים למלצרים — כמו השורה הריקה בגיליון */}
            <tr aria-hidden>
              <td colSpan={dates.length + 1} className="h-3 border-x-0 bg-surface" />
            </tr>
            {Array.from({ length: waiterRows }, (_, i) => renderRow("waiter", i + 1))}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-xs text-muted">
        <span className="text-brand">•</span> עדיין לא פורסם לעובדים · צהוב = מקום שעוד לא שובץ
      </p>

      {rowTime && (
        <Dialog
          label="שינוי שעת הגעה בכל השישיים"
          onClose={() => setRowTime(null)}
          className="max-w-md"
        >
          <h3 className="font-bold">
            {ROLE_NAME[rowTime.role]} · שעת הגעה{" "}
            <span className="num">{arrivals[rowTime.role][rowTime.position - 1]}</span>
          </h3>
          <p className="mb-3 text-sm text-muted">
            משנה את השורה בכל השישיים מעכשיו, כולל שבועות שכבר נפתחו. לשישי אחד
            בלבד — לוחצים על השם שבתוך הטבלה.
          </p>
          <ChangeHours
            startOnly
            start={arrivals[rowTime.role][rowTime.position - 1] ?? "08:00"}
            end=""
            scopes={[{ key: "always" as const, label: "בכל שישי (תמידי)" }]}
            onCancel={() => setRowTime(null)}
            onSubmit={async (startTime, _end, scope) => {
              const result = await changeArrival(
                dates[0].key,
                rowTime.role,
                rowTime.position,
                startTime,
                scope,
              );
              if (result.error) return result.error;
              setRowTime(null);
            }}
          />
        </Dialog>
      )}

      {target && (
        <Dialog
          label={`שישי ${target.dateLabel}, ${ROLE_NAME[target.role]}`}
          onClose={() => setTarget(null)}
          className="max-h-[80vh] max-w-lg overflow-y-auto"
        >
          <div className="mb-3 flex items-start justify-between gap-3">
            <div>
              <h3 className="font-bold">
                שישי <span className="num">{target.dateLabel}</span> · {ROLE_NAME[target.role]}{" "}
                <span className="num">{arrivals[target.role][target.position - 1] ?? ""}</span>
              </h3>
              <p className="text-sm text-muted">
                מסודר לפי מי שעבד הכי מעט שישיים.
              </p>
              {!editingTime && (
                <Button
                  variant="secondary"
                  size="sm"
                  className="mt-2"
                  onClick={() => setEditingTime(true)}
                >
                  שינוי שעת הגעה
                </Button>
              )}
            </div>
            <Button variant="ghost" size="sm" aria-label="סגירה" onClick={() => setTarget(null)}>
              ✕
            </Button>
          </div>

          {editingTime && (
            <ChangeHours
              startOnly
              start={
                overrides[`${target.date}|${target.role}|${target.position}`] ??
                arrivals[target.role][target.position - 1] ??
                "08:00"
              }
              end=""
              scopes={[
                { key: "date" as const, label: `רק בשישי הזה (${target.dateLabel})` },
                // למלצר שמיני אין שעה קבועה בתבנית — רק לשישי הזה
                ...(target.position <= capacity[target.role]
                  ? [
                      {
                        key: "always" as const,
                        label: "בכל שישי (תמידי)",
                        hint: "השורה הזו משתנה בכל השישיים מעכשיו, כולל שבועות שכבר נפתחו",
                      },
                    ]
                  : []),
              ]}
              onCancel={() => setEditingTime(false)}
              onSubmit={async (startTime, _end, scope) => {
                const result = await changeArrival(
                  target.date,
                  target.role,
                  target.position,
                  startTime,
                  scope,
                );
                if (result.error) return result.error;
                setEditingTime(false);
                setTarget(null);
              }}
            />
          )}

          {current && (
            <div className="mb-3 flex flex-wrap items-center gap-2 bg-paper p-3">
              <span className="font-medium">{current.fullName}</span>
              {!current.published && <Badge>לא פורסם</Badge>}
              <Button
                variant="secondary"
                size="sm"
                className="mr-auto"
                disabled={pending}
                onClick={() => choose(null)}
              >
                {target.position > capacity[target.role] ? "הסרת המלצר" : "ריקון המשבצת"}
              </Button>
            </div>
          )}

          <ul className="divide-y divide-line">
            {options.map((p) => (
              <li key={p.id}>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => choose(p.id)}
                  className="flex w-full flex-wrap items-center gap-2 px-1 py-2.5 text-right transition hover:bg-paper/70 disabled:opacity-50"
                >
                  <span className="font-medium">{p.fullName}</span>
                  {p.limit && <Badge tone="amber">{p.limit}</Badge>}
                  {takenOnDate.has(p.id) && (
                    <Badge>{`כבר בשישי הזה — יעבור לכאן`}</Badge>
                  )}
                  <span className="mr-auto text-xs text-muted">
                    עבד <Num>{p.worked}</Num> · בתקופה <Num>{p.inPeriod}</Num>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </Dialog>
      )}
    </>
  );
}
