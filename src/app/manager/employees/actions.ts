"use server";

import { revalidatePath } from "next/cache";
import { newEmployeeToken, requireManager } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { ROLES, TRAINEE_BASE, TRAINEE_ROLES, type Role } from "@/lib/domain";
import { isFridayLimit } from "@/lib/fridays";
import { normalizePhone } from "@/lib/phone";
import { newInvite } from "@/lib/invite-token";

function readRoles(formData: FormData): string {
  const picked: string[] = ROLES.filter((r) => formData.get(`role_${r}`) === "on");
  // מתלמד בתפקיד שהעובד כבר ממלא אין לו משמעות — הוא פשוט עובד בו
  const trainee = TRAINEE_ROLES.filter(
    (t) => formData.get(`role_${t}`) === "on" && !picked.includes(TRAINEE_BASE[t]),
  );
  return [...picked, ...trainee].join(",");
}

function readProfile(formData: FormData) {
  const preferred = String(formData.get("preferredPeriod") ?? "");
  const fridayLimit = String(formData.get("fridayLimit") ?? "unlimited");
  return {
    fullName: String(formData.get("fullName") ?? "").trim(),
    // מנורמל בכתיבה: הטלפון הוא מפתח הכניסה, וחייב להישמר באותה צורה
    // שבה מחפשים אותו. ראה src/lib/phone.ts
    phone: normalizePhone(String(formData.get("phone") ?? "")),
    roles: readRoles(formData),
    requiredShifts: Number(formData.get("requiredShifts") ?? 0),
    maxShifts: Number(formData.get("maxShifts") ?? 6),
    seniority: Number(formData.get("seniority") ?? 3),
    preferredPeriod:
      preferred === "morning" || preferred === "evening" ? preferred : null,
    // ערך לא מוכר נופל ל"בלי הגבלה" ולא מפיל את השמירה
    fridayLimit: isFridayLimit(fridayLimit) ? fridayLimit : "unlimited",
    privateNotes: String(formData.get("privateNotes") ?? "").trim() || null,
    active: formData.get("active") !== "off",
  };
}

export async function createEmployee(formData: FormData) {
  await requireManager();
  const data = readProfile(formData);
  if (!data.fullName) throw new Error("חובה להזין שם");
  if (!data.roles) throw new Error("חובה לבחור לפחות תפקיד אחד");

  await prisma.employee.create({
    data: { ...data, token: newEmployeeToken(), needsReview: false },
  });
  revalidatePath("/manager/employees");
}

export async function updateEmployee(id: string, formData: FormData) {
  await requireManager();
  const data = readProfile(formData);
  if (!data.fullName) throw new Error("חובה להזין שם");
  if (!data.roles) throw new Error("חובה לבחור לפחות תפקיד אחד");

  await prisma.employee.update({
    data: { ...data, needsReview: false },
    where: { id },
  });
  revalidatePath("/manager/employees");
}

/**
 * השבתה במקום מחיקה — כדי לא לאבד את ההיסטוריה בסידורים קודמים.
 */
export async function setEmployeeActive(
  id: string,
  active: boolean,
): Promise<ActionResult> {
  await requireManager();

  if (!active) {
    const employee = await prisma.employee.findUnique({
      where: { id },
      select: { canManage: true },
    });
    if (employee?.canManage && (await otherManagerCount(id)) === 0) {
      return {
        ok: false,
        error:
          "זה המנהל האחרון. הוצאתו הייתה משאירה את המערכת בלי אף אחד שיכול להיכנס לאזור הניהול.",
      };
    }
  }

  await prisma.employee.update({ data: { active }, where: { id } });
  revalidatePath("/manager/employees");
  return { ok: true };
}

/** מה יימחק יחד עם העובד. ראה deleteEmployee. */
export type Footprint = {
  fullName: string;
  assignments: number;
  submissions: number;
  fridays: number;
  swaps: number;
};

/**
 * סופר את מה שמחיקה תמחק. קריאה בלבד.
 *
 * המנהל רואה את המספרים האלה **לפני** האישור, כי כל אחד מהם הוא היסטוריה
 * של סידור שכבר קרה, ואין ממנה דרך חזרה.
 */
export async function employeeFootprint(
  id: string,
): Promise<ActionResult<Footprint>> {
  await requireManager();

  const employee = await prisma.employee.findUnique({
    where: { id },
    select: {
      fullName: true,
      _count: {
        select: {
          assignments: true,
          submissions: true,
          fridayPlans: true,
          offeredSwaps: true,
          offeredFridays: true,
        },
      },
    },
  });
  if (!employee) return { ok: false, error: "העובד לא נמצא" };

  return {
    ok: true,
    data: {
      fullName: employee.fullName,
      assignments: employee._count.assignments,
      submissions: employee._count.submissions,
      fridays: employee._count.fridayPlans,
      swaps: employee._count.offeredSwaps + employee._count.offeredFridays,
    },
  };
}

/**
 * מחיקה מלאה, אחרי הוצאה.
 *
 * **בלתי הפיכה, וגוררת היסטוריה.** כל הקשרים במסד הם `onDelete: Cascade`,
 * ולכן נמחקים איתו גם השיבוצים שלו בסידורים שכבר פורסמו, ההגשות, סבב
 * שישי, החילופים וההתראות. השבתה (`setEmployeeActive`) נשארת ברירת
 * המחדל, והמחיקה היא לעובד שלא אמור להישאר ברשומות בכלל.
 *
 * שלושה שערים: רק עובד מושבת, לא המשתמש עצמו, ולא המנהל האחרון.
 */
export async function deleteEmployee(id: string): Promise<ActionResult> {
  const me = await requireManager();

  if (me.id === id) {
    return { ok: false, error: "אי אפשר למחוק את החשבון שדרכו אתה מחובר." };
  }

  const employee = await prisma.employee.findUnique({
    where: { id },
    select: { active: true, canManage: true },
  });
  if (!employee) return { ok: false, error: "העובד לא נמצא" };

  if (employee.active) {
    return {
      ok: false,
      error: "קודם צריך להוציא את העובד, ורק אחר כך אפשר למחוק.",
    };
  }
  if (employee.canManage && (await otherManagerCount(id)) === 0) {
    return {
      ok: false,
      error:
        "זה המנהל האחרון. מחיקתו הייתה משאירה את המערכת בלי אף אחד שיכול להיכנס לאזור הניהול.",
    };
  }

  await prisma.employee.delete({ where: { id } });
  revalidatePath("/manager/employees");
  return { ok: true };
}

export type ActionResult<T = undefined> =
  | ({ ok: true } & (T extends undefined ? object : { data: T }))
  | { ok: false; error: string };

/**
 * כמה מנהלים פעילים יש חוץ מהעובד הזה.
 *
 * שומר מפני נעילה עצמית: הסרת ההרשאה האחרונה או הוצאת המנהל האחרון היו
 * משאירות את המערכת בלי אף אחד שיכול להיכנס לאזור הניהול, ואין דרך
 * לתקן את זה מתוך הממשק.
 */
async function otherManagerCount(excludeId: string): Promise<number> {
  return prisma.employee.count({
    where: { canManage: true, active: true, id: { not: excludeId } },
  });
}

/** נותן או שולל הרשאת ניהול */
export async function setCanManage(
  id: string,
  canManage: boolean,
): Promise<ActionResult> {
  await requireManager();

  if (!canManage && (await otherManagerCount(id)) === 0) {
    return {
      ok: false,
      error:
        "זה המנהל האחרון. הסרת ההרשאה שלו הייתה משאירה את המערכת בלי אף אחד שיכול להיכנס לאזור הניהול.",
    };
  }

  await prisma.employee.update({ where: { id }, data: { canManage } });
  revalidatePath("/manager/employees");
  return { ok: true };
}

/**
 * יוצר קישור כניסה אישי ומחזיר את המפתח **פעם אחת** לתצוגה — במסד נשמר רק
 * הגיבוב שלו (ראה src/lib/invite.ts). קישור חדש מבטל את הקודם.
 *
 * הקוד הנוכחי של העובד, אם יש, ממשיך לעבוד עד שיבחר קוד חדש דרך הקישור —
 * כך שקישור שנשלח בטעות לא נועל אף אחד מחוץ לחשבון.
 */
export async function createInvite(
  id: string,
): Promise<ActionResult<{ token: string; expiresAt: Date }>> {
  await requireManager();
  const employee = await prisma.employee.findUnique({ where: { id }, select: { active: true } });
  if (!employee?.active) return { ok: false, error: "העובד לא פעיל" };

  const invite = newInvite();
  await prisma.employee.update({
    where: { id },
    data: { inviteTokenHash: invite.hash, inviteExpiresAt: invite.expiresAt },
  });
  revalidatePath("/manager/employees");
  return { ok: true, data: { token: invite.token, expiresAt: invite.expiresAt } };
}

/** מבטל קישור כניסה פתוח. */
export async function revokeInvite(id: string): Promise<void> {
  await requireManager();
  await prisma.employee.update({
    where: { id },
    data: { inviteTokenHash: null, inviteExpiresAt: null },
  });
  revalidatePath("/manager/employees");
}

/**
 * מסמן שהקישור האישי נשלח לעובד.
 *
 * נחתם כשלוחצים על "שליחה בוואטסאפ" או על "העתקת הודעה" — לא ראיה שהעובד
 * קיבל, אבל כן סימן איפה עצרת. בלעדיו, שליחה ל-29 עובדים היא רשימה
 * שאי אפשר לעבוד לפיה: "טרם הגיש" לא מבדיל בין מי שלא קיבל למי שקיבל
 * והתעלם.
 */
export async function markLinkSent(id: string) {
  await requireManager();
  await prisma.employee.update({
    data: { linkSentAt: new Date() },
    where: { id },
  });
  revalidatePath("/manager/employees");
}

export type EmployeeRoleFilter = Role | "all";
