import type { Metadata } from "next";
import { BandHero } from "@/components/Band";
import { LegalLinks, LinkButton } from "@/components/ui";
import { productionBaseUrl } from "@/lib/site-url";

/*
 * הכתובת הראשית של האתר, כתג canonical.
 *
 * האתר נגיש גם בכתובת קבועה לכל פריסה, וזה מצהיר איזו מהן היא האתר.
 * ובעיקר: זו אותה פונקציה שקובעת את הקישור בהודעות לעובדים, וזה המקום
 * היחיד שאפשר לראות מבחוץ, בלי להתחבר, מה היא מחזירה בפועל בייצור.
 *
 * מחוץ לייצור אין כתובת ולכן אין תג — קישור יחסי בלי metadataBase נכשל בבנייה.
 */
const base = productionBaseUrl();
export const metadata: Metadata = base
  ? { metadataBase: new URL(base), alternates: { canonical: "/" } }
  : {};

export default function Home() {
  return (
    <div className="flex min-h-full flex-1 flex-col">
      <BandHero>
        {/* השם הוא הכותרת. "סידור משמרות" לבדו היה יכול לשבת על כל אתר */}
        <p className="mt-5 text-lg text-on-band-muted">סידור המשמרות של הצוות</p>
      </BandHero>

      <main className="rise mx-auto -mt-8 w-full max-w-md flex-1 px-4 pb-10">
        <div className="border border-line bg-surface p-6">
          <p className="leading-relaxed">
            כניסה עם מספר הטלפון והקוד האישי שקיבלת מהמנהל. אותה כניסה לכולם —
            עובדים רואים את המשמרות שלהם ומגישים זמינות, ומנהלים גם עורכים את
            הסידור.
          </p>
          <LinkButton href="/login" variant="primary" block className="mt-5">
            כניסה
          </LinkButton>
        </div>

        <LegalLinks className="mt-10" />
      </main>
    </div>
  );
}
