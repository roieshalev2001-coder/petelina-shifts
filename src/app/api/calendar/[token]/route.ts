import { calendarFeed } from "@/lib/calendar-feed";

/**
 * מנוי היומן האישי: /api/calendar/<token>.ics — ראה src/lib/calendar-feed.ts.
 *
 * הסיומת `.ics` רק בשביל היומנים שמזהים לפיה את סוג הקובץ, והיא מוסרת
 * לפני החיפוש. מפתח לא מוכר מחזיר 404 בלי לספר אם הוא אי פעם היה קיים.
 */
export async function GET(_request: Request, ctx: RouteContext<"/api/calendar/[token]">) {
  const { token } = await ctx.params;
  const body = await calendarFeed(token.replace(/\.ics$/, ""));
  if (body === null) return new Response("not found", { status: 404 });

  return new Response(body, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      // inline ולא attachment: היומן קורא את הכתובת, אין כאן הורדה
      "Content-Disposition": 'inline; filename="petelina-shifts.ics"',
      // שלא ייתפס בשום פרוקסי ויוגש לעובד אחר
      "Cache-Control": "no-store",
    },
  });
}
