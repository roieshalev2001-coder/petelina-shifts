/**
 * הרצה מקצה לקצה על נתונים מציאותיים: פותח שבוע, מייצר הגשות סינתטיות
 * לכל העובדים כולל מקרי קצה, מריץ את הפותר ומדפיס את הסידור בפריסת הגיליון.
 *
 * הרצה: npm run simulate
 */
// tsx לא טוען .env מעצמו, בניגוד ל-Next ול-prisma.config.ts
import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { DAY_NAMES, parseRoles, ROLE_LABEL } from "../src/lib/domain";
import { buildSolverInput } from "../src/lib/scheduler/adapter";
import { UNFILLED_REASON_LABEL } from "../src/lib/scheduler/explain";
import { solve } from "../src/lib/scheduler/solve";
import { addDays, startOfWeek, toHHMM } from "../src/lib/time";
import { requireDevDatabase } from "../src/lib/dev-db";
import { closingTimeFor } from "../src/lib/week";

/*
 * הסקריפט מוחק את השבוע הבא ואת כל אילוצי הזוגות, ולכן הוא לא נוגע במסד
 * שבסביבה. ראה src/lib/dev-db.ts.
 */
const prisma = new PrismaClient({
  adapter: new PrismaPg({
    connectionString: requireDevDatabase("SIMULATE_DB", "npm run simulate"),
  }),
});

/** רנדום דטרמיניסטי כדי שההרצה תהיה ניתנת לשחזור */
function makeRng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

async function main() {
  const rng = makeRng(20260815);

  // --- שבוע נקי ---
  const weekStart = addDays(startOfWeek(new Date()), 7);
  await prisma.week.deleteMany({ where: { weekStart } });

  const template = await prisma.templateSlot.findMany({
    where: { active: true },
    orderBy: [{ dayOfWeek: "asc" }, { sortOrder: "asc" }],
  });

  const week = await prisma.week.create({
    data: {
      weekStart,
      opensAt: new Date(),
      deadline: addDays(new Date(), 2),
      status: "open",
      slots: {
        create: template.map((t) => ({
          date: addDays(weekStart, t.dayOfWeek),
          dayOfWeek: t.dayOfWeek,
          role: t.role,
          period: t.period,
          startTime: t.startTime,
          endTime: t.endTime,
          label: t.label,
          sortOrder: t.sortOrder,
          fixedStart: t.fixedStart,
          fixedEnd: t.fixedEnd,
        })),
      },
    },
    include: { slots: true },
  });

  const employees = await prisma.employee.findMany({ where: { active: true } });
  console.log(
    `שבוע ${weekStart.toLocaleDateString("he-IL")} · ${week.slots.length} משבצות · ${employees.length} עובדים\n`,
  );

  // --- הגשות סינתטיות ---
  // כל עובד מסמן בערך פי 2 ממכסת המשמרות שלו, כדי שיהיה מרחב תמרון לפותר.
  const availabilities: {
    weekId: string;
    employeeId: string;
    slotId: string;
    state: string;
    earliestStart: string | null;
    latestEnd: string | null;
  }[] = [];

  // מקרי קצה מכוונים
  const edgeCases = new Map<string, { latestEnd?: string; earliestStart?: string }>();
  const waiters = employees.filter((e) => parseRoles(e.roles).includes("waiter"));
  if (waiters[0]) edgeCases.set(waiters[0].id, { latestEnd: "15:00" });
  if (waiters[1]) edgeCases.set(waiters[1].id, { latestEnd: "16:00" });
  if (waiters[2]) edgeCases.set(waiters[2].id, { earliestStart: "10:00" });

  for (const emp of employees) {
    const roles = parseRoles(emp.roles);
    const eligible = week.slots.filter((s) => roles.includes(s.role as never));
    const target = Math.min(eligible.length, Math.max(3, emp.requiredShifts * 2 + 2));

    const shuffled = [...eligible].sort(() => rng() - 0.5).slice(0, target);
    const edge = edgeCases.get(emp.id);

    for (const slot of shuffled) {
      availabilities.push({
        weekId: week.id,
        employeeId: emp.id,
        slotId: slot.id,
        state: rng() < 0.3 ? "preferred" : "available",
        earliestStart: edge?.earliestStart ?? null,
        latestEnd: edge?.latestEnd ?? null,
      });
    }
  }

  await prisma.availability.createMany({ data: availabilities });
  console.log(`${availabilities.length} סימוני זמינות נוצרו`);
  for (const [id, edge] of edgeCases) {
    const name = employees.find((e) => e.id === id)?.fullName;
    const desc = edge.latestEnd
      ? `חייב לרדת עד ${edge.latestEnd}`
      : `מגיע רק מ-${edge.earliestStart}`;
    console.log(`  מקרה קצה: ${name} — ${desc}`);
  }

  // --- אילוץ "לא עובדים יחד" ---
  if (waiters.length >= 5) {
    await prisma.pairConstraint.deleteMany();
    await prisma.pairConstraint.create({
      data: {
        aId: waiters[3].id,
        bId: waiters[4].id,
        scope: "overlapping",
        hard: true,
        reason: "בדיקה",
      },
    });
    console.log(`  אילוץ: ${waiters[3].fullName} + ${waiters[4].fullName} לא יחד\n`);
  }

  // --- הרצת הפותר ---
  const constraints = await prisma.pairConstraint.findMany();
  const input = buildSolverInput({
    week,
    slots: week.slots,
    employees,
    availabilities,
    constraints,
  });

  const { assignments, report } = solve(input);

  // --- הדפסת הסידור בפריסת הגיליון ---
  const empById = new Map(employees.map((e) => [e.id, e]));
  const bySlot = new Map(assignments.map((a) => [a.slotId, a]));
  const slotById = new Map(week.slots.map((s) => [s.id, s]));

  for (let day = 0; day <= 6; day++) {
    const daySlots = week.slots
      .filter((s) => s.dayOfWeek === day)
      .sort((a, b) => a.sortOrder - b.sortOrder);
    if (daySlots.length === 0) continue;

    const date = addDays(weekStart, day);
    console.log(
      `\n━━ ${DAY_NAMES[day]} ${date.getDate()}/${date.getMonth() + 1} ━━ (סגירה ${closingTimeFor(week, day)})`,
    );

    for (const slot of daySlots) {
      const a = bySlot.get(slot.id);
      const end = slot.endTime === "CLOSING" ? "סגירה" : slot.endTime;
      const time = `${slot.startTime}-${end}`.padEnd(14);
      const role = ROLE_LABEL[slot.role as keyof typeof ROLE_LABEL].padEnd(6);

      if (!a) {
        console.log(`  ${time} ${role} ⚠ ריק`);
        continue;
      }
      const name = empById.get(a.employeeId)?.fullName ?? "?";
      const mark = a.shortened
        ? ` ⚑ מקוצר: יורד ב-${toHHMM(a.actualEnd)}`
        : "";
      console.log(`  ${time} ${role} ${name}${mark}`);
    }
  }

  // --- דוח ---
  console.log(`\n${"═".repeat(60)}`);
  console.log(
    `אויש ${report.filled} מתוך ${report.total} משבצות (${Math.round((report.filled / report.total) * 100)}%) · ${report.elapsedMs}ms`,
  );

  if (report.unfilled.length) {
    console.log(`\nמשבצות ריקות (${report.unfilled.length}):`);
    for (const u of report.unfilled) {
      const s = slotById.get(u.slotId)!;
      const date = addDays(weekStart, s.dayOfWeek);
      console.log(
        `  ${DAY_NAMES[s.dayOfWeek]} ${date.getDate()}/${date.getMonth() + 1} ${s.startTime} ${ROLE_LABEL[s.role as keyof typeof ROLE_LABEL]} — ${UNFILLED_REASON_LABEL[u.reason]}`,
      );
    }
  }

  // --- אימות קשיח: הכללים החדשים לא נשברו ---
  const violations: string[] = [];
  for (const a of assignments) {
    const slot = slotById.get(a.slotId)!;
    const name = empById.get(a.employeeId)?.fullName;
    const label = `${DAY_NAMES[slot.dayOfWeek]} ${slot.startTime}`;
    if (slot.fixedStart && toHHMM(a.actualStart) !== slot.startTime) {
      violations.push(`${label}: משבצת פותחת אוישה ב-${name} שמגיע ב-${toHHMM(a.actualStart)}`);
    }
    const slotEnd = slot.endTime === "CLOSING" ? closingTimeFor(week, slot.dayOfWeek) : slot.endTime;
    if (slot.fixedEnd && toHHMM(a.actualEnd) !== slotEnd) {
      violations.push(`${label}: משבצת סוגרת אוישה ב-${name} שיורד ב-${toHHMM(a.actualEnd)}`);
    }
  }
  const byEmpDay = new Map<string, Set<string>>();
  for (const a of assignments) {
    const slot = slotById.get(a.slotId)!;
    if (slot.role !== "waiter") continue;
    const key = `${a.employeeId}|${slot.dayOfWeek}`;
    if (!byEmpDay.has(key)) byEmpDay.set(key, new Set());
    byEmpDay.get(key)!.add(slot.period);
  }
  for (const [key, periods] of byEmpDay) {
    if (periods.size > 1) {
      violations.push(`${empById.get(key.split("|")[0])?.fullName} עובר בין סבבים ביום ${key.split("|")[1]}`);
    }
  }
  console.log(
    violations.length
      ? `\n❌ ${violations.length} הפרות כללים:\n  ` + violations.join("\n  ")
      : "\n✅ אין הפרות: פותחות בזמן, סוגרות עד הסוף, ואף מלצר לא עובר בין סבבים",
  );

  // --- פיזור ותק בין המשמרות ---
  const shiftSeniority = new Map<string, number[]>();
  for (const a of assignments) {
    const sl = slotById.get(a.slotId)!;
    if (sl.role !== "waiter") continue;
    const emp = empById.get(a.employeeId);
    if (!emp) continue;
    const key = `${DAY_NAMES[sl.dayOfWeek]} ${sl.period === "evening" ? "ערב" : sl.period === "morning" ? "בוקר" : "שישי"}`;
    shiftSeniority.set(key, [...(shiftSeniority.get(key) ?? []), emp.seniority]);
  }
  const means = [...shiftSeniority.entries()].map(([k, v]) => [k, v.reduce((s, n) => s + n, 0) / v.length] as const);
  const overall = means.reduce((s, [, m]) => s + m, 0) / means.length;
  console.log("\nפיזור ותק (ממוצע לכל משמרת, מלצרים):");
  for (const [k, m] of means.sort((a, b) => a[1] - b[1])) {
    console.log(`  ${k.padEnd(14)} ${m.toFixed(2)}`);
  }
  console.log(`  ← ממוצע כללי ${overall.toFixed(2)} · טווח ${Math.min(...means.map(m=>m[1])).toFixed(2)}-${Math.max(...means.map(m=>m[1])).toFixed(2)}`);

  const autoPartial = assignments.filter((a) => a.shortened);
  console.log(
    autoPartial.length
      ? `\n❌ ${autoPartial.length} שיבוצים חלקיים אוטומטיים — לא אמור לקרות`
      : "✅ אף שיבוץ אוטומטי אינו חלקי",
  );

  const withOptions = report.unfilled.filter((u) => u.partialOptions.length > 0);
  if (withOptions.length) {
    console.log(`\nמשבצות ריקות עם אפשרויות למנהל (${withOptions.length}):`);
    for (const u of withOptions.slice(0, 6)) {
      const s2 = slotById.get(u.slotId)!;
      const opts = u.partialOptions
        .slice(0, 3)
        .map((o) => `${empById.get(o.employeeId)?.fullName} ${o.start}-${o.end}`)
        .join(" · ");
      console.log(`  ${DAY_NAMES[s2.dayOfWeek]} ${s2.startTime}-${s2.endTime}: ${opts}`);
    }
  }

  if (report.coverageGaps.length) {
    console.log(`\nחורים ברצפת האיוש (${report.coverageGaps.length}):`);
    for (const g of report.coverageGaps.slice(0, 8)) {
      console.log(`  ${DAY_NAMES[g.dayOfWeek]} ${g.from}-${g.to}: ${g.actual} מלצרים במקום ${g.required}`);
    }
  } else {
    console.log("רצפת האיוש נשמרה בכל השבוע");
  }

  if (report.shortenedAssignments.length) {
    console.log(`\nשיבוצים חלקיים הממתינים לאישור (${report.shortenedAssignments.length}):`);
    for (const slotId of report.shortenedAssignments) {
      const s = slotById.get(slotId)!;
      const a = bySlot.get(slotId)!;
      console.log(
        `  ${DAY_NAMES[s.dayOfWeek]} ${s.startTime}-${s.endTime} · ${empById.get(a.employeeId)?.fullName} עובד ${toHHMM(a.actualStart)}-${toHHMM(a.actualEnd)}`,
      );
    }
  }

  if (report.shortfalls.length) {
    console.log(`\nעובדים מתחת למכסה (${report.shortfalls.length}):`);
    for (const s of report.shortfalls) {
      console.log(
        `  ${empById.get(s.employeeId)?.fullName}: ${s.assigned}/${s.required} (סימן ${s.marked} משבצות)`,
      );
    }
  }

  for (const v of report.softViolations) console.log(`\n⚠ ${v.detail}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
