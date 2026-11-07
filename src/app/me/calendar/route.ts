import { currentUser } from "@/lib/auth";
import { buildICS } from "@/lib/calendar";
import { prisma } from "@/lib/db";
import { loadShiftEvents } from "@/lib/swap-board";

/**
 * המשמרות של העובד כקובץ יומן להורדה.
 *
 * הראוט יושב במקטע משלו ולא ב-/me, כי `route.ts` אינו יכול לחיות באותו
 * מקטע שבו יש `page.tsx`.
 *
 * מאומת בסשן ככל שאר המסכים. הכתובת קבועה וזהה לכולם, ולכן היא לבדה אינה
 * מזהה איש: בלי עוגייה תקפה היא מחזירה 401.
 */
export async function GET() {
  const employee = await currentUser();
  if (!employee || employee.mustChangePasscode) {
    return new Response("unauthorized", { status: 401 });
  }

  const week = await prisma.week.findFirst({
    where: { status: "published", deletedAt: null },
    orderBy: { weekStart: "desc" },
    select: { id: true },
  });
  if (!week) return new Response("not found", { status: 404 });

  const events = await loadShiftEvents({
    weekId: week.id,
    employeeId: employee.id,
  });

  return new Response(buildICS(events), {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": 'attachment; filename="petelina-shifts.ics"',
      // שלא ייתפס בשום פרוקסי ויוגש לעובד אחר
      "Cache-Control": "no-store",
    },
  });
}
