"use client";

import { useState, useTransition } from "react";
import { useConfirm } from "@/components/Dialog";
import { Badge, Button } from "@/components/ui";
import { formatPhone } from "@/lib/phone";
import { formatDate } from "@/lib/time";
import { whatsappUrl } from "@/lib/whatsapp";

/**
 * פרטי הכניסה של העובד, וקישור הכניסה האישי.
 *
 * המנהל לא ממציא יותר קוד: הוא יוצר קישור (src/lib/invite.ts), שולח אותו
 * בוואטסאפ, והעובד בוחר קוד בעצמו. הקישור מוצג **פעם אחת** — במסד נשמר רק
 * הגיבוב שלו. מי שסגר בלי להעתיק יוצר קישור חדש, והקודם מתבטל. זה עובד
 * גם לעובד בלי טלפון (הוא מקליד אותו בקישור) וגם למי ששכח את הקוד.
 */
export function Credentials({
  fullName,
  phone,
  baseUrl,
  hasPasscode,
  mustChange,
  locked,
  sentAt,
  inviteUntil,
  onInvite,
  onRevoke,
  onSent,
}: {
  fullName: string;
  phone: string | null;
  /** הכתובת הראשית — ממנה נבנה הקישור */
  baseUrl: string;
  hasPasscode: boolean;
  mustChange: boolean;
  /** מחושב בשרת: קריאה ל-Date.now בזמן רינדור אינה טהורה */
  locked: boolean;
  sentAt: Date | null;
  /** עד מתי קישור הכניסה הפתוח תקף, או null כשאין */
  inviteUntil: Date | null;
  onInvite: () => Promise<
    { ok: true; data: { token: string; expiresAt: Date } } | { ok: false; error: string }
  >;
  onRevoke: () => Promise<void>;
  onSent: () => void;
}) {
  const [revealed, setRevealed] = useState<{ link: string; expiresAt: Date } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [pending, startTransition] = useTransition();
  const [ask, dialog] = useConfirm();

  const message = revealed
    ? `היי ${fullName}, זה הקישור האישי שלך לסידור המשמרות של פטלינה:\n${revealed.link}\n\n` +
      `בקישור בוחרים קוד בן 6 ספרות, ומאז נכנסים עם מספר הטלפון והקוד. ` +
      `הקישור עובד פעם אחת ותקף עד ${formatDate(revealed.expiresAt)}.\n\n` +
      `כדאי לפתוח בדפדפן (Safari או Chrome) ולא בתוך וואטסאפ, כדי להישאר מחובר.`
    : "";

  async function create() {
    const detail = hasPasscode
      ? "\n\nהקוד הנוכחי ימשיך לעבוד עד שיבחר קוד חדש דרך הקישור."
      : !phone
        ? "\n\nאין לו טלפון במערכת — הוא יקליד אותו בעצמו בקישור."
        : "";
    const again = inviteUntil ? "\n\nהקישור הקודם יפסיק לעבוד." : "";
    if (!(await ask(`ליצור קישור כניסה ל${fullName}?${detail}${again}`, { confirmLabel: "יצירה" }))) {
      return;
    }
    setError(null);
    setCopied(false);
    startTransition(async () => {
      const result = await onInvite();
      if (result.ok) {
        setRevealed({
          link: `${baseUrl}/invite/${result.data.token}`,
          expiresAt: new Date(result.data.expiresAt),
        });
      } else {
        setError(result.error);
      }
    });
  }

  return (
    <div className="min-w-64 space-y-1.5">
      {dialog}
      <div className="flex flex-wrap items-center gap-1.5 text-xs">
        <span className="num text-muted">{formatPhone(phone) || "אין טלפון"}</span>
        {!phone ? (
          <Badge tone="amber">חסר טלפון</Badge>
        ) : locked ? (
          <Badge tone="amber">נעול</Badge>
        ) : !hasPasscode ? (
          <Badge tone="amber">אין קוד</Badge>
        ) : mustChange ? (
          <Badge>קוד ראשוני</Badge>
        ) : (
          <Badge tone="green">פעיל</Badge>
        )}
        {sentAt ? (
          <span className="text-muted">
            נשלח <span className="num">{formatDate(sentAt)}</span>
          </span>
        ) : (
          <span className="text-amber-800">טרם נשלח</span>
        )}
      </div>

      {error && <p role="alert" className="text-xs text-amber-800">{error}</p>}

      {revealed ? (
        <div className="border border-brand/40 bg-brand/[0.04] p-2.5">
          <p className="text-xs text-muted">
            הקישור מוצג פעם אחת בלבד · תקף עד{" "}
            <span className="num">{formatDate(revealed.expiresAt)}</span>
          </p>
          <p dir="ltr" className="my-1 break-all text-left text-xs font-medium">
            {revealed.link}
          </p>
          <div className="flex flex-wrap gap-1">
            {whatsappUrl(phone, message) && (
              <a
                href={whatsappUrl(phone, message)!}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => onSent()}
                className="border border-line bg-surface px-3 py-1.5 text-xs font-medium transition hover:bg-paper"
              >
                שליחה בוואטסאפ
              </a>
            )}
            <Button
              variant="secondary"
              size="sm"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(message);
                  setCopied(true);
                  onSent();
                } catch {
                  setError("ההעתקה נחסמה — סמן את הקישור והעתק ידנית");
                }
              }}
            >
              {copied ? "הועתק ✓" : "העתקת הודעה"}
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setRevealed(null)}>
              סיימתי
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="secondary" size="sm" disabled={pending} onClick={create}>
            {pending ? "יוצר…" : inviteUntil ? "קישור כניסה חדש" : "קישור כניסה"}
          </Button>
          {inviteUntil && (
            <span className="text-xs text-muted">
              קישור פתוח עד <span className="num">{formatDate(inviteUntil)}</span> ·{" "}
              <button
                type="button"
                disabled={pending}
                onClick={async () => {
                  if (!(await ask(`לבטל את קישור הכניסה של ${fullName}?`, { confirmLabel: "ביטול הקישור" }))) {
                    return;
                  }
                  startTransition(() => onRevoke());
                }}
                className="underline underline-offset-2"
              >
                ביטול
              </button>
            </span>
          )}
        </div>
      )}
    </div>
  );
}
