/**
 * מיישר את דגלי הפותחת/סוגרת של שבועות שכבר נפתחו.
 *
 * למה זה נחוץ: `createWeek` מקפיא עותק של התבנית ל-`WeekSlot`, ולכן שבוע
 * שנפתח לפני תיקון הלוגיקה נושא את הדגלים הישנים — שבהם כל משבצת אחמ״ש
 * וברמן סומנה גם כפותחת וגם כסוגרת. הדגלים אינם חוסמים יותר (ראה fitSlot),
 * אבל הם קובעים אילו אזהרות מוצגות, ולכן שווה ליישר אותם.
 *
 * הרצה יבשה (ברירת המחדל, לא כותב כלום):
 *   npx tsx scripts/repair-slot-flags.ts
 *
 * להחיל:
 *   npx tsx scripts/repair-slot-flags.ts --apply
 *
 * בטוח: נוגע רק בשתי עמודות בוליאניות, לא מוחק שבוע ולא נוגע בהגשות
 * או בשיבוצים. ניתן להרצה חוזרת — אם אין מה לשנות, הוא אומר את זה.
 */
import "dotenv/config";

async function main() {
  const apply = process.argv.includes("--apply");

  const { prisma } = await import("../src/lib/db");
  const { computeSlotFlags } = await import("../src/lib/openers");

  const weeks = await prisma.week.findMany({
    where: { status: { in: ["draft", "open", "closed"] } },
    select: {
      id: true,
      weekStart: true,
      status: true,
      slots: {
        orderBy: [{ dayOfWeek: "asc" }, { sortOrder: "asc" }],
        select: {
          id: true,
          dayOfWeek: true,
          role: true,
          period: true,
          startTime: true,
          endTime: true,
          sortOrder: true,
          fixedStart: true,
          fixedEnd: true,
          label: true,
        },
      },
    },
  });

  if (weeks.length === 0) {
    console.log("אין שבועות פתוחים או בטיוטה. שבוע שפורסם לא נוגעים בו.");
    await prisma.$disconnect();
    return;
  }

  let totalChanges = 0;

  for (const week of weeks) {
    const wanted = computeSlotFlags(week.slots);
    const changes = week.slots.flatMap((slot, i) => {
      const next = wanted[i];
      if (slot.fixedStart === next.fixedStart && slot.fixedEnd === next.fixedEnd) {
        return [];
      }
      return [{ slot, next }];
    });

    console.log(
      `\nשבוע ${week.weekStart.toLocaleDateString("he-IL")} (${week.status}) — ` +
        `${changes.length} מתוך ${week.slots.length} משבצות לשינוי`,
    );

    for (const { slot, next } of changes) {
      const was = `${slot.fixedStart ? "פותחת" : "-"}/${slot.fixedEnd ? "סוגרת" : "-"}`;
      const now = `${next.fixedStart ? "פותחת" : "-"}/${next.fixedEnd ? "סוגרת" : "-"}`;
      console.log(
        `  יום ${slot.dayOfWeek} ${slot.role.padEnd(9)} ` +
          `${slot.startTime}-${slot.endTime.padEnd(7)} ${was} → ${now}` +
          (slot.label ? `  ${slot.label}` : ""),
      );
    }

    if (apply && changes.length > 0) {
      await prisma.$transaction(
        changes.map(({ slot, next }) =>
          prisma.weekSlot.update({
            where: { id: slot.id },
            data: { fixedStart: next.fixedStart, fixedEnd: next.fixedEnd },
          }),
        ),
      );
    }
    totalChanges += changes.length;
  }

  console.log(
    totalChanges === 0
      ? "\nהכול כבר מיושר, אין מה לעשות."
      : apply
        ? `\nהוחלו ${totalChanges} שינויים.`
        : `\nהרצה יבשה. ${totalChanges} שינויים ממתינים — להחיל: --apply`,
  );

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
