import Link from "next/link";
import { redirect } from "next/navigation";
import { BandHeader, bandLink } from "@/components/Band";
import { Bell } from "@/components/Bell";
import { currentUser, signOut } from "@/lib/auth";
import { unreadCount } from "@/lib/notify";
import { TabBar, type Tab } from "@/components/TabBar";
import { LegalLinks, SkipLink } from "@/components/ui";
import { ManagerNav } from "./ManagerNav";

export default async function ManagerLayout({
  children,
}: LayoutProps<"/manager">) {
  /*
   * ה-layout הוא כרום בלבד ולא גבול אבטחה — ההפניה יושבת ב-requireManager
   * שבכל דף ובכל פעולה. כאן רק נמנעת הצגת סרגל ניהול למי שאינו מנהל,
   * למשל בשבריר השנייה שלפני שההפניה נכנסת לתוקף.
   */
  const user = await currentUser();
  if (!user?.canManage) return <>{children}</>;

  const unread = await unreadCount(user.id);

  async function logout() {
    "use server";
    await signOut();
    redirect("/login");
  }

  /*
   * ארבע לשוניות, ולא שש. הגבלות, תבנית והגדרות נקבעות פעם ומשתנות
   * לעיתים רחוקות, ולכן הן ב"עוד" — סרגל עמוס הוא סרגל שקשה לפגוע בו.
   */
  const tabs: Tab[] = [
    { href: "/manager", label: "סידור", icon: "grid" },
    { href: "/manager/employees", label: "עובדים", icon: "people" },
    { href: "/manager/fridays", label: "שישי", icon: "calendar" },
    { href: "/manager/more", label: "עוד", icon: "more" },
  ];

  return (
    <div className="flex min-h-full flex-1 flex-col">
      <SkipLink />
      <BandHeader home="/manager" wide>
        <ManagerNav />
        <span className="mr-auto truncate text-sm text-on-band-muted">
          {user.fullName}
        </span>

        {/* בטלפון ההתראות מגיעות דרך האזור האישי, וב"עוד" יש יציאה */}
        <span className="hidden md:inline">
          <Bell unread={unread} />
        </span>

        {/* הכיוון ההפוך: מנהל שמשובץ במשמרות מגיש ורואה אותן כמו כולם */}
        <Link
          href="/me"
          className="hidden border border-on-band/35 px-3 py-1.5 text-sm font-medium text-on-band transition-colors duration-150 hover:border-on-band/70 md:inline-flex"
        >
          האזור שלי
        </Link>
        <form action={logout} className="hidden md:block">
          <button className={bandLink}>יציאה</button>
        </form>
      </BandHeader>
      <main
        id="main"
        tabIndex={-1}
        className="mx-auto w-full max-w-7xl flex-1 p-4 focus:outline-none sm:p-6"
      >
        {children}
        <LegalLinks className="mt-10" />
      </main>

      <TabBar tabs={tabs} root="/manager" />
    </div>
  );
}
