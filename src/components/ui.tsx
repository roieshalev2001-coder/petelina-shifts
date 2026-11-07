import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import type { Role } from "@/lib/domain";

/*
 * פס מצב בצד ההתחלה של כרטיס (ימין, ב-RTL) — מזהים את המצב לפני שקוראים.
 * אותם גוונים כמו התגים, כדי שפס ותג על אותו כרטיס לא יתווכחו.
 */
const accents = {
  green: "border-s-4 border-s-emerald-600",
  red: "border-s-4 border-s-rose-600",
  blue: "border-s-4 border-s-sky-700",
  amber: "border-s-4 border-s-amber-500",
  neutral: "border-s-4 border-s-stone-400",
} as const;

/**
 * כרטיס שטוח.
 *
 * בלי הצל הרך שהיה כאן: צל מטושטש מתחת לכל כרטיס הוא מה שנותן לממשק
 * מראה של תבנית. הקו החד והקרם מסביב מפרידים מספיק.
 */
export function Card({
  children,
  className = "",
  flush = false,
  accent,
  ...props
}: ComponentProps<"div"> & {
  /** בלי ריפוד — לכרטיס שהתוכן שלו מנהל את המרווחים בעצמו (details, טבלה) */
  flush?: boolean;
  accent?: keyof typeof accents;
}) {
  return (
    <div
      {...props}
      className={`border border-line bg-surface ${accent ? accents[accent] : ""} ${
        flush ? "" : "p-5"
      } ${className}`}
    >
      {children}
    </div>
  );
}

export function PageHeader({
  title,
  subtitle,
  action,
}: {
  /** ReactNode ולא מחרוזת: טווח תאריכים בכותרת חייב לשבת בתוך `Num` */
  title: ReactNode;
  subtitle?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="mb-7 flex flex-wrap items-end justify-between gap-x-4 gap-y-3">
      <div className="min-w-0">
        {/* כותרת מסך בגודל של כותרת, לא של תווית — היררכיה מתחילה כאן */}
        <h1 className="text-[1.875rem] leading-[1.1] font-extrabold tracking-[-0.02em] sm:text-[2.25rem]">
          {title}
        </h1>
        {subtitle && (
          <p className="mt-2 max-w-prose text-sm leading-relaxed text-muted">{subtitle}</p>
        )}
      </div>
      {action}
    </div>
  );
}

/*
 * `active:scale-[0.97]` הוא משוב, לא קישוט.
 *
 * בלעדיו הכפתור מגיב רק בשינוי צבע, וזה חלש מדי במגע — האצבע מכסה את
 * הכפתור בדיוק ברגע שהצבע משתנה. הקטנה קטנה מורגשת גם מתחת לאצבע,
 * ואומרת "שמעתי אותך" לפני שהתשובה מהשרת חוזרת.
 *
 * `transition-transform` ולא `transition` הכללי: רק מה שצריך לזוז,
 * ובמשך של 160ms שהוא הטווח של משוב לחיצה.
 */
const buttonBase =
  "inline-flex items-center justify-center gap-2 font-medium " +
  "transition-transform duration-150 ease-[var(--ease-out)] active:scale-[0.97] " +
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand/60 " +
  "disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100";

/**
 * הווריאנטים נגזרים מחוזה האדום:
 * primary — הפעולה הראשית, אחת למסך. danger — הרס, מסגרת בלבד.
 * כל השאר ניטרלי, כדי שהאדום יישאר קריא כאות לפעולה.
 */
const variants = {
  primary: "bg-brand text-white hover:bg-brand-deep active:bg-brand-deep",
  // מסגרת בצבע הדיו ולא בקו האפור: כפתור הוא דבר שלוחצים עליו, לא עוד כרטיס
  secondary: "border border-ink/80 bg-surface text-ink hover:bg-paper",
  danger: "border border-brand/45 bg-surface text-brand hover:bg-brand/[0.06]",
  ghost: "text-muted hover:bg-paper hover:text-ink",
} as const;

/** md הוא יעד מגע של 44px; sm לפעולות משניות בתוך שורות צפופות */
const sizes = {
  md: "min-h-12 px-5 py-2.5 text-[0.9375rem] font-semibold",
  sm: "px-3 py-1.5 text-xs",
} as const;

/** לרוחב מלא — בטלפון הפעולה הראשית היא שורה ולא כפתור צר בפינה */
const blockClass = "w-full";

type Styling = {
  variant?: keyof typeof variants;
  size?: keyof typeof sizes;
  block?: boolean;
};

export function Button({
  variant = "primary",
  size = "md",
  block = false,
  className = "",
  ...props
}: ComponentProps<"button"> & Styling) {
  return (
    <button
      {...props}
      className={`${buttonBase} ${sizes[size]} ${variants[variant]} ${
        block ? blockClass : ""
      } ${className}`}
    />
  );
}

export function LinkButton({
  variant = "secondary",
  size = "md",
  block = false,
  className = "",
  ...props
}: ComponentProps<typeof Link> & Styling) {
  return (
    <Link
      {...props}
      className={`${buttonBase} ${sizes[size]} ${variants[variant]} ${
        block ? blockClass : ""
      } ${className}`}
    />
  );
}

export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-muted">{hint}</span>}
    </label>
  );
}

/**
 * `text-base` ולא `text-sm`, ולא מטעמי אסתטיקה.
 *
 * Safari באייפון מזניק את המסך בכל מיקוד בשדה שהגופן שלו קטן מ-16px.
 * `text-sm` הוא 14px, ולכן כל טופס באתר — כניסה, הגשה, פרופיל — הקפיץ
 * את התצוגה. `min-h-11` שומר על יעד מגע של 44px.
 */
export const inputClass =
  "min-h-12 w-full border border-ink/25 bg-surface px-3 py-2.5 text-base outline-none transition-colors duration-150 focus:border-ink focus:ring-2 focus:ring-ink/10";

/**
 * הטונים מתורגמים ישירות מחוזה האדום. אין טון אדום: אזהרה היא ענבר,
 * ו-brand שמור למה שנבחר או למה שלוחצים עליו.
 */
const badgeTones = {
  neutral: "bg-paper text-ink/75",
  brand: "bg-brand text-white",
  green: "bg-emerald-100 text-emerald-900",
  amber: "bg-amber-100 text-amber-900",
  blue: "bg-sky-100 text-sky-900",
  /*
   * החריג היחיד לכלל "האדום שמור לפעולה" שמתואר ב-Notice למטה.
   *
   * ענבר כבר נושא ארבע אזהרות שונות בלוח — מקוצר, כיסוי חלקי, מתחת למכסה,
   * פותח באיחור — ולכן אזהרה חמישית בענבר הייתה נבלעת. חריגה ממקסימום היא
   * היחידה שדורשת אישור אקטיבי של המנהל, וזה מה שמצדיק גוון משלה.
   *
   * rose ולא red: נבדל מאדום המותג (#ca262e) שבכפתורים, כדי שתג לא ייקרא
   * כדבר שאפשר ללחוץ עליו. הצבע לעולם אינו לבד — התג נושא טקסט מלא (תקן
   * 1.4.1, "שימוש בצבע").
   */
  red: "bg-rose-100 text-rose-900",
} as const;

export function Badge({
  children,
  tone = "neutral",
  className = "",
}: {
  children: ReactNode;
  tone?: keyof typeof badgeTones;
  className?: string;
}) {
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 text-xs font-semibold ${badgeTones[tone]} ${className}`}
    >
      {children}
    </span>
  );
}

/**
 * הודעה שדורשת תשומת לב. ענבר ולא אדום — האדום שמור לפעולה, ולכן אזהרה
 * שצועקת באדום הייתה מטשטשת את ההבחנה בדיוק במקום שבו היא הכי נחוצה.
 */
export function Notice({
  tone = "amber",
  title,
  children,
  action,
  alert = false,
  collapsible = false,
}: {
  /**
   * `red` רק למה שרואי ביקש לראות באדום במפורש — היום: מלצר שהגיש ולא
   * קיבל אף משמרת. כמו החריגה ממקסימום, זה חריג מתועד לחוזה האדום.
   */
  tone?: "amber" | "neutral" | "green" | "red";
  title: string;
  children?: ReactNode;
  action?: ReactNode;
  /**
   * הודעה שנולדת מפעולה שנכשלה. קורא מסך מקריא אותה מיד — בלי זה מי
   * שלא רואה את המסך לוחץ ולא שומע כלום.
   */
  alert?: boolean;
  /**
   * מקופלת לשורת כותרת שנפתחת בלחיצה.
   *
   * למסכים שמצטברות בהם כמה הודעות לפני התוכן עצמו — מסך השבוע, שבו
   * ארבע הודעות דחפו את הסידור למסך השלישי בטלפון. הכותרת (עם המספר
   * שבה) נשארת גלויה, כך ששום דבר לא מוסתר — רק הפירוט מחכה ללחיצה.
   * `<details>` ולא state: עובד גם בלי JavaScript, ונגיש מעצמו.
   */
  collapsible?: boolean;
}) {
  // פס צבע בצד ההתחלה במקום מסגרת צבעונית מסביב: ברור באותה מידה,
  // ושלוש הודעות ברצף לא הופכות לקיר צהוב
  const tones = {
    amber: "border-line border-s-amber-500 bg-amber-50",
    neutral: "border-line border-s-ink bg-surface",
    green: "border-line border-s-emerald-600 bg-emerald-50",
    red: "border-line border-s-rose-600 bg-rose-50",
  };
  if (collapsible) {
    return (
      <details className={`group border border-s-4 ${tones[tone]}`}>
        <summary className="flex min-h-14 cursor-pointer list-none items-center gap-3 px-5 py-3 [&::-webkit-details-marker]:hidden">
          <h2 className="font-bold">{title}</h2>
          <span
            aria-hidden
            className="mr-auto text-xs text-muted transition-transform duration-150 group-open:rotate-180"
          >
            ▾
          </span>
        </summary>
        <div className="px-5 pb-5">
          {action && <div className="mb-3">{action}</div>}
          {children}
        </div>
      </details>
    );
  }

  return (
    <section
      role={alert ? "alert" : undefined}
      className={`border border-s-4 p-5 ${tones[tone]}`}
    >
      <div className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-1">
        <h2 className="font-bold">{title}</h2>
        {action && <div className="mr-auto">{action}</div>}
      </div>
      {children}
    </section>
  );
}

/** מד התקדמות דק. ירוק כשהושלם — אישור שקט, בלי לתפוס תשומת לב. */
export function Meter({
  value,
  max,
  label,
}: {
  value: number;
  max: number;
  label?: ReactNode;
}) {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
  const done = max > 0 && value >= max;
  return (
    <div>
      {label && (
        <div className="mb-1 flex items-baseline justify-between gap-2 text-xs text-muted">
          {label}
        </div>
      )}
      <div
        className="h-1.5 overflow-hidden bg-paper"
        role="progressbar"
        aria-valuenow={value}
        aria-valuemin={0}
        aria-valuemax={max}
      >
        <div
          className={`h-full transition-[width] ${
            done ? "bg-emerald-500" : "bg-ink/35"
          }`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

const ROLE_INK: Record<Role, string> = {
  manager: "text-role-manager",
  bartender: "text-role-bartender",
  waiter: "text-role-waiter",
};

/**
 * נקודת התפקיד — מחליפה את צביעת השורה המלאה של הגיליון.
 *
 * SVG ולא רקע CSS בכוונה: מילוי של SVG הוא תוכן ומודפס גם כשהמשתמש כיבה
 * "גרפיקת רקע" בתיבת ההדפסה, וזה בדיוק המצב שבו צריך לזהות את התפקיד.
 */
export function RoleDot({ role, className = "" }: { role: Role; className?: string }) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 8 8"
      className={`role-dot inline-block size-2 shrink-0 ${ROLE_INK[role]} ${className}`}
    >
      <circle cx="4" cy="4" r="4" fill="currentColor" />
    </svg>
  );
}

/**
 * "דלג לתוכן" — הקישור הראשון בכל עמוד.
 *
 * נסתר עד שמגיעים אליו במקלדת. מי שמנווט בטאב לא צריך לעבור על כל
 * הכותרת בכל עמוד כדי להגיע למה שבא לראות. היעד הוא `#main`.
 */
export function SkipLink() {
  return (
    <a
      href="#main"
      className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:right-2 focus:z-50 focus:border focus:border-line focus:bg-surface focus:px-4 focus:py-2 focus:text-sm focus:font-medium"
    >
      דלג לתוכן
    </a>
  );
}

/**
 * הצהרת הנגישות, מדיניות הפרטיות והתקנון — בתחתית כל עמוד.
 *
 * גם לפני הכניסה: מי שנתקל בקושי צריך למצוא את ההצהרה ואת פרטי הקשר
 * בלי שיצטרך קודם להצליח להיכנס.
 */
export function LegalLinks({ className = "" }: { className?: string }) {
  const link = "py-2 underline-offset-2 hover:text-ink hover:underline";
  return (
    <nav
      aria-label="מידע על האתר"
      className={`no-print flex flex-wrap justify-center gap-x-5 text-xs text-muted ${className}`}
    >
      <Link href="/accessibility" className={link}>
        הצהרת נגישות
      </Link>
      <Link href="/privacy" className={link}>
        מדיניות פרטיות
      </Link>
      <Link href="/terms" className={link}>
        תקנון האתר
      </Link>
    </nav>
  );
}

/**
 * אייקון השיתוף של אפל — ריבוע פתוח למעלה וחץ שעולה ממנו.
 *
 * קודם הוא נכתב כתו של SF Symbols, שיושב באזור השימוש הפרטי של יוניקוד:
 * הוא מצויר רק עם הגופן של אפל, ובכל מקום אחר יוצא ריבוע ריק.
 * ציור במקום תו עובד בכל מכשיר ובכל גופן.
 *
 * מופיע בתוך הוראה כתובה, ולכן `aria-hidden` — המילים נושאות את המשמעות.
 */
export function ShareIcon({ className = "" }: { className?: string }) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.4}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`inline-block size-4 shrink-0 align-[-0.2em] ${className}`}
    >
      <path d="M8 2.2v8.3" />
      <path d="M5.2 5 8 2.2 10.8 5" />
      <path d="M5.2 7.2H4.3A1.6 1.6 0 0 0 2.7 8.8v3.8a1.6 1.6 0 0 0 1.6 1.6h7.4a1.6 1.6 0 0 0 1.6-1.6V8.8a1.6 1.6 0 0 0-1.6-1.6h-0.9" />
    </svg>
  );
}

/**
 * סימון "נעוץ" בסידור.
 *
 * SVG ולא אימוג׳י של נעץ: אימוג׳י נראה אחרת בכל מכשיר ובולט יותר מהשם
 * שלידו. כאן הוא בגובה האות ובצבע שמגיע מההורה.
 */
export function PinIcon({ className = "" }: { className?: string }) {
  return (
    <svg
      role="img"
      aria-label="נעוץ"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`inline-block size-3 shrink-0 align-[-0.1em] ${className}`}
    >
      <title>נעוץ</title>
      <path d="M6 2h4l-.5 4 2.5 2.5v1H4v-1L6.5 6 6 2Z" />
      <path d="M8 9.5V14" />
    </svg>
  );
}

export function EmptyState({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="border border-dashed border-ink/25 p-10 text-center">
      <p className="text-lg font-bold">{title}</p>
      {hint && <p className="mx-auto mt-1 max-w-sm text-sm text-muted">{hint}</p>}
    </div>
  );
}

/** מספרים ושעות — נשארים LTR בתוך טקסט עברי */
export function Num({ children }: { children: ReactNode }) {
  return <span className="num">{children}</span>;
}

/**
 * טווחים בתוך טקסט חופשי — "18/10–23/10", "07:00–16:00" — מבודדים ב-LTR.
 *
 * טקסט שלא נכתב כ-JSX — כותרת התראה מהמסד, הודעת אישור — לא יכול לעטוף
 * את הטווח ב-`Num` בעצמו, ובלי בידוד הטווח מתהפך ל-"16:00–07:00". כאן
 * מוצאים אותם ועוטפים. טווח שכבר מבודד בתווי יוניקוד נשאר תקין.
 */
export function isolateRanges(text: string): ReactNode[] {
  return text
    .split(/(\d{1,2}[/:]\d{1,2}–\d{1,2}[/:]\d{1,2})/)
    .map((part, i) =>
      i % 2 === 1 ? (
        <span key={i} className="num">
          {part}
        </span>
      ) : (
        part
      ),
    );
}
