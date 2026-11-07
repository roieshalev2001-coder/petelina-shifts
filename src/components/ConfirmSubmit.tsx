"use client";

import { useRef, type ComponentProps } from "react";
import { useConfirm } from "@/components/Dialog";
import { Button } from "@/components/ui";

/**
 * כפתור שליחה שמבקש אישור לפני שהוא שולח את הטופס.
 *
 * קיים כי מסכי המנהל הם server components, והאישור דורש קוד בדפדפן.
 * הלחיצה הראשונה נעצרת (`preventDefault`) ופותחת את החלון; רק אחרי
 * "אישור" הטופס נשלח — דרך `requestSubmit` עם הכפתור עצמו, כך שה-server
 * action מקבל בדיוק את מה שהיה מקבל מלחיצה רגילה.
 *
 * קודם זה היה `confirm()` של הדפדפן, שעוצר את הדף בצורה סינכרונית —
 * החלון המעוצב הוא אסינכרוני, ולכן הדגל `approved` מעביר את הלחיצה השנייה.
 */
export function ConfirmSubmit({
  message,
  confirmLabel,
  danger,
  children,
  ...props
}: ComponentProps<typeof Button> & {
  message: string;
  confirmLabel?: string;
  danger?: boolean;
}) {
  const approved = useRef(false);
  const [ask, dialog] = useConfirm();

  return (
    <>
      {dialog}
      <Button
        {...props}
        type="submit"
        onClick={async (event) => {
          if (approved.current) {
            approved.current = false;
            return;
          }
          event.preventDefault();
          const button = event.currentTarget;
          if (await ask(message, { confirmLabel, danger })) {
            approved.current = true;
            button.form?.requestSubmit(button);
          }
        }}
      >
        {children}
      </Button>
    </>
  );
}
