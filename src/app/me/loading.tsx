/**
 * שלד טעינה למסכי העובד.
 *
 * לא עוזר לבקשה הראשונה כשהשרת ישן — אז אין שרת שיגיש אותו. עוזר לכל
 * ניווט אחרי שהוא כבר ער, וזה רוב הניווטים בפועל.
 */
export default function Loading() {
  return (
    <div className="space-y-5" aria-busy="true" aria-label="טוען">
      <div className="border border-line bg-surface p-5">
        <div className="h-3 w-24 animate-pulse bg-paper" />
        <div className="mt-3 h-6 w-40 animate-pulse bg-paper" />
        <div className="mt-3 h-4 w-56 animate-pulse bg-paper" />
        <div className="mt-5 h-11 w-full animate-pulse bg-paper sm:w-44" />
      </div>

      <div className="border border-line bg-surface">
        <div className="border-b border-line px-5 py-4">
          <div className="h-5 w-48 animate-pulse bg-paper" />
        </div>
        {[0, 1, 2].map((i) => (
          <div key={i} className="flex items-center gap-3 border-b border-line px-5 py-4 last:border-0">
            <div className="h-4 w-14 animate-pulse bg-paper" />
            <div className="h-5 w-28 animate-pulse bg-paper" />
          </div>
        ))}
      </div>
    </div>
  );
}
