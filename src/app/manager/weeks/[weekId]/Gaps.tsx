"use client";

import { useState } from "react";
import { Button, LinkButton, Notice } from "@/components/ui";
import { whatsappShareUrl } from "@/lib/whatsapp";

/**
 * משבצות שנשארו בלי איש, וההודעה לקבוצה.
 *
 * **הודעה אחת לתפקיד ולא אחת למשבצת** — חמש הודעות נפרדות לאותה קבוצה הן
 * ספאם שאיש לא קורא, ומי שכן יקרא לא יבין כמה באמת חסר.
 *
 * הכפתור הראשי פותח את וואטסאפ **עם ההודעה כבר כתובה** ומסך בחירה למי
 * לשלוח; בוחרים את הקבוצה ושולחים. אין דרך לכוון ישירות לקבוצה עם טקסט —
 * קישור הזמנה לקבוצה אינו מקבל טקסט כלל (ראה src/lib/settings.ts) — ולכן
 * עד עכשיו הכפתור רק העתיק ופתח, והמנהל ראה קבוצה בלי שום הודעה.
 *
 * כשמוגדר קישור לקבוצה, "העתקה ופתיחת הקבוצה" נשאר כדרך שנייה.
 */
export function Gaps({
  groups,
}: {
  groups: {
    role: string;
    roleLabel: string;
    link: string | null;
    message: string;
    gaps: { day: string; time: string }[];
  }[];
}) {
  const [copied, setCopied] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (groups.length === 0) return null;

  return (
    <Notice collapsible title={`משבצות שנשארו בלי איש (${groups.reduce((n, g) => n + g.gaps.length, 0)})`}>
      <div className="space-y-5">
        {groups.map((g) => (
          <div key={g.role}>
            <p className="text-sm font-medium">
              {g.roleLabel} — {g.gaps.length}
            </p>
            <ul className="mt-1 text-sm text-muted">
              {g.gaps.map((gap, i) => (
                <li key={i}>
                  {gap.day} · <span className="num">{gap.time}</span>
                </li>
              ))}
            </ul>

            <div className="mt-3 flex flex-wrap items-center gap-2">
              {/* קישור ולא window.open: נפתח ישירות מהלחיצה, ואייפון לא חוסם אותו */}
              <LinkButton
                href={whatsappShareUrl(g.message)}
                target="_blank"
                rel="noopener noreferrer"
                prefetch={false}
              >
                ניסוח הודעה לקבוצת ה{g.roleLabel}
              </LinkButton>

              {g.link && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setError(null);
                    /*
                     * ההעתקה מתחילה לפני הפתיחה ובאותה לחיצה, בלי await
                     * ביניהן: פתיחה אחרי await נחסמת בחלק מהדפדפנים כחלון
                     * קופץ, וזה מה שקרה כאן קודם.
                     */
                    const copying = navigator.clipboard?.writeText(g.message);
                    window.open(g.link!, "_blank", "noopener");
                    (copying ?? Promise.reject())
                      .then(() => setCopied(g.role))
                      .catch(() =>
                        setError(
                          'ההעתקה נחסמה. אפשר להעתיק ידנית מ"טקסט ההודעה" למטה.',
                        ),
                      );
                  }}
                >
                  {copied === g.role ? "הועתק ✓ — הדבק בקבוצה" : "העתקה ופתיחת הקבוצה"}
                </Button>
              )}
            </div>
            <p className="mt-1.5 text-xs text-muted">
              וואטסאפ ייפתח עם ההודעה כתובה — בוחרים את הקבוצה ושולחים.
            </p>

            {/* הטקסט תמיד זמין, גם כשההעתקה נחסמה או כשאין וואטסאפ במכשיר */}
            <details className="mt-2">
              <summary className="cursor-pointer text-xs text-muted">טקסט ההודעה</summary>
              <pre className="mt-1 whitespace-pre-wrap bg-paper p-3 font-sans text-xs">
                {g.message}
              </pre>
            </details>
          </div>
        ))}

        {error && <p role="alert" className="text-sm text-amber-800">{error}</p>}
      </div>
    </Notice>
  );
}
