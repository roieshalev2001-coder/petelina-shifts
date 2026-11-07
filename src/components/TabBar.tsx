"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * סרגל הלשוניות התחתון.
 *
 * לפני זה לא הייתה שום דרך לעבור בין מסכים חוץ מקישורים בתוך התוכן —
 * חמישה מסכי עובד ותשעה מסכי ניהול, וכולם מבוי סתום. בטלפון זה גם
 * המקום הנכון: תחתית המסך היא בהישג אגודל, וכותרת עליונה אינה.
 *
 * מוסתר מ-`md` ומעלה, כי במסך רחב הכותרת מספיקה ואין בעיית הישג.
 *
 * `pb-safe` הוא חובה ולא קישוט — בלעדיו הסרגל יושב מתחת לפס הבית של
 * האייפון, וחצי ממנו לא ניתן ללחיצה.
 */

/**
 * הלשונית היא **נתונים בלבד**, והאייקון מזוהה בשם.
 *
 * הניסיון הראשון העביר את ה-SVG עצמו כ-prop, וזה נכשל בשקט: רכיב שרת
 * שמייבא ערך מקובץ `"use client"` מקבל client reference ולא אלמנט, ולכן
 * `<span>` האייקון רונדר ריק בלי שום שגיאה. שם הוא מחרוזת, מחרוזת
 * עוברת סריאליזציה, וה-SVG נבנה כאן — בצד שבו הוא חי ממילא.
 */
export type IconName = keyof typeof ICONS;

export type Tab = {
  href: string;
  label: string;
  icon: IconName;
  /** נקודת "יש חדש" — כרגע רק על ההתראות */
  dot?: boolean;
};

/**
 * האם הלשונית פעילה.
 *
 * התאמה מדויקת לשורש, ותחילית לשאר. בלי ההבחנה הזו `/me` היה נדלק בכל
 * מסך באזור האישי, ואז שום דבר לא מסמן איפה אתה.
 */
function isActive(pathname: string, href: string, root: string): boolean {
  if (href === root) return pathname === root;
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function TabBar({
  tabs,
  root,
  hideOn = [],
}: {
  tabs: Tab[];
  root: string;
  /**
   * מסלולים שבהם הסרגל אינו מוצג.
   *
   * מסך שיש לו סרגל פעולה דביק משלו — טופס ההגשה — לא יכול להחזיק גם
   * את זה: שני סרגלים מקובעים יושבים זה על זה. במסך משימה ממוקדת זו
   * גם ההתנהגות הנכונה, ויציאה ממנו נעשית מהכותרת.
   */
  hideOn?: string[];
}) {
  const pathname = usePathname();
  if (hideOn.includes(pathname)) return null;

  const activeIndex = tabs.findIndex((tab) => isActive(pathname, tab.href, root));

  return (
    <>
      {/*
        המרווח נולד עם הסרגל ומת איתו.
        קודם הוא היה `pb-nav` על ה-main של כל מעטפת, וזה שבר בשני
        כיוונים: מסך שמסתיר את הסרגל נשאר עם חור בתחתית, ומסך חדש
        שישכח את המחלקה יאבד את השורה האחרונה מתחת לסרגל.
      */}
      <div aria-hidden className="tab-bar-spacer pb-safe h-14 md:hidden" />

      <nav
        aria-label="ניווט ראשי"
        className="tab-bar pb-safe fixed inset-x-0 bottom-0 z-40 border-t border-line bg-surface/95 backdrop-blur md:hidden"
      >
        <ul className="relative mx-auto flex max-w-3xl">
          {/*
            הפס האדום מעל הלשונית הפעילה. רכיב אחד שזז, ולא פס לכל לשונית
            שנדלק וכבה: ה-layout נשאר חי בין מסכים, ולכן הפס גולש מהלשונית
            הקודמת לחדשה ומראה מאיפה הגעת. ראה .tab-indicator ב-globals.css.

            RTL: הלשונית הראשונה מימין, ולכן הפס יוצא מימין וזז שמאלה.
            מסך שאין לו לשונית (החלפת קוד) — הפס נעלם במקום להצביע על משהו.
          */}
          <span
            aria-hidden
            className="tab-indicator pointer-events-none absolute top-0 right-0 h-[3px] bg-brand"
            style={{
              width: `${100 / tabs.length}%`,
              transform: `translateX(${-Math.max(activeIndex, 0) * 100}%)`,
              opacity: activeIndex < 0 ? 0 : 1,
            }}
          />
          {tabs.map((tab, i) => {
          const active = i === activeIndex;
          return (
            <li key={tab.href} className="flex-1">
              <Link
                href={tab.href}
                aria-current={active ? "page" : undefined}
                className={`flex min-h-14 flex-col items-center justify-center gap-0.5 px-1 pt-1.5 text-[0.6875rem] transition-transform duration-150 ease-[var(--ease-out)] active:scale-[0.94] ${
                  active ? "font-bold text-ink" : "font-medium text-muted"
                }`}
              >
                <span className="relative">
                  {ICONS[tab.icon]}
                  {tab.dot && (
                    <span
                      aria-hidden
                      /* ענבר ולא אדום: זו התראה ולא פעולה — חוזה האדום
                         ב-globals.css, ואותו צבע כמו בפעמון שבכותרת */
                      className="absolute -top-0.5 -left-0.5 size-2 rounded-full bg-amber-500 ring-2 ring-surface"
                    />
                  )}
                </span>
                {tab.label}
              </Link>
            </li>
          );
        })}
        </ul>
      </nav>
    </>
  );
}

/*
 * האייקונים.
 *
 * SVG מוטבע ולא ספריית אייקונים: שבעה אייקונים אינם מצדיקים תלות נוספת,
 * וכל אייקון שנטען מרשת הוא עוד בקשה בטעינה הראשונה בטלפון.
 * `currentColor` כדי שהצבע יגיע מהלשונית ולא יוגדר פעמיים.
 */
const iconProps = {
  width: 22,
  height: 22,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.75,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
};

const ICONS = {
  home: (
    <svg {...iconProps}>
      <path d="M3 10.5 12 3l9 7.5" />
      <path d="M5 9.5V20a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V9.5" />
    </svg>
  ),
  submit: (
    <svg {...iconProps}>
      <path d="M4 4h11l5 5v11a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1Z" />
      <path d="M8 13h8M8 17h5" />
    </svg>
  ),
  calendar: (
    <svg {...iconProps}>
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M3 10h18M8 3v4M16 3v4" />
    </svg>
  ),
  bell: (
    <svg {...iconProps}>
      <path d="M18 9a6 6 0 1 0-12 0c0 5-2 6-2 6h16s-2-1-2-6" />
      <path d="M10.5 20a2 2 0 0 0 3 0" />
    </svg>
  ),
  grid: (
    <svg {...iconProps}>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="M3 9h18M9 9v11M15 9v11" />
    </svg>
  ),
  people: (
    <svg {...iconProps}>
      <circle cx="9" cy="8" r="3.25" />
      <path d="M3.5 20a5.5 5.5 0 0 1 11 0" />
      <path d="M16 5.5a3.25 3.25 0 0 1 0 6.5M17 20a5.5 5.5 0 0 0-2-4.3" />
    </svg>
  ),
  more: (
    <svg {...iconProps}>
      <circle cx="5" cy="12" r="1.4" fill="currentColor" stroke="none" />
      <circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none" />
      <circle cx="19" cy="12" r="1.4" fill="currentColor" stroke="none" />
    </svg>
  ),
};
