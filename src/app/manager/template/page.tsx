import { revalidatePath } from "next/cache";
import { ConfirmSubmit } from "@/components/ConfirmSubmit";
import { Badge, Card, Notice, PageHeader, RoleDot } from "@/components/ui";
import { requireManager } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { CLOSING, DAY_NAMES, ROLE_LABEL, type Role } from "@/lib/domain";
import { isDismissed, setDismissed } from "@/lib/settings";
import { AddSlotForm } from "./AddSlotForm";

async function addSlot(formData: FormData) {
  "use server";
  await requireManager();

  const dayOfWeek = Number(formData.get("dayOfWeek"));
  const last = await prisma.templateSlot.findFirst({
    where: { dayOfWeek },
    orderBy: { sortOrder: "desc" },
  });

  await prisma.templateSlot.create({
    data: {
      dayOfWeek,
      role: String(formData.get("role")),
      period: String(formData.get("period")),
      startTime: String(formData.get("startTime")),
      endTime:
        formData.get("untilClosing") === "on"
          ? CLOSING
          : String(formData.get("endTime")),
      label: String(formData.get("label") ?? "").trim() || null,
      sortOrder: (last?.sortOrder ?? -1) + 1,
    },
  });
  revalidatePath("/manager/template");
}

async function toggleFlag(
  id: string,
  field: "fixedStart" | "fixedEnd" | "standby",
) {
  "use server";
  await requireManager();
  const slot = await prisma.templateSlot.findUnique({ where: { id } });
  if (!slot) return;
  await prisma.templateSlot.update({
    where: { id },
    data: { [field]: !slot[field] },
  });
  revalidatePath("/manager/template");
}

async function removeSlot(id: string) {
  "use server";
  await requireManager();
  await prisma.templateSlot.delete({ where: { id } });
  revalidatePath("/manager/template");
}

async function copyDay(from: number, to: number) {
  "use server";
  await requireManager();

  const source = await prisma.templateSlot.findMany({
    where: { dayOfWeek: from, active: true },
    orderBy: { sortOrder: "asc" },
  });

  await prisma.$transaction([
    prisma.templateSlot.deleteMany({ where: { dayOfWeek: to } }),
    prisma.templateSlot.createMany({
      data: source.map((s, i) => ({
        dayOfWeek: to,
        role: s.role,
        period: s.period,
        startTime: s.startTime,
        endTime: s.endTime,
        label: s.label,
        sortOrder: i,
        fixedStart: s.fixedStart,
        fixedEnd: s.fixedEnd,
        standby: s.standby,
      })),
    }),
  ]);
  revalidatePath("/manager/template");
}

/** ההערה "שעות שדורשות בדיקה" — מוסתרת אחרי שהמנהל בדק, וחוזרת בלחיצה */
const HOURS_NOTICE = "template-hours";

async function hideHoursNotice() {
  "use server";
  const manager = await requireManager();
  await setDismissed(HOURS_NOTICE, manager.id, true);
  revalidatePath("/manager/template");
}

async function showHoursNotice() {
  "use server";
  const manager = await requireManager();
  await setDismissed(HOURS_NOTICE, manager.id, false);
  revalidatePath("/manager/template");
}

export default async function TemplatePage() {
  const manager = await requireManager();
  const hoursChecked = await isDismissed(HOURS_NOTICE, manager.id);

  const slots = await prisma.templateSlot.findMany({
    where: { active: true },
    orderBy: [{ dayOfWeek: "asc" }, { sortOrder: "asc" }],
  });

  const byDay = new Map<number, typeof slots>();
  for (let d = 0; d <= 6; d++) byDay.set(d, []);
  for (const s of slots) byDay.get(s.dayOfWeek)!.push(s);

  return (
    <>
      <PageHeader
        title="תבנית שבועית"
        subtitle="המבנה הקבוע של כל יום. שינוי כאן משפיע רק על שבועות שייפתחו מעכשיו — שבוע פתוח שומר עותק משלו, כדי שהגשות קיימות לא יישברו."
      />

      {!hoursChecked && (
        <div className="mb-6">
          <Notice
            title="שעות שדורשות בדיקה"
            action={
              <form action={hideHoursNotice}>
                <button type="submit" className="text-sm underline underline-offset-2">
                  בדקתי, להסתיר
                </button>
              </form>
            }
          >
            <p className="text-sm">
              שעות האחמ״שים ושעות הסיום של מלצרי שישי לא הופיעו בגיליון הדוגמה
              ולכן נזרעו בהערכה. כדאי לעבור עליהן ולתקן לפני פתיחת השבוע הראשון.
            </p>
          </Notice>
        </div>
      )}

      <Card className="mb-6">
        <p className="text-sm">
          <strong>פתיחה</strong> = חובה להגיע בשעה המדויקת, אחרת אין מי שיתחיל
          את המשמרת. <strong>סגירה</strong> = חובה להישאר עד הסוף. בשאר המשבצות
          עובד יכול להגיע מאוחר או לרדת מוקדם, כל עוד נשארות לו 4 שעות והרצפה
          לא יורדת מתחת לארבעה מלצרים. לחיצה על התגית מחליפה את מצבה.
        </p>
      </Card>

      <div className="grid gap-4 xl:grid-cols-2">
        {[0, 1, 2, 3, 4, 5, 6].map((day) => {
          const daySlots = byDay.get(day)!;
          return (
            <Card key={day}>
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <h2 className="font-bold">{DAY_NAMES[day]}</h2>
                <Badge>{daySlots.length} משבצות</Badge>
                {daySlots.length === 0 && <Badge tone="neutral">יום סגור</Badge>}
                <div className="mr-auto flex gap-1">
                  {[0, 1, 2, 3, 4, 5, 6]
                    .filter((d) => d !== day && byDay.get(d)!.length > 0)
                    .slice(0, 2)
                    .map((source) => (
                      <form
                        key={source}
                        action={copyDay.bind(null, source, day)}
                      >
                        {/* ההעתקה מוחקת את כל היום היעד לפני שהיא מעתיקה */}
                        <ConfirmSubmit
                          variant="ghost"
                          size="sm"
                          confirmLabel="העתקה"
                          danger
                          message={`להעתיק את ${DAY_NAMES[source]} ל${DAY_NAMES[day]}?\n\n${
                            daySlots.length
                          } המשבצות הקיימות של ${DAY_NAMES[day]} יימחקו ויוחלפו ב-${
                            byDay.get(source)!.length
                          } משבצות.`}
                        >
                          העתק מ{DAY_NAMES[source]}
                        </ConfirmSubmit>
                      </form>
                    ))}
                </div>
              </div>

              {daySlots.length > 0 && (
                <table className="mb-3 w-full text-sm">
                  <tbody>
                    {daySlots.map((s) => (
                      <tr key={s.id} className="border-b border-line/70">
                        <td className="w-28 p-1.5">
                          <span className="num">
                            {s.startTime}–
                            {s.endTime === CLOSING ? "סגירה" : s.endTime}
                          </span>
                        </td>
                        <td className="p-1.5">
                          <span className="flex items-center gap-1.5">
                            <RoleDot role={s.role as Role} />
                            {ROLE_LABEL[s.role as Role]}
                          </span>
                        </td>
                        <td className="p-1.5">
                          <div className="flex gap-1">
                            <form action={toggleFlag.bind(null, s.id, "fixedStart")}>
                              <button
                                title="חובה להגיע בשעה המדויקת — אחרת אין מי שיפתח"
                                className={`px-1.5 py-0.5 text-xs ${
                                  s.fixedStart
                                    ? "bg-sky-600 text-white"
                                    : "bg-paper text-muted"
                                }`}
                              >
                                פתיחה
                              </button>
                            </form>
                            <form action={toggleFlag.bind(null, s.id, "fixedEnd")}>
                              <button
                                title="חובה להישאר עד הסוף — אחרת אין מי שיסגור"
                                className={`px-1.5 py-0.5 text-xs ${
                                  s.fixedEnd
                                    ? "bg-sky-600 text-white"
                                    : "bg-paper text-muted"
                                }`}
                              >
                                סגירה
                              </button>
                            </form>
                            <form action={toggleFlag.bind(null, s.id, "standby")}>
                              <button
                                title="משמרת כוננות — אותו עובד לא ישובץ אליה פעמיים באותו שבוע"
                                className={`px-1.5 py-0.5 text-xs ${
                                  s.standby
                                    ? "bg-sky-600 text-white"
                                    : "bg-paper text-muted"
                                }`}
                              >
                                כוננות
                              </button>
                            </form>
                          </div>
                        </td>
                        <td className="p-1.5 text-muted">{s.label ?? ""}</td>
                        <td className="p-1.5 text-left">
                          {/* אדום רק ברגע הכוונה. "הסרה" חוזרת בכל שורה,
                              ואדום קבוע על עשרות שורות היה הופך אותו לרעש
                              במקום לאזהרה. */}
                          <form action={removeSlot.bind(null, s.id)}>
                            <ConfirmSubmit
                              variant="ghost"
                              size="sm"
                              className="text-muted hover:text-brand"
                              confirmLabel="הסרה"
                              danger
                              message={`להסיר את המשבצת ${s.startTime}–${
                                s.endTime === CLOSING ? "סגירה" : s.endTime
                              } (${ROLE_LABEL[s.role as Role]}) מ${DAY_NAMES[day]}?`}
                            >
                              הסרה
                            </ConfirmSubmit>
                          </form>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}

              <AddSlotForm dayOfWeek={day} action={addSlot} />
            </Card>
          );
        })}
      </div>

      {/* הדרך להחזיר את ההערה שהוסתרה — קטנה, בתחתית, לא מתחרה בתבנית */}
      {hoursChecked && (
        <form action={showHoursNotice} className="mt-6">
          <button type="submit" className="text-xs text-muted underline underline-offset-2">
            הצגת ההערה &quot;שעות שדורשות בדיקה&quot; שוב
          </button>
        </form>
      )}
    </>
  );
}
