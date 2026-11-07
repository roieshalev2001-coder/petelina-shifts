import { revalidatePath } from "next/cache";
import Link from "next/link";
import { Badge, Card, EmptyState, PageHeader } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { ROLE_LABEL_PLURAL } from "@/lib/domain";
import { publishedRotation } from "@/lib/friday-plan";
import {
  FridaySwapError,
  cancelFridaySwap,
  claimFriday,
  loadFridaySwaps,
  myOfferableFridays,
  offerFriday,
} from "@/lib/friday-swap-board";
import {
  CLAIM_BLOCK_LABEL,
  CANCEL_BLOCK_LABEL,
  OFFER_BLOCK_LABEL,
} from "@/lib/friday-swaps";
import { nextFridays } from "@/lib/fridays";
import { formatDayMonth, fromDateInputValue, toDateInputValue } from "@/lib/time";
import { FridaySwaps } from "./FridaySwaps";

/**
 * הודעות השגיאה מגיעות מהכללים הטהורים כקודים, ומתורגמות כאן.
 *
 * קוד שאינו מוכר מוחזר כמו שהוא ולא נבלע: עדיף טקסט מוזר על פני
 * "משהו השתבש" שאינו אומר דבר.
 */
function labelFor(message: string): string {
  return (
    OFFER_BLOCK_LABEL[message as keyof typeof OFFER_BLOCK_LABEL] ??
    CLAIM_BLOCK_LABEL[message as keyof typeof CLAIM_BLOCK_LABEL] ??
    CANCEL_BLOCK_LABEL[message as keyof typeof CANCEL_BLOCK_LABEL] ??
    message
  );
}

/** עוטף פעולה כך שכשל מוצג לעובד במקום להפיל את המסך */
async function guard(fn: () => Promise<void>): Promise<{ error?: string }> {
  try {
    await fn();
    revalidatePath("/me/fridays");
    return {};
  } catch (e) {
    if (e instanceof FridaySwapError) return { error: labelFor(e.message) };
    throw e;
  }
}

async function offer(planId: string, mode: string) {
  "use server";
  const me = await requireUser();
  return guard(() => offerFriday({ planId, employeeId: me.id, mode }));
}

async function cancel(offerId: string) {
  "use server";
  const me = await requireUser();
  return guard(() => cancelFridaySwap({ offerId, employeeId: me.id }));
}

async function claim(offerId: string, inReturnPlanId: string | null) {
  "use server";
  const me = await requireUser();
  return guard(() => claimFriday({ offerId, employeeId: me.id, inReturnPlanId }));
}

/**
 * סבב שישי, כפי שהעובד רואה אותו.
 *
 * שישי נקבע מראש ולא נגזר מההגשות, ולכן הוא צריך להיות גלוי הרבה לפני
 * שהשבוע נפתח — אחרת אין שום דרך לדעת מתי אתה עובד, ואין זמן לסדר
 * החלפה. זה כל הטעם בפרסום.
 *
 * מוצג הסבב **המלא** ולא רק המשמרות של העובד: בלי לראות מי עוד עובד
 * באותו שישי, אי אפשר לפנות למישהו ולהציע החלפה.
 */
const HORIZON = 8;

export default async function MyFridaysPage() {
  const me = await requireUser();
  const fridays = nextFridays(HORIZON);
  const [rotation, swaps, offerable] = await Promise.all([
    publishedRotation(fridays),
    loadFridaySwaps(),
    myOfferableFridays({ employeeId: me.id, dates: fridays }),
  ]);

  /*
   * הפורמט נגזר כאן ולא בדפדפן: השעון של המכשיר יכול להיות בכל אזור זמן,
   * והתאריך חייב להיות זה של פטלינה.
   */
  const format: Record<string, string> = {};
  for (const f of fridays) {
    format[toDateInputValue(f)] = formatDayMonth(f);
  }

  const byDate = new Map<string, typeof rotation>();
  for (const r of rotation) {
    if (!byDate.has(r.date)) byDate.set(r.date, []);
    byDate.get(r.date)!.push(r);
  }

  const mine = rotation.filter((r) => r.employeeId === me.id);

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader
        title="סבב שישי"
        subtitle="שישי נקבע לפי הסבב ולא לפי ההגשה. הסדר בכל יום הוא סדר ההגעה."
      />

      {rotation.length === 0 ? (
        <EmptyState
          title="הסבב עוד לא פורסם"
          hint="כשהמנהל יפרסם אותו תקבל התראה, ותראה כאן באילו שישיים אתה עובד."
        />
      ) : (
        <>
          <Card className="mb-4">
            <h2 className="mb-2 font-semibold">השישיים שלי</h2>
            {mine.length === 0 ? (
              <p className="text-sm text-muted">
                אינך משובץ באף אחד מהשישיים שפורסמו.
              </p>
            ) : (
              <ul className="space-y-1.5 text-sm">
                {mine.map((r) => (
                  <li key={r.date} className="flex flex-wrap items-center gap-2">
                    <span className="num font-semibold">
                      {formatDayMonth(fromDateInputValue(r.date))}
                    </span>
                    {r.startTime && <span className="num text-muted">{r.startTime}</span>}
                    {r.isClosing && <Badge tone="amber">סגירה</Badge>}
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-2 text-sm text-muted">
              אם אחד מהם לא מתאים — אפשר למסור אותו או להחליף עם מישהו
              אחר מ<Link href="/me" className="underline">האזור האישי</Link>.
            </p>
          </Card>

          <FridaySwaps
            myFridays={offerable}
            openOffers={swaps.open.filter((o) => o.offeredById !== me.id)}
            myOffers={swaps.open.filter((o) => o.offeredById === me.id)}
            actions={{ offer, cancel, claim }}
            format={format}
          />

          <div className="mt-4 space-y-3">
            {[...byDate.entries()].map(([date, rows]) => (
              <Card key={date}>
                <h2 className="mb-2 font-semibold">
                  שישי <span className="num">{formatDayMonth(fromDateInputValue(date))}</span>
                </h2>
                <ul className="space-y-1 text-sm">
                  {rows.map((r, i) => (
                    <li
                      key={i}
                      className={`flex flex-wrap items-center gap-2 ${
                        r.employeeId === me.id ? "font-semibold" : ""
                      }`}
                    >
                      <span className="num w-12 text-muted">{r.startTime ?? "—"}</span>
                      <span>{r.fullName}</span>
                      <span className="text-xs text-muted">
                        {ROLE_LABEL_PLURAL[r.role as keyof typeof ROLE_LABEL_PLURAL]}
                      </span>
                      {r.isClosing && <Badge tone="amber">סגירה</Badge>}
                    </li>
                  ))}
                </ul>
              </Card>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
