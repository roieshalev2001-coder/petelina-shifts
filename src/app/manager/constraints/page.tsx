import { revalidatePath } from "next/cache";
import { Badge, Button, Card, Field, PageHeader, inputClass } from "@/components/ui";
import { requireManager } from "@/lib/auth";
import { prisma } from "@/lib/db";

async function addConstraint(formData: FormData) {
  "use server";
  await requireManager();

  const aId = String(formData.get("aId") ?? "");
  const bId = String(formData.get("bId") ?? "");
  if (!aId || !bId || aId === bId) throw new Error("יש לבחור שני עובדים שונים");

  // שומרים את הזוג בסדר קבוע כדי ש-(א,ב) ו-(ב,א) לא ייווצרו כשתי רשומות
  const [first, second] = aId < bId ? [aId, bId] : [bId, aId];

  await prisma.pairConstraint.upsert({
    where: { aId_bId: { aId: first, bId: second } },
    create: {
      aId: first,
      bId: second,
      scope: String(formData.get("scope") ?? "overlapping"),
      hard: formData.get("hard") === "on",
      reason: String(formData.get("reason") ?? "").trim() || null,
    },
    update: {
      scope: String(formData.get("scope") ?? "overlapping"),
      hard: formData.get("hard") === "on",
      reason: String(formData.get("reason") ?? "").trim() || null,
    },
  });
  revalidatePath("/manager/constraints");
}

async function removeConstraint(id: string) {
  "use server";
  await requireManager();
  await prisma.pairConstraint.delete({ where: { id } });
  revalidatePath("/manager/constraints");
}

export default async function ConstraintsPage() {
  /*
   * השער והנתונים יוצאים יחד ולא בזה אחר זה.
   *
   * `requireManager` הוא שאילתה למסד בפני עצמה, ו-`await` לפניה עצר את
   * הדף עד שהיא חוזרת — סבב רשת שלם לפני שהשאילתות של המסך בכלל התחילו,
   * בכל ניווט. ההרשאה נשארת קובעת: `redirect` זורק, והתוצאות שנשלפו
   * במקביל נזרקות איתו ולא מגיעות לאיש.
   */
  const [, employees, constraints] = await Promise.all([
    requireManager(),
    prisma.employee.findMany({
      where: { active: true },
      orderBy: { fullName: "asc" },
    }),
    prisma.pairConstraint.findMany({
      include: { a: true, b: true },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  return (
    <>
      <PageHeader
        title="הגבלות שיבוץ"
        subtitle="זוגות עובדים שאין לשבץ יחד. הסיבה נשמרת לעיונך בלבד ואינה מוצגת לאיש."
      />

      <div className="grid gap-6 lg:grid-cols-[22rem_1fr]">
        <Card>
          <h2 className="mb-4 font-semibold">הגבלה חדשה</h2>
          <form action={addConstraint} className="space-y-4">
            <Field label="עובד א׳">
              <select name="aId" required className={inputClass}>
                <option value="">בחר/י…</option>
                {employees.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.fullName}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="עובד ב׳">
              <select name="bId" required className={inputClass}>
                <option value="">בחר/י…</option>
                {employees.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.fullName}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="היקף ההגבלה">
              <select name="scope" defaultValue="overlapping" className={inputClass}>
                <option value="overlapping">רק כששעות המשמרת נחפפות</option>
                <option value="sameDay">באותו יום בכלל</option>
              </select>
            </Field>
            <Field
              label="סיבה"
              hint="פנימי לחלוטין — לא נחשף לעובדים ולא מופיע בסידור"
            >
              <input name="reason" className={inputClass} />
            </Field>
            <label className="flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                name="hard"
                defaultChecked
                className="check mt-0.5"
              />
              <span>
                אילוץ קשיח
                <span className="block text-xs text-muted">
                  ללא סימון זו תהיה העדפה בלבד — האלגוריתם ינסה להימנע, ואם אין
                  ברירה ישבץ ויסמן לך התראה.
                </span>
              </span>
            </label>
            <Button type="submit" className="w-full">
              הוספה
            </Button>
          </form>
        </Card>

        <div className="space-y-2">
          {constraints.length === 0 && (
            <Card>
              <p className="text-sm text-muted">עדיין לא הוגדרו הגבלות.</p>
            </Card>
          )}
          {constraints.map((c) => (
            <Card key={c.id} className="flex flex-wrap items-center gap-3">
              <span className="font-medium">
                {c.a.fullName} + {c.b.fullName}
              </span>
              {/* סיווג, לא אזהרה — ולכן כחול/ניטרלי ולא ענבר או אדום */}
              <Badge tone={c.hard ? "blue" : "neutral"}>
                {c.hard ? "קשיח" : "העדפה"}
              </Badge>
              <Badge>
                {c.scope === "sameDay" ? "אותו יום" : "שעות חופפות"}
              </Badge>
              {c.reason && (
                <span className="text-sm text-muted">— {c.reason}</span>
              )}
              <form action={removeConstraint.bind(null, c.id)} className="mr-auto">
                <Button variant="ghost" size="sm">
                  הסרה
                </Button>
              </form>
            </Card>
          ))}
        </div>
      </div>
    </>
  );
}
