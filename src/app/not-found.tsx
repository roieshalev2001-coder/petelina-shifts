import { BandHeader } from "@/components/Band";
import { LinkButton } from "@/components/ui";

/**
 * כתובת שלא קיימת.
 *
 * דף ה-404 של Next לבן וללא הפס — ובאפליקציה המותקנת זה מסך שבו השעון
 * הלבן יושב על רקע בהיר. מספיק שהדף מתחיל בפס כמו כל השאר.
 */
export default function NotFound() {
  return (
    <div className="flex min-h-full flex-1 flex-col">
      <BandHeader home="/" />
      <main className="mx-auto w-full max-w-md flex-1 px-4 py-16 text-center">
        <p className="display">404</p>
        <h1 className="mt-3 text-xl font-bold">הדף הזה לא קיים</h1>
        <p className="mt-2 text-muted">ייתכן שהקישור ישן, או שהכתובת הוקלדה עם טעות.</p>
        <LinkButton href="/me" variant="primary" className="mt-6">
          לאזור האישי
        </LinkButton>
      </main>
    </div>
  );
}
