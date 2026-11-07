"use client";

import { useState, useTransition } from "react";
import { Button, Notice, Num } from "@/components/ui";

/**
 * מצב סבב שישי בשבוע הזה, והדרך להשלים אותו.
 *
 * הזריעה קורית פעם אחת בלבד — ברגע פתיחת השבוע. שבוע שנפתח לפני שהסבב
 * נוצר, או לפני שהגיליון יובא, נשאר בלעדיו ואיש אינו אומר זאת. הכרטיס
 * הזה הוא הסימן, והכפתור הוא הדרך.
 */
export function FridayRotation({
  planned,
  inPlace,
  unmatched,
  reseed,
}: {
  planned: number;
  inPlace: number;
  unmatched: string[];
  reseed: () => Promise<{
    seeded: number;
    withoutAvailability: string[];
    unmatched: string[];
  }>;
}) {
  const [done, setDone] = useState<{ seeded: number; unmatched: string[] } | null>(
    null,
  );
  const [pending, start] = useTransition();

  // הסבב יושב בסידור במלואו ואין מה לומר
  if (planned > 0 && inPlace === planned && unmatched.length === 0 && !done) {
    return null;
  }

  const title =
    planned === 0
      ? "אין סבב שישי לשבוע הזה"
      : `סבב שישי: ${inPlace} מתוך ${planned} בסידור`;

  return (
    <Notice collapsible title={title}>
      {planned === 0 ? (
        <p className="text-sm">
          לא נוצר סבב לשישי של השבוע הזה. אפשר לייבא אותו מהגיליון במסך
          סבב שישי, ואז לחזור לכאן ולהזרים.
        </p>
      ) : (
        <p className="text-sm">
          הסבב נזרע ברגע פתיחת השבוע. אם ייבאת או תיקנת אותו מאז, השינוי
          עדיין לא הגיע לסידור.
        </p>
      )}

      {unmatched.length > 0 && (
        <p className="mt-1 text-sm text-muted">
          לא נמצאה משבצת עבור: {unmatched.join(", ")}
        </p>
      )}

      <div className="mt-2">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={pending || planned === 0}
          onClick={() => start(async () => setDone(await reseed()))}
        >
          הזרמת הסבב לסידור
        </Button>
      </div>

      {done && (
        <p className="mt-2 text-sm">
          נזרעו <Num>{done.seeded}</Num> שיבוצים.
          {done.unmatched.length > 0 && (
            <span className="text-muted"> ללא משבצת: {done.unmatched.join(", ")}.</span>
          )}
        </p>
      )}
    </Notice>
  );
}
