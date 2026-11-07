import { revalidatePath } from "next/cache";
import { Button, Card, Notice, PageHeader } from "@/components/ui";
import { requireManager } from "@/lib/auth";
import { ROLE_LABEL_PLURAL } from "@/lib/domain";
import { GROUP_ROLES, groupLinks, setGroupLink, type GroupRole } from "@/lib/settings";

async function save(formData: FormData) {
  "use server";
  await requireManager();
  for (const role of GROUP_ROLES) {
    await setGroupLink(role, String(formData.get(role) ?? ""));
  }
  revalidatePath("/manager/settings");
  revalidatePath("/manager");
}

export default async function SettingsPage() {
  // השער והנתונים יחד — ראה ההסבר ב-src/app/manager/page.tsx
  const [, links] = await Promise.all([requireManager(), groupLinks()]);

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader
        title="הגדרות"
        subtitle="קישורי קבוצות הוואטסאפ. ההודעה על משבצות חסרות נשלחת גם בלעדיהם — הקישור מוסיף כפתור שפותח את הקבוצה ישירות."
      />

      <Notice tone="neutral" title="איך משיגים את הקישור">
        <p className="text-sm">
          בוואטסאפ: פתיחת הקבוצה ← פרטי הקבוצה ← <b>הזמנה באמצעות קישור</b> ←
          העתקה. הקישור נראה כמו <span className="num">chat.whatsapp.com/…</span>
        </p>
      </Notice>

      <Card className="mt-4">
        <form action={save} className="space-y-4">
          {GROUP_ROLES.map((role: GroupRole) => (
            <div key={role}>
              <label htmlFor={role} className="block text-sm font-medium">
                קבוצת {ROLE_LABEL_PLURAL[role]}
              </label>
              <input
                id={role}
                name={role}
                type="url"
                dir="ltr"
                placeholder="https://chat.whatsapp.com/…"
                defaultValue={links[role] ?? ""}
                className="mt-1 w-full border border-line bg-surface px-3 py-2.5 text-left outline-none transition focus:border-ink"
              />
            </div>
          ))}

          <p className="text-xs text-muted">
            {/* ריק מוחק — כדי ש"לא הוגדר" יהיה מצב אחד ולא שניים */}
            שדה ריק מסיר את הקישור, וכפתור &quot;העתקה ופתיחת הקבוצה&quot; במסך השבוע ייעלם.
          </p>

          <Button type="submit">שמירה</Button>
        </form>
      </Card>
    </div>
  );
}
