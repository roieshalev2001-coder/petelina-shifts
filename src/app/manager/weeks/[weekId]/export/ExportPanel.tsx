"use client";

import { useEffect, useRef, useState } from "react";
import { Wordmark } from "@/components/Band";
import { ScheduleTable, type CellAssignment } from "@/components/ScheduleTable";
import { Button, Card, LinkButton, PageHeader } from "@/components/ui";
import type { GridSlot } from "@/lib/grid";

/** רוחב התמונה ב-CSS. פי 2 בפועל — נקרא בטלפון גם אחרי שוואטסאפ דוחס */
const POSTER_WIDTH = 1400;

type Image = { file: File; url: string };

/**
 * הפעולות במסך הייצוא: תמונה אחת של כל הסידור — שליחה לקבוצת העובדים,
 * הורדה למחשב — והדפסה.
 *
 * הסידור נשלח לצוות בוואטסאפ, ותמונה אחת של כל הגיליון היא מה שהם
 * רגילים לקבל מהאקסל. **בלי חלון שיתוף** (החלטה של רואי): הוא שולח
 * מהמחשב, ושם חלון השיתוף רק מפריע. וגם בלי טקסט לפי ימים — הוסר.
 *
 * **שליחה לקבוצה** = העתקת התמונה ללוח ופתיחת הקבוצה, ורואי מדביק ושולח.
 * אין דרך לאתר להכניס תמונה לקבוצה בעצמו: קישור הזמנה לא מקבל תוכן (ראה
 * src/lib/settings.ts), ואין לוואטסאפ ממשק לקבוצות.
 *
 * התמונה מוכנה מראש, מיד כשהמסך נפתח, ולא בלחיצה: `clipboard.write` חייב
 * לרוץ ישר מהלחיצה, וספארי מסרב אם עברה שנייה של עיבוד בין הלחיצה
 * להעתקה. לכן הלחיצה רק מעתיקה את מה שכבר מוכן.
 *
 * הצילום נעשה בדפדפן (modern-screenshot) ולא בשרת: מנועי תמונה בצד השרת
 * לא מסדרים עברית מימין לשמאל באופן אמין, והגיליון כאן כבר נכון.
 */
export function ExportPanel({
  backHref,
  groupLink,
  weekLabel,
  weekStart,
  slots,
  assignments,
  days,
  trainees,
}: {
  backHref: string;
  /** קישור ההזמנה לקבוצת העובדים, מההגדרות. בלעדיו — רק הורדה */
  groupLink: string | null;
  /** "11/10–16/10" */
  weekLabel: string;
  weekStart: string;
  slots: GridSlot[];
  assignments: CellAssignment[];
  days: number[];
  /** slotId → שם המתלמד — ראה ScheduleTable */
  trainees: Record<string, string>;
}) {
  const posterRef = useRef<HTMLDivElement>(null);
  const [image, setImage] = useState<Image | null>(null);
  const [failed, setFailed] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let url: string | null = null;
    (async () => {
      try {
        // הגופנים חייבים להיטען לפני הצילום, אחרת הכותרת יוצאת בגופן חלופי
        await document.fonts.ready;
        const { domToBlob } = await import("modern-screenshot");
        const node = posterRef.current;
        if (!node || cancelled) return;
        const blob = await domToBlob(node, { scale: 2, type: "image/png" });
        if (cancelled) return;
        url = URL.createObjectURL(blob);
        const name = `סידור ${weekLabel.replace(/\//g, ".")}.png`;
        setImage({ file: new File([blob], name, { type: "image/png" }), url });
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();
    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [weekLabel]);

  function downloadImage() {
    if (!image) return;
    const a = document.createElement("a");
    a.href = image.url;
    a.download = image.file.name;
    a.click();
  }

  function sendToGroup() {
    if (!image || !groupLink) return;
    setError(null);
    /*
     * ההעתקה מתחילה לפני הפתיחה ובאותה לחיצה, בלי await ביניהן — אותו
     * דפוס כמו ב-Gaps.tsx: פתיחה אחרי await נחסמת בחלק מהדפדפנים כחלון
     * קופץ.
     */
    const copying =
      typeof ClipboardItem !== "undefined" && navigator.clipboard?.write
        ? navigator.clipboard.write([new ClipboardItem({ "image/png": image.file })])
        : Promise.reject(new Error("no image clipboard"));
    window.open(groupLink, "_blank", "noopener");
    copying
      .then(() => setCopied(true))
      .catch(() => {
        // בלי העתקה עדיין יש דרך: הקובץ במחשב, ומצרפים אותו בקבוצה
        downloadImage();
        setError("ההעתקה נחסמה — התמונה ירדה למחשב, צרפו אותה בקבוצה.");
      });
  }

  const imageLabel = failed ? "התמונה נכשלה" : "מכין תמונה…";

  return (
    <>
      <PageHeader
        title="ייצוא הסידור"
        subtitle={
          groupLink
            ? "תמונה אחת של כל הסידור — שליחה לקבוצת העובדים או הורדה למחשב."
            : "תמונה אחת של כל הסידור, להורדה למחשב."
        }
        action={
          <div className="flex flex-wrap gap-2">
            {groupLink && (
              <Button onClick={sendToGroup} disabled={!image}>
                {!image ? imageLabel : copied ? "הועתק ✓ — הדבק בקבוצה" : "שליחה לקבוצת העובדים"}
              </Button>
            )}
            {/* ראשי כשאין קישור לקבוצה — אז זו הדרך היחידה להוציא את הסידור */}
            <Button variant={groupLink ? "secondary" : "primary"} onClick={downloadImage} disabled={!image}>
              {!image && !groupLink ? imageLabel : "הורדת תמונה"}
            </Button>
            <Button variant="ghost" onClick={() => window.print()}>
              הדפסה
            </Button>
            <LinkButton href={backHref} variant="ghost">
              חזרה
            </LinkButton>
          </div>
        }
      />

      {groupLink && (
        <p className="-mt-2 mb-4 text-sm text-muted">
          {/* `.num` מבודד את ⌘V — בלעדיו הוא מתהפך ל-"V⌘" בתוך העברית */}
          הקבוצה תיפתח בוואטסאפ עם התמונה מועתקת — מדביקים (<span className="num">⌘V</span>) ושולחים.
        </p>
      )}
      {error && (
        <p role="alert" className="-mt-2 mb-4 text-sm text-amber-800">
          {error}
        </p>
      )}

      {/* מה שיישלח, בדיוק — כדי שלא יהיו הפתעות בקבוצה */}
      <Card flush className="overflow-hidden">
        {image ? (
          // eslint-disable-next-line @next/next/no-img-element -- blob מקומי, אין מה לבצע לו אופטימיזציה
          <img src={image.url} alt={`הסידור של ${weekLabel} כתמונה`} className="block w-full" />
        ) : (
          <p className="p-6 text-center text-sm text-muted">
            {failed
              ? "לא הצלחתי ליצור את התמונה. אפשר להשתמש בהדפסה."
              : "מכין את התמונה…"}
          </p>
        )}
      </Card>

      {/*
        הגיליון שממנו מצולמת התמונה — מחוץ למסך, ברוחב קבוע, ותמיד בפריסת
        הגיליון המלאה (layout="sheet"), גם כשהמסך הוא טלפון. העטיפה היא
        שמוזזת החוצה ולא הצומת המצולם, כדי שהמיקום לא ייכנס לתמונה.
      */}
      {!image && !failed && (
        <div
          aria-hidden
          inert
          className="no-print pointer-events-none fixed top-0"
          style={{ left: -(POSTER_WIDTH + 200) }}
        >
          <div ref={posterRef} dir="rtl" className="bg-white" style={{ width: POSTER_WIDTH }}>
            <div className="flex items-center gap-4 bg-band px-6 py-4 text-on-band">
              <Wordmark href="/manager" />
              <span className="mr-auto text-lg font-semibold">
                {/* LRI/PDI — ראה עמודת השעות ב-ScheduleTable */}
                סידור עבודה · <span className="num">{`\u2066${weekLabel}\u2069`}</span>
              </span>
            </div>
            <div className="p-4">
              <ScheduleTable
                layout="sheet"
                weekStart={weekStart}
                slots={slots}
                assignments={assignments}
                days={days}
                trainees={trainees}
              />
            </div>
          </div>
        </div>
      )}
    </>
  );
}
