import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";

/**
 * הפס — הכותרת השחורה שבראש כל מסך.
 *
 * זו הזהות של האתר: הפטל, השם, ושורת המצב של הטלפון שנמשכת לתוכו
 * (`themeColor` ב-src/app/layout.tsx זהה ל-`--band`). היא דביקה, ומעט
 * שקופה עם טשטוש — מה שנגלל מתחתיה נראה דרכה כמו דרך זכוכית חלבית,
 * ולכן היא מרגישה שכבה מעל התוכן ולא רצועה שגוזלת מקום.
 *
 * `pt-safe` הוא חובה: בלעדיו התוכן של הפס עולה מתחת לשעון ולסוללה.
 */
export function BandHeader({
  home,
  wide = false,
  children,
}: {
  /** לאן הלוגו מוביל */
  home: string;
  /** רוחב התוכן — הניהול רחב יותר כי הסידור הוא טבלה */
  wide?: boolean;
  children?: ReactNode;
}) {
  return (
    <header className="band-glass pt-safe no-print sticky top-0 z-30 bg-band/[0.92] text-on-band backdrop-blur-md">
      <div
        className={`mx-auto flex items-center gap-x-4 gap-y-2 px-4 py-2.5 ${
          wide ? "max-w-7xl" : "max-w-3xl"
        }`}
      >
        <Wordmark href={home} />
        {children}
      </div>
    </header>
  );
}

/**
 * הפטל והשם.
 *
 * הפטל על אריח לבן מרובע, כמו אייקון של אפליקציה — בכוונה. הציור המקורי
 * (GIF של 139×105 מהאתר של פטלינה) הוחלק על רקע לבן, ולכן על שחור היו
 * נשארות לו שוליים בהירות סביב הקצוות. על לבן הוא נראה בדיוק כמו שצויר.
 *
 * השם בקרם ולא באדום: אדום המותג על הפס יוצא 3.28:1, מתחת לסף הקריאות
 * לטקסט. האדום מגיע מהפטל עצמו, שהוא תמונה ולא טקסט.
 */
export function Wordmark({ href, large = false }: { href: string; large?: boolean }) {
  return (
    <Link href={href} className="flex shrink-0 items-center gap-2.5">
      <span
        className={`grid shrink-0 place-items-center bg-white ${
          large ? "size-16 p-1.5" : "size-8 p-0.5"
        }`}
      >
        <Image
          src={large ? "/icon-512.png" : "/icon-192.png"}
          alt=""
          width={large ? 52 : 28}
          height={large ? 52 : 28}
          priority
        />
      </span>
      <span
        className={`font-extrabold tracking-[-0.02em] ${
          large ? "text-[2.75rem] leading-none" : "text-lg"
        }`}
      >
        פטלינה
      </span>
    </Link>
  );
}

/** קישור בתוך הפס — מעומעם, ומתבהר בריחוף או כשהוא המסך הנוכחי */
export const bandLink =
  "shrink-0 px-2 py-1.5 text-sm font-medium text-on-band-muted transition-colors duration-150 hover:text-on-band";

/**
 * פס פתיחה גדול — למסכים שלפני הכניסה (כניסה, דף הבית).
 *
 * אותו פס כמו בראש כל מסך, רק בגודל של שער: הפטל והשם גדולים, ומתחתיו
 * שורה אחת שאומרת מה זה. הכרטיס שמתחת נמשך לתוך הפס (`-mt` בעמוד),
 * וכך שני החלקים נקראים כיחידה אחת ולא כשתי רצועות.
 */
export function BandHero({ children }: { children?: ReactNode }) {
  return (
    <section className="pt-safe bg-band text-on-band">
      <div className="rise mx-auto max-w-md px-6 pt-14 pb-16">
        <Wordmark href="/" large />
        {children}
      </div>
    </section>
  );
}
