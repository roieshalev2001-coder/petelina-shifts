import { redirect } from "next/navigation";
import { BandHero } from "@/components/Band";
import { Card, LegalLinks, LinkButton } from "@/components/ui";
import { signIn } from "@/lib/auth";
import { findInvite, redeemInvite } from "@/lib/invite";
import { INVITE_INVALID } from "@/lib/invite-token";
import { formatPhone } from "@/lib/phone";
import { InviteForm } from "./InviteForm";

// הכתובת אישית — לא למנועי חיפוש
export const metadata = { title: "הצטרפות · פטלינה", robots: { index: false, follow: false } };

/**
 * קישור הכניסה האישי: העובד בוחר קוד ונכנס. ראה src/lib/invite.ts.
 *
 * המפתח עובר לפעולה כפרמטר ולא דרך סגירה, ונבדק בה שוב מההתחלה: הדף רק
 * מציג, וההחלטה אם הקישור עוד תקף נעשית ברגע הכתיבה.
 */
export default async function InvitePage({ params }: PageProps<"/invite/[token]">) {
  const { token } = await params;
  const employee = await findInvite(token);

  async function join(token: string, phone: string, passcode: string) {
    "use server";
    const result = await redeemInvite({ token, phone, passcode });
    if (!result.ok) return { ok: false as const, error: result.error };
    await signIn(result.employeeId);
    // redirect זורק, ולכן הוא מחוץ לכל try — ראה דף הכניסה
    redirect("/me");
  }

  return (
    <div className="flex min-h-full flex-1 flex-col">
      <BandHero>
        <p className="mt-5 text-lg text-on-band-muted">
          {employee ? `שלום ${employee.fullName}` : "סידור המשמרות של הצוות"}
        </p>
      </BandHero>

      <main className="rise mx-auto -mt-8 w-full max-w-md flex-1 px-4 pb-10">
        {employee ? (
          <>
            <InviteForm
              token={token}
              phone={employee.phone ? formatPhone(employee.phone) : null}
              action={join}
            />
            <p className="mt-6 text-center text-sm leading-relaxed text-muted">
              אם פתחת את הקישור בוואטסאפ, כדאי לפתוח אותו בדפדפן (Safari או
              Chrome) — כך תישאר מחובר.
            </p>
          </>
        ) : (
          <Card>
            <h1 className="text-lg font-bold">הקישור לא תקף</h1>
            <p className="mt-2 text-sm text-muted">{INVITE_INVALID}</p>
            <p className="mt-2 text-sm text-muted">כבר בחרת קוד? אפשר פשוט להיכנס.</p>
            <LinkButton href="/login" className="mt-4">
              לכניסה
            </LinkButton>
          </Card>
        )}

        <LegalLinks className="mt-8" />
      </main>
    </div>
  );
}
