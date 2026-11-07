import Link from "next/link";
import { redirect } from "next/navigation";
import { currentUser, signOut } from "@/lib/auth";
import { BandHeader, bandLink } from "@/components/Band";
import { Bell } from "@/components/Bell";
import { TabBar, type Tab } from "@/components/TabBar";
import { LegalLinks, SkipLink } from "@/components/ui";
import { unreadCount } from "@/lib/notify";

/**
 * הניווט של האזור האישי.
 *
 * בטלפון — סרגל לשוניות בתחתית, בהישג אגודל. בדסקטופ — הכותרת מספיקה,
 * ולכן הסרגל מוסתר שם והפעמון חוזר אליה.
 *
 * הכותרת התרזתה בכוונה: קודם היו בה לוגו, שם, רשימת תפקידים, פעמון,
 * קישור ניהול ויציאה, והיא נשברה לשלוש שורות בטלפון. התפקידים ירדו —
 * הם קישוט, והעובד יודע מה תפקידו.
 */
export default async function EmployeeLayout({
  children,
}: LayoutProps<"/me">) {
  /*
   * ה-layout אינו גבול אבטחה — ההפניה יושבת ב-requireUser שבכל דף.
   * כאן רק נמנע רינדור של כרום עם שם ריק.
   */
  const employee = await currentUser();
  if (!employee) return <>{children}</>;

  // currentUser כבר במטמון מהדף, ולכן זו שאילתה אחת נוספת ולא שתיים
  const unread = await unreadCount(employee.id);

  async function logout() {
    "use server";
    await signOut();
    redirect("/login");
  }

  const tabs: Tab[] = [
    { href: "/me", label: "בית", icon: "home" },
    { href: "/me/submit", label: "הגשה", icon: "submit" },
    { href: "/me/fridays", label: "שישי", icon: "calendar" },
    { href: "/me/notifications", label: "התראות", icon: "bell", dot: unread > 0 },
  ];

  return (
    <div className="flex min-h-full flex-1 flex-col">
      <SkipLink />
      <BandHeader home="/me">
        {/* השם מופיע בגלילה כשיש גיבור בעמוד — ראה .band-name ב-globals.css */}
        <span className="band-name mr-auto truncate text-sm font-semibold">
          {employee.fullName}
        </span>

        {/* בטלפון ההתראות הן לשונית, ולכן הפעמון מיותר וגוזל רוחב */}
        <span className="hidden md:inline">
          <Bell unread={unread} />
        </span>

        {/*
          מנהל שהוא גם עובד — כמו רואי, שמשובץ כברמן — צריך דרך חזרה
          לאזור הניהול. בלי הקישור הזה האזור האישי נראה כאילו ההרשאה
          אינה קיימת, והדרך היחידה הייתה להקליד את הכתובת ידנית.
        */}
        {employee.canManage && (
          <Link href="/manager" className={bandLink}>
            ניהול
          </Link>
        )}

        <form action={logout} className="shrink-0">
          <button className={bandLink}>יציאה</button>
        </form>
      </BandHeader>

      <main
        id="main"
        tabIndex={-1}
        className="mx-auto w-full max-w-3xl flex-1 px-4 py-5 focus:outline-none"
      >
        {children}
        {/* בתוך main ולפני הסרגל, כדי שהסרגל המקובע לא יסתיר אותם */}
        <LegalLinks className="mt-10" />
      </main>

      {/*
        בהגשה יש סרגל פעולה דביק משלה, ולכן הסרגל הזה מתחבא — אבל רק כשהטופס
        באמת שם. הגשה אחרי המועד היא מסך קריאה בלבד בלי סרגל פעולה, וקודם
        הסרגל נעלם גם שם והשאיר מבוי סתום. ההסתרה עכשיו ב-CSS לפי נוכחות
        `.submit-bar` (ראה globals.css), ולא לפי הכתובת.
      */}
      <TabBar tabs={tabs} root="/me" />
    </div>
  );
}
