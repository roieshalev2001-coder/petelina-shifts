import { revalidatePath } from "next/cache";
import Link from "next/link";
import { Badge, Button, Card, EmptyState, isolateRanges, PageHeader } from "@/components/ui";
import { currentUser, requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { formatDateTime } from "@/lib/time";
import { PushToggle } from "./PushToggle";

/**
 * ההתראות של העובד.
 *
 * נשמרות תמיד, גם כשיש דחיפה לנייד — הדחיפה עלולה לא להגיע (אין הרשמה,
 * אייפון בלי הוספה למסך הבית, הרשאה שנדחתה), והמסך הזה הוא מה שתופס את
 * כל השאר. ראה src/lib/notify.ts.
 */

/** מסמן הכול כנקרא. הפעולה קוראת את הזהות מהסשן ולא מהלקוח. */
async function markAllRead() {
  "use server";
  const me = await currentUser();
  if (!me) return;
  await prisma.notification.updateMany({
    where: { employeeId: me.id, readAt: null },
    data: { readAt: new Date() },
  });
  revalidatePath("/me/notifications");
  revalidatePath("/me");
  revalidatePath("/manager");
}

export default async function NotificationsPage() {
  const user = await requireUser();

  const items = await prisma.notification.findMany({
    where: { employeeId: user.id },
    orderBy: { createdAt: "desc" },
    // תקרה: ההיסטוריה אינה מעניינת אחרי גלילה אחת, ואין טעם לשלוף הכול
    take: 50,
  });

  const unread = items.filter((n) => !n.readAt).length;

  return (
    <>
      <PageHeader
        title="התראות"
        subtitle={
          unread > 0 ? `${unread} חדשות` : "אין חדשות — הכול נקרא"
        }
      />

      {/*
        שורת פעולות אחת ולא שתי קופסאות מרחפות זו מעל זו. שתיהן פעולות
        שירות, ולכן שתיהן משניות — הפעולה הראשית של המסך היא לקרוא.

        המפתח הציבורי נשלח לדפדפן במכוון — הוא אינו סוד, וזה תפקידו.
        הפרטי נשאר בשרת ואינו נוגע ברכיב הזה.
      */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <PushToggle publicKey={process.env.VAPID_PUBLIC_KEY ?? null} />
        {unread > 0 && (
          <form action={markAllRead}>
            <Button variant="secondary" size="sm">
              סימון הכול כנקרא
            </Button>
          </form>
        )}
      </div>

      {items.length === 0 ? (
        <EmptyState
          title="אין התראות"
          hint="כאן יופיעו משמרות שמישהו מסר, ותשובות על חילופים שביקשת."
        />
      ) : (
        <>
          <Card flush>
            <ul className="divide-y divide-line">
              {items.map((n) => (
                <li key={n.id}>
                  {/*
                    שורה שנראית לחיצה — חץ בקצה — כי היא באמת מובילה למקום.
                    שלא נקראה: פס ענבר בצד ההתחלה וכותרת מודגשת.
                  */}
                  <Link
                    href={n.url}
                    className={`flex items-center gap-3 border-s-4 px-4 py-3.5 transition-colors duration-150 hover:bg-paper/60 ${
                      n.readAt ? "border-s-transparent" : "border-s-amber-500 bg-amber-50/60"
                    }`}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={n.readAt ? "font-medium" : "font-bold"}>
                          {isolateRanges(n.title)}
                        </span>
                        {!n.readAt && <Badge tone="amber">חדש</Badge>}
                      </div>
                      <p className="mt-0.5 text-sm text-muted">{isolateRanges(n.body)}</p>
                      <p className="num mt-1 text-xs text-muted">{formatDateTime(n.createdAt)}</p>
                    </div>
                    <span aria-hidden className="shrink-0 text-lg text-muted">‹</span>
                  </Link>
                </li>
              ))}
            </ul>
          </Card>
        </>
      )}
    </>
  );
}
