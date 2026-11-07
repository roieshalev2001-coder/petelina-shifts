import Link from "next/link";
import { LinkButton } from "@/components/ui";

/**
 * הגיבור של בית העובד — הדבר האחד שחשוב עכשיו, בגדול, על הפס השחור.
 *
 * קודם הבית היה שלושה כרטיסים זהים עם שלושה כפתורים אדומים זהים, ושום
 * דבר לא אמר מה דחוף. כאן יש סדר עדיפות אחד, והוא נבחר בעמוד:
 * הגשה שעוד לא נשלחה → המשמרת הבאה → הגשה שנשלחה → שקט.
 *
 * רכיב תצוגה טהור — בלי מסד ובלי שעון — כדי שמסך התצוגה (/preview) יוכל
 * להריץ אותו עם הנתונים הכי גרועים.
 *
 * הפס נמשך לרוחב המסך כולו (`mx-[calc(50%-50vw)]`) גם כשהתוכן צר, אחרת
 * במחשב הוא היה רצועה שחורה באמצע. התוכן שבתוכו נמוג בגלילה (`hero-fade`),
 * הרקע לא — כך הוא נגלל מתחת לפס הדביק בלי שהקרם ייחשף.
 */
export type HeroFocus =
  | {
      kind: "deadline";
      weekId: string;
      weekLabel: string;
      /** "2 ימים", "9 שעות", "פחות משעה" */
      amount: string;
      unit: string;
    }
  | {
      kind: "next-shift";
      /** "היום", "מחר", או שם היום */
      day: string;
      date: string;
      hours: string;
      /** הגשה שכבר נשלחה לשבוע פתוח — שורה משנית מתחת */
      submitted?: { weekId: string; weekLabel: string };
    }
  | { kind: "submitted"; weekId: string; weekLabel: string; marks: number }
  | { kind: "calm" };

export function Hero({
  greeting,
  firstName,
  focus,
  tucked = true,
}: {
  greeting: string;
  firstName: string;
  focus: HeroFocus;
  /** נמשך אל מתחת לפס. כבוי רק במסך התצוגה, שבו מוצגים כמה גיבורים ברצף */
  tucked?: boolean;
}) {
  return (
    /*
     * הגיבור נמשך מעלה אל מתחת לפס הדביק (`--header-h`, ראה globals.css):
     * הפס חצי-שקוף, ומעל רקע קרם הוא יוצא בגוון מעט בהיר יותר מהגיבור,
     * כך שנוצר תפר. כשהגיבור יושב מתחתיו — שחור על שחור, בלי תפר. בגלילה
     * התוכן הבהיר עובר מתחת לפס ומבצבץ דרך הטשטוש.
     */
    <section
      className="mx-[calc(50%-50vw)] mb-7 bg-band text-on-band"
      style={
        tucked
          ? {
              marginTop: "calc(-1 * (var(--header-h) + 1.25rem))",
              paddingTop: "var(--header-h)",
            }
          : undefined
      }
    >
      {/* הנמוג בגלילה רק לגיבור שבראש הבית — הטווח שלו נמדד מראש העמוד */}
      <div className={`${tucked ? "hero-fade" : ""} rise mx-auto max-w-3xl px-4 pt-5 pb-9`}>
        <p className="text-lg text-on-band-muted">
          {greeting}, <span className="font-bold text-on-band">{firstName}</span>
        </p>

        {focus.kind === "deadline" && (
          <>
            <p className="display mt-4">
              {/* המספר והיחידה כשורה אחת גדולה — זה מה שהעין צריכה לתפוס */}
              {/^\d/.test(focus.amount) ? <span className="num">{focus.amount}</span> : focus.amount}{" "}
              {focus.unit}
            </p>
            <p className="mt-2 text-lg">
              להגשת שבוע <span className="num">{focus.weekLabel}</span>
            </p>
            <LinkButton
              href={`/me/submit?week=${focus.weekId}`}
              variant="primary"
              className="mt-6 w-full sm:w-auto"
            >
              למילוי ההגשה
            </LinkButton>
          </>
        )}

        {focus.kind === "next-shift" && (
          <>
            <p className="mt-4 text-on-band-muted">המשמרת הבאה שלך</p>
            <p className="display mt-1">{focus.day}</p>
            <p className="mt-2 text-lg">
              <span className="num">{focus.hours}</span>
              <span className="text-on-band-muted">
                {" · "}
                <span className="num">{focus.date}</span>
              </span>
            </p>
            {focus.submitted && (
              <p className="mt-5 text-sm text-on-band-muted">
                ההגשה לשבוע <span className="num">{focus.submitted.weekLabel}</span>{" "}
                נשלחה ✓ ·{" "}
                <Link
                  href={`/me/submit?week=${focus.submitted.weekId}`}
                  className="font-semibold text-on-band underline underline-offset-4"
                >
                  עדכון
                </Link>
              </p>
            )}
          </>
        )}

        {focus.kind === "submitted" && (
          <>
            <p className="display mt-4">נשלח ✓</p>
            <p className="mt-2 text-lg">
              ההגשה לשבוע <span className="num">{focus.weekLabel}</span>
              <span className="text-on-band-muted">
                {" · "}
                {focus.marks === 1 ? "משמרת אחת" : <><span className="num">{focus.marks}</span> משמרות</>}
              </span>
            </p>
            <LinkButton
              href={`/me/submit?week=${focus.weekId}`}
              variant="secondary"
              className="mt-6 w-full border-on-band/40 bg-transparent text-on-band hover:bg-on-band/10 sm:w-auto"
            >
              עדכון ההגשה
            </LinkButton>
          </>
        )}

        {focus.kind === "calm" && (
          <>
            <p className="display mt-4">אין הגשה פתוחה</p>
            <p className="mt-2 text-lg text-on-band-muted">
              כשהמנהל יפתח שבוע — תקבל הודעה.
            </p>
          </>
        )}
      </div>
    </section>
  );
}
