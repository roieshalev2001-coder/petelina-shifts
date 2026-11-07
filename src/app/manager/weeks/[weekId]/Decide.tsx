"use client";

import { useState, useTransition } from "react";
import { useConfirm } from "@/components/Dialog";
import { Badge, Button, Notice, RoleDot } from "@/components/ui";
import { DAY_NAMES, ROLE_LABEL, type Role } from "@/lib/domain";

/**
 * חילופים שממתינים להכרעת המנהל.
 *
 * זה החלק שבגללו כל השרשרת קיימת: עד שלא לוחצים כאן, המשמרת רשומה על מי
 * שהציע אותה והסידור אינו משתנה. לכן זה יושב בראש המסך ולא בתחתיתו.
 *
 * `risks` הם הכללים שהמסירה עצמה **אינה** אוכפת — סגירה, מנוחה, "לא
 * עובדים יחד". הם מוצגים ולא חוסמים: ההחלטה שלך, ועם העיניים פקוחות.
 */
export function Decide({
  awaiting,
  decide,
}: {
  awaiting: {
    id: string;
    dayOfWeek: number;
    role: Role;
    start: string;
    end: string;
    from: string;
    to: string;
    risks: string[];
  }[];
  decide: (offerId: string, approve: boolean) => Promise<void>;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [ask, dialog] = useConfirm();

  if (awaiting.length === 0) return null;

  return (
    <Notice title={`חילופים שממתינים לאישורך (${awaiting.length})`}>
      {dialog}
      <p className="mb-3 text-sm">
        המשמרת עדיין רשומה על מי שהציע אותה. היא תעבור רק אחרי שתאשר.
      </p>

      {error && <p role="alert" className="mb-2 text-sm text-amber-800">{error}</p>}

      <ul className="space-y-3">
        {awaiting.map((o) => (
          <li key={o.id} className="border-t border-line pt-2 first:border-0 first:pt-0">
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <RoleDot role={o.role} />
              <span className="font-medium">{DAY_NAMES[o.dayOfWeek]}</span>
              <span className="num">
                {o.start}–{o.end}
              </span>
              <span className="text-muted">{ROLE_LABEL[o.role]}</span>
              <span className="mr-auto">
                {o.from} ← <span className="font-medium">{o.to}</span>
              </span>
            </div>

            {o.risks.length > 0 && (
              <div className="mt-1.5 flex flex-wrap gap-1">
                {o.risks.map((r, i) => (
                  <Badge key={i} tone="amber">
                    {r}
                  </Badge>
                ))}
              </div>
            )}

            <div className="mt-2 flex gap-2">
              <Button
                size="sm"
                disabled={pending}
                onClick={() => {
                  setError(null);
                  startTransition(async () => {
                    try {
                      await decide(o.id, true);
                    } catch (e) {
                      setError(e instanceof Error ? e.message : "הפעולה נכשלה");
                    }
                  });
                }}
              >
                אישור — {o.to} מקבל
              </Button>
              <Button
                variant="secondary"
                size="sm"
                disabled={pending}
                onClick={async () => {
                  if (
                    !(await ask(
                      `לדחות?\n\nהמשמרת נשארת אצל ${o.from}, וההצעה חוזרת להיות פתוחה לכולם.`,
                      { confirmLabel: "דחייה", danger: true },
                    ))
                  ) {
                    return;
                  }
                  setError(null);
                  startTransition(async () => {
                    try {
                      await decide(o.id, false);
                    } catch (e) {
                      setError(e instanceof Error ? e.message : "הפעולה נכשלה");
                    }
                  });
                }}
              >
                דחייה
              </Button>
            </div>
          </li>
        ))}
      </ul>
    </Notice>
  );
}
