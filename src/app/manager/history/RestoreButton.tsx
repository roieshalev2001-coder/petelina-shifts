"use client";

import { useTransition } from "react";
import { useConfirm } from "@/components/Dialog";
import { Button } from "@/components/ui";

/**
 * החזרת סידור מהארכיון.
 *
 * באישור ולא בלחיצה אחת: שבוע שחוזר מופיע שוב אצל העובדים ונספר מחדש
 * בסבב שישי, ולכן זו לא פעולה שכדאי לעשות בטעות — גם אם היא הפיכה.
 */
export function RestoreButton({
  weekId,
  weekLabel,
  action,
}: {
  weekId: string;
  weekLabel: string;
  action: (weekId: string) => Promise<void>;
}) {
  const [pending, startTransition] = useTransition();
  const [ask, dialog] = useConfirm();

  return (
    <>
      {dialog}
      <Button
        variant="secondary"
        size="sm"
        disabled={pending}
        onClick={async () => {
          if (
            !(await ask(
              `להחזיר את ${weekLabel}?\n\nהוא יחזור למסך הראשי, והעובדים יראו אותו שוב אם הוא פורסם.`,
              { confirmLabel: "החזרה" },
            ))
          ) {
            return;
          }
          startTransition(() => action(weekId));
        }}
      >
        {pending ? "מחזיר…" : "החזרה"}
      </Button>
    </>
  );
}
