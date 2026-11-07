/**
 * שלד טעינה למסך השבוע.
 *
 * זה המסך הכבד ביותר באזור הניהול — שבוע שלם, 93 משבצות, ההגשות והמסירות
 * — והוא היה היחיד בלי שלד. בלעדיו לחיצה על שבוע משאירה את המסך הקודם
 * על המקום עד שהשרת עונה, וזה נראה כמו תקיעה ולא כמו טעינה.
 *
 * הרוחב תואם לטבלת הסידור (`min-w-[60rem]`) כדי שהמעבר לתוכן האמיתי לא
 * יקפיץ את הפריסה.
 */
export default function Loading() {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="טוען את השבוע">
      <div>
        <div className="h-7 w-64 animate-pulse bg-paper" />
        <div className="mt-2 h-4 w-80 animate-pulse bg-paper" />
      </div>

      <div className="flex flex-wrap gap-2">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-11 w-32 animate-pulse bg-paper" />
        ))}
      </div>

      <div className="overflow-x-auto border border-line bg-surface">
        <div className="min-w-[60rem]">
          <div className="flex gap-px border-b border-line bg-paper/60 p-2">
            {[0, 1, 2, 3, 4, 5, 6].map((i) => (
              <div key={i} className="h-8 flex-1 animate-pulse bg-paper" />
            ))}
          </div>
          {[0, 1, 2, 3, 4, 5, 6, 7].map((row) => (
            <div key={row} className="flex gap-px border-b border-line p-2 last:border-0">
              {[0, 1, 2, 3, 4, 5, 6].map((col) => (
                <div key={col} className="h-9 flex-1 animate-pulse bg-paper/70" />
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
