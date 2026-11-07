"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/*
 * כל מסך שב"עוד" של הטלפון (src/app/manager/more/page.tsx) חייב להופיע
 * גם כאן — המסך הרחב לא מציג את "עוד", ולכן מה שחסר כאן פשוט אין אליו
 * דרך מהמחשב. כך קרה עם "סידורי עבר": הוא היה רק בטלפון, ובמחשב הקישור
 * היחיד אליו הופיע רק כשכבר היה בארכיון משהו.
 */
const NAV = [
  { href: "/manager", label: "שבועות" },
  { href: "/manager/history", label: "סידורי עבר" },
  { href: "/manager/employees", label: "עובדים" },
  { href: "/manager/constraints", label: "הגבלות" },
  { href: "/manager/fridays", label: "סבב שישי" },
  { href: "/manager/template", label: "תבנית שבועית" },
  { href: "/manager/settings", label: "הגדרות" },
];

export function ManagerNav() {
  const pathname = usePathname();

  return (
    /* מוסתר בטלפון: שבעה פריטים בשורה נשברים לשלוש שורות, ושם הסרגל
       התחתון עושה את העבודה */
    <nav className="hidden flex-1 flex-wrap gap-1 md:flex">
      {NAV.map((item) => {
        // "/manager" הוא תחילית של כל השאר, ולכן הוא נבדק בהתאמה מדויקת
        const active =
          item.href === "/manager"
            ? pathname === "/manager" || pathname.startsWith("/manager/weeks")
            : pathname.startsWith(item.href);

        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            // על הפס: הפעיל בהיר ומודגש עם קו אדום מתחתיו, השאר מעומעמים
            className={`border-b-2 px-3 py-1.5 text-sm transition-colors duration-150 ${
              active
                ? "border-brand font-bold text-on-band"
                : "border-transparent text-on-band-muted hover:text-on-band"
            }`}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
