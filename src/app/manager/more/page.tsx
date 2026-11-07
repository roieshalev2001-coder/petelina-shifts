import Link from "next/link";
import { redirect } from "next/navigation";
import { Badge, Card, PageHeader } from "@/components/ui";
import { requireManager, signOut } from "@/lib/auth";
import { unreadCount } from "@/lib/notify";

/**
 * "עוד" — המסכים שלא נכנסו לסרגל התחתון.
 *
 * לסרגל יש מקום לארבע לשוניות בנוחות, ולניהול יש שישה מסכים. ארבעת
 * הראשונים הם מה שנוגעים בו יומיום; השאר — הגבלות, תבנית והגדרות —
 * נקבעים פעם ומשתנים לעיתים רחוקות, ולכן הם כאן.
 *
 * במסך רחב הסרגל מוסתר וכל הפריטים ממילא בכותרת, ולכן המסך הזה קיים
 * בעיקר בשביל הטלפון — אבל הוא עובד בשני המצבים.
 */
export const metadata = { title: "עוד · ניהול" };

const ITEMS = [
  { href: "/manager/history", label: "סידורי עבר", hint: "סידורים ישנים, ומה שהוסר" },
  { href: "/manager/constraints", label: "הגבלות", hint: "מי לא עובד עם מי" },
  { href: "/manager/template", label: "תבנית שבועית", hint: "המשבצות הקבועות" },
  { href: "/manager/settings", label: "הגדרות", hint: "קישורי קבוצות וואטסאפ" },
  { href: "/me", label: "האזור שלי", hint: "המשמרות וההגשה שלך" },
];

export default async function MorePage() {
  const me = await requireManager();

  /*
   * ההתראות מגיעות לכאן ולא ללשונית.
   *
   * הפעמון שבכותרת מוסתר בטלפון, ובסרגל הניהול אין מקום ללשונית חמישית.
   * בלי הפריט הזה המסלול היחיד היה "עוד ← האזור שלי ← התראות", שלושה
   * מסכים — ומנהל מקבל התראות על כל חילוף שממתין להכרעה שלו.
   */
  const unread = await unreadCount(me.id);

  async function logout() {
    "use server";
    await signOut();
    redirect("/login");
  }

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title="עוד" />

      <Card flush>
        <ul className="divide-y divide-line">
          <li>
            <Link
              href="/me/notifications"
              className="flex min-h-14 items-center gap-3 px-4 py-3 transition-[background-color,transform] duration-150 ease-[var(--ease-out)] hover:bg-paper active:scale-[0.99]"
            >
              <span className="min-w-0">
                <span className="flex items-center gap-2 font-medium">
                  התראות
                  {unread > 0 && (
                    <Badge tone="amber">{unread > 9 ? "9+" : unread}</Badge>
                  )}
                </span>
                <span className="block text-xs text-muted">
                  חילופים שממתינים להכרעה, ועדכונים
                </span>
              </span>
              <span aria-hidden className="mr-auto text-muted">
                ‹
              </span>
            </Link>
          </li>

          {ITEMS.map((item) => (
            <li key={item.href}>
              {/* min-h-14 — יעד מגע נדיב, כי זו רשימה שנוגעים בה באגודל */}
              <Link
                href={item.href}
                className="flex min-h-14 items-center gap-3 px-4 py-3 transition-[background-color,transform] duration-150 ease-[var(--ease-out)] hover:bg-paper active:scale-[0.99]"
              >
                <span className="min-w-0">
                  <span className="block font-medium">{item.label}</span>
                  <span className="block text-xs text-muted">{item.hint}</span>
                </span>
                <span aria-hidden className="mr-auto text-muted">
                  ‹
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </Card>

      <form action={logout} className="mt-4">
        <button className="min-h-11 w-full border border-line bg-surface px-4 text-sm font-medium text-muted transition hover:bg-paper hover:text-ink">
          יציאה
        </button>
      </form>
    </div>
  );
}
