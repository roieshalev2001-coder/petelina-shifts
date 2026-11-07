"use client";

import { Fragment, useState } from "react";
import { useConfirm } from "@/components/Dialog";
import { Badge, Button, Card, Notice, Num } from "@/components/ui";
import { PERIOD_LABEL, roleLabelsOf } from "@/lib/domain";
import { EmployeeForm, type EmployeeFormValues } from "./EmployeeForm";
import { Credentials } from "./Credentials";

type Result = { ok: true } | { ok: false; error: string };

export type EmployeeRow = EmployeeFormValues & {
  id: string;
  needsReview: boolean;
  linkSentAt: Date | null;
  canManage: boolean;
  mustChangePasscode: boolean;
  /** מחושב בשרת, יחד עם hasPasscode */
  locked: boolean;
  /** נגזר בשרת. הגיבוב עצמו לעולם לא חוצה לכאן. */
  hasPasscode: boolean;
  /** עד מתי קישור הכניסה הפתוח תקף, או null. גם כאן — רק התאריך, לא המפתח */
  inviteUntil: Date | null;
};

export function EmployeeList({
  employees,
  baseUrl,
  updateAction,
  createAction,
  setActiveAction,
  markLinkSentAction,
  setCanManageAction,
  createInviteAction,
  revokeInviteAction,
  footprintAction,
  deleteAction,
}: {
  employees: EmployeeRow[];
  baseUrl: string;
  updateAction: (id: string, formData: FormData) => Promise<void>;
  createAction: (formData: FormData) => Promise<void>;
  setActiveAction: (id: string, active: boolean) => Promise<Result>;
  footprintAction: (id: string) => Promise<
    | {
        ok: true;
        data: {
          fullName: string;
          assignments: number;
          submissions: number;
          fridays: number;
          swaps: number;
        };
      }
    | { ok: false; error: string }
  >;
  deleteAction: (id: string) => Promise<Result>;
  markLinkSentAction: (id: string) => Promise<void>;
  setCanManageAction: (id: string, canManage: boolean) => Promise<Result>;
  createInviteAction: (
    id: string,
  ) => Promise<
    { ok: true; data: { token: string; expiresAt: Date } } | { ok: false; error: string }
  >;
  revokeInviteAction: (id: string) => Promise<void>;
}) {
  const [editing, setEditing] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  // שגיאות הגנת הנעילה העצמית מוצגות כאן ולא נזרקות — אין ברפו error.tsx,
  // וזריקה הייתה מציגה מסך שגיאה באנגלית על פעולה שרואי יגיע אליה בפועל
  const [error, setError] = useState<string | null>(null);
  const [ask, dialog] = useConfirm();

  /*
   * הפעולות והתגיות מוגדרות פעם אחת ומשמשות גם את הטבלה וגם את
   * הכרטיסים. בלי זה יש שני עותקים של דיאלוגי האישור — ואישור שנופל
   * מהסנכרון הוא בדיוק המקום שבו מוחקים את העובד הלא נכון.
   */
  async function toggleManage(employee: EmployeeRow) {
    const message = employee.canManage
      ? `לשלול מ${employee.fullName} את הרשאת הניהול?\n\nהוא לא יוכל יותר לערוך סידורים, אבל יישאר עובד רגיל.`
      : `לתת ל${employee.fullName} הרשאת ניהול?\n\nהוא יוכל לערוך סידורים, לפתוח שבועות ולנהל עובדים — כולל לשנות את ההרשאות שלך.`;
    if (!(await ask(message, { confirmLabel: employee.canManage ? "שלילת ההרשאה" : "מתן הרשאה", danger: employee.canManage }))) return;
    setError(null);
    void setCanManageAction(employee.id, !employee.canManage).then((r) => {
      if (!r.ok) setError(r.error);
    });
  }

  /** השבתה ולא מחיקה — ההיסטוריה בסידורים קודמים נשמרת */
  async function toggleActive(employee: EmployeeRow) {
    const message = employee.active
      ? `להוציא את ${employee.fullName} מהמערך?\n\nהוא יפסיק להופיע בהגשות ובשיבוצים ולא יוכל להיכנס. הסידורים הקודמים נשמרים, ואפשר להחזיר אותו בכל רגע.`
      : `להחזיר את ${employee.fullName} למערך?`;
    if (!(await ask(message, { confirmLabel: employee.active ? "הוצאה" : "החזרה", danger: employee.active }))) return;
    setError(null);
    void setActiveAction(employee.id, !employee.active).then((r) => {
      if (!r.ok) setError(r.error);
    });
  }

  /**
   * מחיקה מלאה, אחרי הוצאה.
   *
   * הספירות נשלפות לפני השאלה ולא אחריה: "למחוק את X?" בלי מספרים הוא
   * אישור עיוור, ומה שנמחק כאן כולל שיבוצים בסידורים שכבר פורסמו.
   */
  async function removeForever(employee: EmployeeRow) {
    setError(null);
    const found = await footprintAction(employee.id);
    if (!found.ok) {
      setError(found.error);
      return;
    }

    const { assignments, submissions, fridays, swaps } = found.data;
    /* "1 הגשות" אינו עברית. יחיד ורבים, כל אחד בנוסח שלו */
    const count = (n: number, one: string, many: string) =>
      n === 1 ? one : `${n} ${many}`;
    const lines = [
      assignments &&
        count(assignments, "משמרת אחת בסידורים קודמים", "משמרות בסידורים קודמים"),
      submissions && count(submissions, "הגשת זמינות אחת", "הגשות זמינות"),
      fridays && count(fridays, "שיבוץ אחד בסבב שישי", "שיבוצים בסבב שישי"),
      swaps && count(swaps, "בקשת חילוף אחת", "בקשות חילוף"),
    ].filter(Boolean);

    const detail = lines.length
      ? `\n\nיימחקו איתו גם:\n· ${lines.join("\n· ")}`
      : "\n\nאין היסטוריה במערכת.";

    if (
      !(await ask(`למחוק את ${employee.fullName} לצמיתות?${detail}\n\nאי אפשר להחזיר את זה.`, {
        confirmLabel: "מחיקה לצמיתות",
        danger: true,
      }))
    ) {
      return;
    }

    const result = await deleteAction(employee.id);
    if (!result.ok) setError(result.error);
  }

  const nameCell = (employee: EmployeeRow) => (
    <>
      {employee.fullName}
      {employee.needsReview && (
        <span className="mr-2">
          <Badge tone="amber">להשלים</Badge>
        </span>
      )}
      {!employee.active && (
        <span className="mr-2">
          <Badge>לא פעיל</Badge>
        </span>
      )}
    </>
  );

  const roleBadges = (employee: EmployeeRow) => (
    <div className="flex flex-wrap gap-1">
      {roleLabelsOf(employee.roles).map((label) => (
        <Badge key={label} tone="blue">
          {label}
        </Badge>
      ))}
    </div>
  );

  const credentials = (employee: EmployeeRow) => (
    <Credentials
      fullName={employee.fullName}
      phone={employee.phone}
      baseUrl={baseUrl}
      hasPasscode={employee.hasPasscode}
      mustChange={employee.mustChangePasscode}
      locked={employee.locked}
      sentAt={employee.linkSentAt}
      inviteUntil={employee.inviteUntil}
      onInvite={() => createInviteAction(employee.id)}
      onRevoke={() => revokeInviteAction(employee.id)}
      onSent={() => markLinkSentAction(employee.id)}
    />
  );

  const rowActions = (employee: EmployeeRow) => (
    <>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => setEditing(editing === employee.id ? null : employee.id)}
      >
        {editing === employee.id ? "סגירה" : "עריכה"}
      </Button>
      <Button variant="ghost" size="sm" onClick={() => toggleManage(employee)}>
        {employee.canManage ? "שלילת ניהול" : "מתן ניהול"}
      </Button>
      <Button variant="ghost" size="sm" onClick={() => toggleActive(employee)}>
        {employee.active ? "הוצאה" : "החזרה"}
      </Button>
      {/* רק אחרי הוצאה: מחיקה היא המשך של הפעולה הזו, לא תחליף לה */}
      {!employee.active && (
        <Button
          variant="danger"
          size="sm"
          onClick={() => void removeForever(employee)}
        >
          מחיקה לצמיתות
        </Button>
      )}
    </>
  );

  const periodLabel = (employee: EmployeeRow) =>
    employee.preferredPeriod
      ? PERIOD_LABEL[employee.preferredPeriod as keyof typeof PERIOD_LABEL]
      : "—";

  const needsReview = employees.filter((e) => e.needsReview);
  const missingPhone = employees.filter((e) => e.active && !e.phone);
  const isLocalhost = baseUrl.includes("localhost");

  return (
    <div className="space-y-4">
      {dialog}
      {error && (
        <Notice alert title="אי אפשר לבצע את הפעולה">
          <p className="text-sm">{error}</p>
        </Notice>
      )}

      {isLocalhost && (
        <Notice tone="neutral" title="כתובת הכניסה כרגע היא localhost">
          <p className="text-sm">
            היא עובדת רק במחשב הזה. אל תשלח פרטי כניסה לצוות עד שהאפליקציה
            תעלה לכתובת אמיתית.
          </p>
        </Notice>
      )}

      {missingPhone.length > 0 && (
        <Notice title={`${missingPhone.length} עובדים בלי טלפון`}>
          <p className="text-sm">
            {/* הדגשה ב-<strong>: הכוכביות שהיו כאן הופיעו על המסך כמו שהן */}
            הטלפון הוא שם המשתמש בכניסה. אפשר לשלוח להם{" "}
            <strong>קישור כניסה</strong> — הם יקלידו את המספר בעצמם:{" "}
            {missingPhone.map((e) => e.fullName).join(", ")}.
          </p>
        </Notice>
      )}
      {needsReview.length > 0 && (
        /*
          ניטרלי ומקופל, לא ענבר: זו השלמת נתונים שאפשר לעשות מתישהו, לא
          משהו שחוסם. ענבר נשמר למי שבלי טלפון — הם באמת לא יכולים להיכנס.
          כששלוש הודעות ענבר עמדו ברצף, אף אחת לא בלטה.
        */
        <Notice tone="neutral" collapsible title={`${needsReview.length} עובדים דורשים השלמת פרטים`}>
          <p className="text-sm">
            הם הופיעו בגיליון בשם פרטי בלבד:{" "}
            {needsReview.map((e) => e.fullName).join(", ")}. כדאי להשלים שם מלא
            וטלפון כדי למנוע בלבול בין עובדים בעלי שם זהה.
          </p>
        </Notice>
      )}

      {creating ? (
        <Card>
          <h2 className="mb-4 font-semibold">עובד חדש</h2>
          <EmployeeForm action={createAction} onDone={() => setCreating(false)} />
        </Card>
      ) : (
        <Button onClick={() => setCreating(true)}>הוספת עובד</Button>
      )}

      {/*
        כרטיס לשורה בטלפון, טבלה בדסקטופ — אותו דפוס בדיוק כמו טבלת
        הסידור, ומאותה סיבה: הטבלה היא 52rem, פי 2.5 מרוחב הטלפון.
        בגלילה ימינה עמודת השם נעלמה ונשארו "עריכה / מתן ניהול / הוצאה"
        בלי לדעת על מי — במסך שמוציאים בו עובדים מהמערך.
      */}
      <ul className="space-y-2 md:hidden">
        {employees.map((employee) => (
          <li
            key={employee.id}
            className={`border border-line bg-surface ${
              employee.active ? "" : "opacity-60"
            }`}
          >
            <div className="space-y-2 p-4">
              <span className="block font-semibold">{nameCell(employee)}</span>

              {roleBadges(employee)}

              {/*
                זוגות תווית-ערך בשתי עמודות. קודם הם ישבו באותה שורה עם
                פער גדול, וזה נראה כמו שני שברים ולא כמו נתונים.
              */}
              <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-sm">
                <div>
                  <dt className="inline text-muted">חובה / מקס׳ </dt>
                  <dd className="inline">
                    <Num>
                      {employee.requiredShifts} / {employee.maxShifts}
                    </Num>
                  </dd>
                </div>
                <div>
                  <dt className="inline text-muted">העדפה </dt>
                  <dd className="inline">{periodLabel(employee)}</dd>
                </div>
              </dl>

              <div className="border-t border-line pt-2 text-sm">
                {credentials(employee)}
              </div>
            </div>

            {/* הפעולות צמודות לשם שהן פועלות עליו, ולא בקצה השני של גלילה */}
            <div className="flex flex-wrap gap-1 border-t border-line px-3 py-2">
              {rowActions(employee)}
            </div>

            {editing === employee.id && (
              <div className="border-t border-line bg-paper/50 p-4">
                <EmployeeForm
                  employee={employee}
                  action={updateAction.bind(null, employee.id)}
                  onDone={() => setEditing(null)}
                />
              </div>
            )}
          </li>
        ))}
      </ul>

      <div className="hidden overflow-x-auto border border-line bg-surface md:block">
        <table className="w-full min-w-[52rem] text-sm">
          <thead className="border-b border-line bg-paper/60 text-right">
            <tr>
              <th className="p-3 font-semibold">שם</th>
              <th className="p-3 font-semibold">תפקידים</th>
              <th className="p-3 font-semibold">חובה / מקס׳</th>
              <th className="p-3 font-semibold">העדפה</th>
              <th className="p-3 font-semibold">כניסה</th>
              <th className="p-3" />
            </tr>
          </thead>
          <tbody>
            {employees.map((employee) => (
              <Fragment key={employee.id}>
                <tr
                  className={`border-b border-line last:border-0 ${
                    employee.active ? "" : "opacity-50"
                  }`}
                >
                  <td className="p-3 font-medium">{nameCell(employee)}</td>
                  <td className="p-3">{roleBadges(employee)}</td>
                  <td className="p-3">
                    <Num>
                      {employee.requiredShifts} / {employee.maxShifts}
                    </Num>
                  </td>
                  <td className="p-3 text-muted">{periodLabel(employee)}</td>
                  <td className="p-3">{credentials(employee)}</td>
                  <td className="p-3 text-left">
                    <div className="flex flex-wrap justify-end gap-1">
                      {rowActions(employee)}
                    </div>
                  </td>
                </tr>
                {editing === employee.id && (
                  <tr>
                    <td colSpan={6} className="border-b border-line bg-paper/50 p-4">
                      <EmployeeForm
                        employee={employee}
                        action={updateAction.bind(null, employee.id)}
                        onDone={() => setEditing(null)}
                      />
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
