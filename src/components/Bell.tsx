import Link from "next/link";

/**
 * הפעמון שבכותרת.
 *
 * מופיע בשתי הכותרות — האישית ושל הניהול — כי מנהל הוא גם עובד, ומקבל
 * גם התראות על משמרות וגם על חילופים שממתינים לו.
 *
 * יושב תמיד על הפס השחור, ולכן הצבעים שלו הם של הפס.
 *
 * המונה נעצר ב-9+ ולא מציג מספר אמיתי: ההבדל בין 12 ל-30 אינו משנה
 * שום החלטה, והרוחב הקבוע מונע מהכותרת לקפוץ.
 */
export function Bell({ unread }: { unread: number }) {
  return (
    <Link
      href="/me/notifications"
      aria-label={unread > 0 ? `התראות — ${unread} חדשות` : "התראות"}
      className="relative p-1.5 text-on-band-muted transition-colors duration-150 hover:text-on-band"
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="size-5"
        aria-hidden="true"
      >
        <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
        <path d="M13.7 21a2 2 0 0 1-3.4 0" />
      </svg>

      {unread > 0 && (
        /* ענבר ולא אדום: זו התראה, לא פעולה הרסנית — ראה חוזה האדום
           ב-globals.css */
        <span className="num absolute -top-0.5 right-0 min-w-4 bg-amber-500 px-1 text-center text-[10px] font-bold leading-4 text-white">
          {unread > 9 ? "9+" : unread}
        </span>
      )}
    </Link>
  );
}
