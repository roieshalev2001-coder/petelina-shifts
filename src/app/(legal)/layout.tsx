import { BandHeader } from "@/components/Band";
import { LegalLinks, SkipLink } from "@/components/ui";

/**
 * דפי המידע: הצהרת נגישות, מדיניות פרטיות ותקנון.
 *
 * פתוחים לכולם, גם בלי כניסה — מי שנתקל בקושי צריך להגיע להצהרה ולפרטי
 * הקשר לפני שהצליח להיכנס. לכן אין כאן `requireUser`, ואין סרגל
 * לשוניות: הוא שייך לאזור שאחרי הכניסה.
 */
export default function LegalLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="flex min-h-full flex-1 flex-col">
      <SkipLink />
      <BandHeader home="/" />

      <main
        id="main"
        tabIndex={-1}
        className="mx-auto w-full max-w-2xl flex-1 px-4 py-8 focus:outline-none"
      >
        {children}
      </main>

      <footer className="pb-safe border-t border-line">
        <LegalLinks className="mx-auto max-w-2xl px-4 py-3" />
      </footer>
    </div>
  );
}
