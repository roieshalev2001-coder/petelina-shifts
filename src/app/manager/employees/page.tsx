import { headers } from "next/headers";
import { resolveBaseUrl } from "@/lib/site-url";
import { PageHeader } from "@/components/ui";
import { requireManager } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { lockStatus } from "@/lib/lockout";
import { openInviteUntil } from "@/lib/invite-token";
import {
  createEmployee,
  createInvite,
  deleteEmployee,
  employeeFootprint,
  markLinkSent,
  revokeInvite,
  setCanManage,
  setEmployeeActive,
  updateEmployee,
} from "./actions";
import { EmployeeList } from "./EmployeeList";

export default async function EmployeesPage() {
  /*
   * select מפורש, למרות שההשמטה הגלובלית כבר מגנה על גיבוב הקוד.
   *
   * הרשימה הזו עוברת ל-EmployeeList שהוא רכיב לקוח, כלומר כל שדה שנבחר
   * כאן נסרל ל-RSC payload וקריא בדפדפן. בלי הרשימה המפורשת, כל עמודה
   * שתתווסף ל-Employee בעתיד תישלח לשם אוטומטית.
   *
   * השער רץ במקביל ולא לפני — ראה ההסבר ב-src/app/manager/page.tsx.
   */
  const [, employees, withPasscodeRows] = await Promise.all([
    requireManager(),
    prisma.employee.findMany({
      orderBy: [{ active: "desc" }, { fullName: "asc" }],
      select: {
        id: true,
        fullName: true,
        phone: true,
        roles: true,
        active: true,
        needsReview: true,
        linkSentAt: true,
        inviteExpiresAt: true,
        canManage: true,
        mustChangePasscode: true,
        failedAttempts: true,
        lastFailedAt: true,
        lockedUntil: true,
        requiredShifts: true,
        maxShifts: true,
        seniority: true,
        preferredPeriod: true,
        fridayLimit: true,
        privateNotes: true,
      },
    }),
    /*
     * מי כבר יש לו קוד — סינון לפי העמודה בלי לבחור אותה. `omit` חוסם
     * בחירה ולא סינון, ולכן הגיבוב עצמו לא נטען לזיכרון בכלל.
     */
    prisma.employee.findMany({
      where: { passcodeHash: { not: null } },
      select: { id: true },
    }),
  ]);

  const withPasscode = new Set(withPasscodeRows.map((e) => e.id));

  /*
   * שלוש עמודות הנעילה נצרכות כאן ולא עוברות הלאה: הרכיב מקבל בוליאני.
   * קריאת השעון יושבת בתוך lockStatus ולא כאן, כי קריאה לשעון בגוף רכיב
   * אינה טהורה — כלל react-hooks/purity חוסם אותה, ובצדק: היא הייתה
   * מייצרת ערך אחר בכל רינדור.
   */
  const rows = employees.map(
    ({ lockedUntil, failedAttempts, lastFailedAt, inviteExpiresAt, ...employee }) => ({
      ...employee,
      hasPasscode: withPasscode.has(employee.id),
      locked: lockStatus({ failedAttempts, lastFailedAt, lockedUntil }).locked,
      inviteUntil: openInviteUntil(inviteExpiresAt),
    }),
  );

  // הכתובת שבהודעות לעובדים — תמיד הראשית בייצור, ראה src/lib/site-url.ts
  const baseUrl = resolveBaseUrl((await headers()).get("host"));

  return (
    <>
      <PageHeader
        title="עובדים"
        subtitle="שדות הפרופיל — משמרות חובה, ותק, מדרגת שישי והערות — גלויים לך בלבד ולא מוצגים לעובד."
      />
      <EmployeeList
        employees={rows}
        baseUrl={baseUrl}
        createAction={createEmployee}
        updateAction={updateEmployee}
        setActiveAction={setEmployeeActive}
        markLinkSentAction={markLinkSent}
        setCanManageAction={setCanManage}
        createInviteAction={createInvite}
        revokeInviteAction={revokeInvite}
        footprintAction={employeeFootprint}
        deleteAction={deleteEmployee}
      />
    </>
  );
}
