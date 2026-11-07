import type { Metadata, Viewport } from "next";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { Assistant } from "next/font/google";
import "./globals.css";

/* אלמוני DL של פטלינה הוא גופן בתשלום. Assistant הוא ההתאמה הקרובה —
   אותו סנס-סריף עברי גיאומטרי — וזמין ב-Google Fonts. */
const assistant = Assistant({
  variable: "--font-assistant",
  subsets: ["hebrew", "latin"],
});

/**
 * `viewportFit: "cover"` הוא התנאי ל-safe-area.
 *
 * בלעדיו `env(safe-area-inset-bottom)` מחזיר אפס גם באייפון עם פס בית,
 * וכל מה שדביק בתחתית יושב מתחתיו. האתר מותקן במסך הבית, ולכן זה לא
 * מקרה קצה אלא מצב ברירת המחדל של רוב המשתמשים.
 *
 * `maximumScale` **אינו** מוגדר בכוונה: נעילת זום חוסמת הגדלה למי שצריך
 * אותה. הזום המציק ב-iOS נפתר בגופן של 16px בשדות, לא באיסור.
 */
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  /*
   * צבע הפס, לא צבע המותג.
   *
   * שורת המצב והסרגל של הדפדפן לוקחים את הצבע מכאן. כשהוא היה אדום
   * והכותרת לבנה, נוצר פס אדום מנותק מעל האתר. עכשיו שורת המצב נמשכת
   * לתוך הפס השחור, וזה מה שגורם לאתר להרגיש מותקן. חייב להיות זהה
   * ל-`--band` ב-globals.css.
   */
  themeColor: "#1a1614",
};

export const metadata: Metadata = {
  title: "פטלינה · סידור משמרות",
  description: "הגשת זמינות ובניית סידור עבודה שבועי",
  /*
   * ה-manifest הוא מה שהופך את האתר למשהו שאפשר להוסיף למסך הבית —
   * ובאייפון זו הדרך היחידה לקבל התראות דחיפה. ראה PushToggle.
   */
  manifest: "/manifest.webmanifest",
  /*
   * `black-translucent`: באפליקציה המותקנת שורת המצב שקופה והאתר מצויר
   * מתחתיה — כך הפס השחור ממשיך עד הקצה העליון של המסך, כמו באפליקציה.
   * זה עובד רק כי כל מסך מתחיל בפס עם `pt-safe` (ראה src/components/Band.tsx):
   * מסך שיתחיל ברקע קרם ישים את השעון הלבן על רקע בהיר.
   */
  appleWebApp: { capable: true, title: "פטלינה", statusBarStyle: "black-translucent" },
  /*
   * האייקונים מגיעים מהקבצים favicon.ico, icon.png ו-apple-icon.png
   * שבתיקייה הזו — הפטל מהאתר של פטלינה. קובץ עדיף על השדה הזה, ולכן
   * `icons` אינו מוגדר כאן.
   */
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="he"
      dir="rtl"
      className={`${assistant.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        {children}
        {/*
          מונה צפיות של Vercel. בלי עוגיות ובלי זיהוי אישי — מועד, כתובת
          העמוד, דפדפן, מכשיר ומדינה, והמבקר מזוהה בגיבוב שנמחק אחרי 24
          שעות. מתואר במדיניות הפרטיות תחת "סטטיסטיקת שימוש", ואם הוא יורד
          מכאן — גם הסעיף שם צריך לרדת.

          הכתובות באתר אינן מכילות שמות או פרטים אישיים, ולכן אין צורך
          בסינון של כתובות לפני השליחה.
        */}
        <Analytics />
        {/*
          מדידת זמני טעינה אצל המשתמשים עצמם. כל המדידות שלנו היו מבחוץ
          וממחשב מהיר; זה הדבר היחיד שמודד טלפון של עובד בחיבור סלולרי.

          אותו דפוס כמו המונה: בלי עוגיות ובלי זיהוי, ומתואר במדיניות
          תחת "סטטיסטיקת שימוש".
        */}
        <SpeedInsights />
      </body>
    </html>
  );
}
