"use client";

import { useState } from "react";
import { Button } from "@/components/ui";
import { Dialog } from "@/components/Dialog";

/** החלון הקופץ, לבדיקה במקלדת: Esc, טאב שנשאר בפנים, והחזרת הפוקוס. */
export function DialogDemo() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="secondary" onClick={() => setOpen(true)}>
        פתיחת חלון
      </Button>
      {open && (
        <Dialog label="חלון לדוגמה" onClose={() => setOpen(false)} className="max-w-md">
          <h3 className="text-lg font-bold">חלון לדוגמה</h3>
          <p className="mt-2 text-sm text-muted">שני כפתורים, כדי לבדוק שהטאב מסתובב ביניהם.</p>
          <div className="mt-5 flex gap-2">
            <Button onClick={() => setOpen(false)}>אישור</Button>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              ביטול
            </Button>
          </div>
        </Dialog>
      )}
    </>
  );
}
