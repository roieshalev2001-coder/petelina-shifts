"use client";

import { useState, useTransition } from "react";
import { useConfirm } from "@/components/Dialog";
import { Button } from "@/components/ui";

/**
 * פתיחת שבוע להגשה.
 *
 * כשכבר יש שבוע פתוח, פתיחת שבוע נוסף היא החלטה ולא תאונה: העובדים
 * יראו שני שבועות ויצטרכו לבחור לאיזה מהם הם מגישים. לכן יש כאן אישור
 * שמונה בדיוק מה כבר פתוח.
 *
 * האישור בדפדפן אינו השער — `openNextWeek` בצד השרת דורש את אותו
 * `confirmed` ומסרב בלעדיו. הדיאלוג כאן רק מסביר למה מאשרים.
 */
export function OpenWeekButton({
  label,
  openLabels,
  action,
}: {
  /** מה כתוב על הכפתור — השבוע שייפתח */
  label: React.ReactNode;
  /** השבועות שכבר פתוחים להגשה, כתוויות לקריאה */
  openLabels: string[];
  action: (confirmed: boolean) => Promise<{ error: string } | void>;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [ask, dialog] = useConfirm();

  async function click() {
    const alsoOpen = openLabels.length > 0;
    if (alsoOpen) {
      // השאלה ראשונה — היא הופכת לכותרת החלון. מה שכבר פתוח בא אחריה.
      const question =
        openLabels.length === 1 ? "לפתוח שבוע נוסף במקביל?" : "לפתוח עוד שבוע במקביל?";
      const list = openLabels.join(", ");
      const already = openLabels.length === 1 ? `כבר פתוח להגשה: ${list}.` : `כבר פתוחים להגשה: ${list}.`;
      if (
        !(await ask(`${question}\n\n${already}\n\nהעובדים יראו את כולם ויבחרו לאיזה להגיש.`, {
          confirmLabel: "פתיחה",
        }))
      ) {
        return;
      }
    }

    setError(null);
    startTransition(async () => {
      const result = await action(alsoOpen);
      if (result?.error) setError(result.error);
    });
  }

  return (
    <div className="mr-auto">
      {dialog}
      <Button
        variant={openLabels.length > 0 ? "secondary" : "primary"}
        disabled={pending}
        onClick={click}
      >
        {pending ? "פותח…" : label}
      </Button>
      {error && (
        <p role="alert" className="mt-1 text-sm text-amber-800">
          {error}
        </p>
      )}
    </div>
  );
}
