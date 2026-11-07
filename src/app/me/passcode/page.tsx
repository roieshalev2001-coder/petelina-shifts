import { redirect } from "next/navigation";
import { PageHeader } from "@/components/ui";
import { currentUser } from "@/lib/auth";
import { changePasscode } from "@/lib/login";
import { PasscodeForm } from "./PasscodeForm";

export default async function PasscodePage() {
  // currentUser ולא requireUser: requireUser מפנה לכאן, וזו הייתה לולאה
  const user = await currentUser();
  if (!user) redirect("/login");

  async function change(current: string, next: string) {
    "use server";
    // הזהות נקראת מהסשן ולא מהלקוח — אחרת אפשר היה להחליף קוד לאדם אחר
    const me = await currentUser();
    if (!me) return { ok: false as const, error: "פג תוקף החיבור — יש להיכנס מחדש" };

    const result = await changePasscode({
      employeeId: me.id,
      current,
      next,
    });
    if (!result.ok) return result;
    redirect("/me");
  }

  return (
    <>
      <PageHeader
        title={user.mustChangePasscode ? "בחירת קוד אישי" : "החלפת הקוד"}
        subtitle={
          user.mustChangePasscode
            ? "הקוד שקיבלת מהמנהל הוא זמני. בחר קוד משלך — הוא לא ידוע לאף אחד, גם לא למנהל."
            : "צריך להזין את הקוד הנוכחי כדי לקבוע חדש."
        }
      />
      <PasscodeForm action={change} />
    </>
  );
}
