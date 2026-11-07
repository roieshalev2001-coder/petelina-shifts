/**
 * שלד טעינה למסכי המנהל. ראה ההערה ב-src/app/e/[token]/loading.tsx —
 * לא מכסה את ההתעוררות הראשונה, מכסה את כל השאר.
 */
export default function Loading() {
  return (
    <div aria-busy="true" aria-label="טוען">
      <div className="mb-6">
        <div className="h-8 w-56 animate-pulse bg-surface" />
        <div className="mt-2 h-4 w-80 animate-pulse bg-surface" />
      </div>

      <div className="space-y-4">
        {[0, 1, 2].map((i) => (
          <div key={i} className="border border-line bg-surface p-5">
            <div className="h-5 w-40 animate-pulse bg-paper" />
            <div className="mt-3 h-1.5 w-full animate-pulse bg-paper" />
          </div>
        ))}
      </div>
    </div>
  );
}
