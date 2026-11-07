import {
  googleCalendarUrl,
  shiftEvent,
  type CalendarEvent,
} from "./calendar";
import { prisma } from "./db";
import { ROLE_LABEL, type Role } from "./domain";
import { overlaps, toMinutes } from "./time";
import { closingTimeFor } from "./week";
import {
  CANCEL_BLOCK_LABEL,
  CLAIM_BLOCK_LABEL,
  DECISION_BLOCK_LABEL,
  OFFER_BLOCK_LABEL,
  cancelBlock,
  claimBlock,
  decisionBlock,
  isBeforeCutoff,
  offerBlock,
  offeredHours,
  shiftStartsAt,
  type SwapSlotView,
} from "./swaps";

/**
 * שכבת המסד של מסירת המשמרות.
 *
 * הפונקציות כאן אינן server actions — הן מקבלות employeeId שכבר אומת, בדיוק
 * כמו saveSubmission ב-src/lib/submissions.ts. האימות עצמו נעשה בעוטפים
 * שב-src/app/e/[token]/page.tsx, שסוגרים על הטוקן מה-URL.
 */

/** נכשל כשמישהו הקדים, או כשהמצב השתנה מתחת לרגליים. הודעה בעברית לתצוגה. */
export class SwapError extends Error {}

/** מה שמותר להעביר ללקוח על עובד אחר — שם בלבד. */
export type SwapPeer = { id: string; fullName: string };

export type OpenOfferView = {
  offerId: string;
  slotId: string;
  dayOfWeek: number;
  role: Role;
  /** השעות המלאות שהתופס יקבל */
  start: string;
  end: string;
  label: string | null;
  offeredBy: SwapPeer;
  /** דקות עד שההצעה נסגרת (תחילת המשמרת פחות חלון החתך) */
  minutesLeft: number;
};

export type MyShiftView = {
  slotId: string;
  dayOfWeek: number;
  role: Role;
  /** מה שמופיע בסידור — עשוי להיות מקוצר */
  actualStart: string;
  actualEnd: string;
  /** שעות המשבצת המלאות, אחרי פתירת "עד סגירה" */
  slotEnd: string;
  shortened: boolean;
  label: string | null;
  /** ההצעה הפתוחה שלי על המשמרת הזו, אם יש */
  openOfferId: string | null;
  /**
   * מישהו כבר תפס וההחלטה אצל המנהל.
   *
   * המשמרת עדיין רשומה עליי ולכן היא מופיעה כאן ולא ב"נמסרו" — וזה נכון:
   * עד שהמנהל יאשר, אני זה שאמור להגיע.
   */
  pendingClaimBy: string | null;
  /** האם עדיין אפשר למסור אותה */
  canOffer: boolean;
  /** למה אי אפשר, כשלא */
  offerBlockedReason: string | null;
  /** ממי קיבלתי אותה, אם קיבלתי אותה בחילוף */
  takenFrom: SwapPeer | null;
  /** הערה של המנהל לבלוק הזה ("פותח קופה") */
  note: string | null;
  /** איך השעות מוצגות — כמו בסידור (ראה formatHours) */
  timeDisplay: string;
  /** "הוספה ליומן" למשמרת הבודדת הזו */
  googleUrl: string;
  /**
   * משמרת כמתלמד: אני מצטרף לבלוק של עובד רגיל (`with` — השם שלו, או null
   * כשעוד אין). null במשמרת רגילה. משמרת כזו אי אפשר למסור — היא לא
   * מאיישת את הבלוק, והמנהל הוא שבחר לאיזה עובד לצרף אותי.
   */
  trainee: { with: string | null } | null;
};

/** הכותרת של אירוע היומן — זהה לכל המשמרות, וזה בסדר: היומן כבר יודע מתי */
const EVENT_SUMMARY = "משמרת בפטלינה";

/** "מלצר" · "ברמן · ברמן בוקר" — label ריק ברוב משמרות המלצרים */
function eventDescription(role: Role, label: string | null, trainee = false): string {
  const what = trainee ? `מתלמד ${ROLE_LABEL[role]}` : ROLE_LABEL[role];
  return label ? `${what} · ${label}` : what;
}

export type SwapBoard = {
  weekId: string;
  myShifts: MyShiftView[];
  openOffers: OpenOfferView[];
  /** משמרות שמסרתי ומישהו כבר לקח — כדי שהן לא ייעלמו בלי הסבר */
  givenAway: {
    slotId: string;
    dayOfWeek: number;
    start: string;
    end: string;
    to: SwapPeer;
  }[];
};

/** WeekSlot + השבוע שלו → התצוגה הטהורה ש-swaps.ts עובד מולה */
function toSlotView(
  slot: {
    id: string;
    role: string;
    dayOfWeek: number;
    date: Date;
    startTime: string;
    endTime: string;
  },
  week: { closingTimes: string },
): SwapSlotView {
  return {
    slotId: slot.id,
    role: slot.role as Role,
    dayOfWeek: slot.dayOfWeek,
    date: slot.date,
    startTime: slot.startTime,
    endTime: offeredHours(slot, closingTimeFor(week, slot.dayOfWeek)).end,
  };
}

/**
 * כל מה שהעובד רואה על מסך הבית לגבי השבוע שפורסם.
 *
 * ה-select על עובדים אחרים מצומצם ל-fullName בכוונה: המסך הוא client
 * component, וכל מה שעובר אליו נסרל ל-RSC payload וקריא בדפדפן. include מלא
 * היה שולח את הטוקן, ההערות הפרטיות והוותק של עובד אחר לדפדפן הזה — בדיוק
 * הדליפה ש-employeeFromToken נכתבה כדי למנוע.
 */
export async function loadSwapBoard(args: {
  weekId: string;
  employeeId: string;
  roles: string;
  now?: Date;
}): Promise<SwapBoard | null> {
  const now = args.now ?? new Date();

  const week = await prisma.week.findUnique({
    where: { id: args.weekId },
    include: {
      slots: true,
      assignments: {
        select: { slotId: true, employeeId: true, actualStart: true, actualEnd: true, shortened: true, note: true },
      },
      // הבלוקים שצירפו אותי אליהם כמתלמד, ועם מי — שם בלבד, ראה ההערה למעלה
      trainees: {
        where: { employeeId: args.employeeId },
        select: {
          slotId: true,
          slot: { select: { assignment: { select: { employee: { select: { fullName: true } } } } } },
        },
      },
      swapOffers: {
        // pending כלול: הוא חוסם הצעה שנייה, ומופיע לשני הצדדים כ"ממתין"
        where: { status: { in: ["open", "pending", "claimed"] } },
        select: {
          id: true,
          slotId: true,
          status: true,
          offeredById: true,
          claimedById: true,
          offeredStart: true,
          offeredEnd: true,
          offeredBy: { select: { id: true, fullName: true } },
          claimedBy: { select: { id: true, fullName: true } },
        },
      },
    },
  });
  if (!week) return null;

  const slotById = new Map(week.slots.map((s) => [s.id, s]));
  const assignmentBySlot = new Map(week.assignments.map((a) => [a.slotId, a]));
  /*
   * "פעילה" = פתוחה או ממתינה לאישור. שתיהן חוסמות הצעה שנייה על אותה
   * משבצת, בדיוק כמו האינדקס הייחודי על openSlotId שאוכף את זה במסד.
   */
  const activeOfferBySlot = new Map(
    week.swapOffers
      .filter((o) => o.status === "open" || o.status === "pending")
      .map((o) => [o.slotId, o]),
  );

  // הימים שבהם אני כבר משובץ — הקלט של בדיקת ההתנגשות
  const myDays = week.assignments
    .filter((a) => a.employeeId === args.employeeId)
    .map((a) => slotById.get(a.slotId)?.dayOfWeek)
    .filter((d): d is number => d !== undefined);

  const myShifts: MyShiftView[] = [];
  for (const a of week.assignments) {
    if (a.employeeId !== args.employeeId) continue;
    const slot = slotById.get(a.slotId);
    if (!slot) continue;

    const view = toSlotView(slot, week);
    const active = activeOfferBySlot.get(slot.id) ?? null;
    const block = offerBlock({
      weekStatus: week.status,
      slot,
      assignedToId: a.employeeId,
      requesterId: args.employeeId,
      hasOpenOffer: Boolean(active),
      now,
    });

    // מי מסר לי את המשמרת הזו, אם היא הגיעה בחילוף
    const takenFrom =
      week.swapOffers.find(
        (o) => o.slotId === slot.id && o.status === "claimed" && o.claimedById === args.employeeId,
      )?.offeredBy ?? null;

    myShifts.push({
      note: a.note,
      timeDisplay: slot.timeDisplay,
      slotId: slot.id,
      dayOfWeek: slot.dayOfWeek,
      role: slot.role as Role,
      actualStart: a.actualStart,
      actualEnd: a.actualEnd,
      slotEnd: view.endTime,
      shortened: a.shortened,
      label: slot.label,
      openOfferId: active?.status === "open" ? active.id : null,
      pendingClaimBy:
        active?.status === "pending" ? (active.claimedBy?.fullName ?? null) : null,
      canOffer: block === null,
      offerBlockedReason: block && block !== "already-offered" ? OFFER_BLOCK_LABEL[block] : null,
      takenFrom,
      // אותה shiftEvent שבונה את הקובץ — כך שהקישור והקובץ לא יכולים להיפרד
      googleUrl: googleCalendarUrl(
        shiftEvent({
          slotId: slot.id,
          date: slot.date,
          startTime: a.actualStart,
          endTime: a.actualEnd,
          summary: EVENT_SUMMARY,
          description: eventDescription(slot.role as Role, slot.label),
        }),
      ),
      trainee: null,
    });
  }

  // משמרות כמתלמד: שעות הבלוק עצמו, בלי מסירה
  for (const t of week.trainees) {
    const slot = slotById.get(t.slotId);
    if (!slot) continue;
    const end = toSlotView(slot, week).endTime;
    myShifts.push({
      note: null,
      timeDisplay: slot.timeDisplay,
      slotId: slot.id,
      dayOfWeek: slot.dayOfWeek,
      role: slot.role as Role,
      actualStart: slot.startTime,
      actualEnd: end,
      slotEnd: end,
      shortened: false,
      label: slot.label,
      openOfferId: null,
      pendingClaimBy: null,
      canOffer: false,
      offerBlockedReason: null,
      takenFrom: null,
      googleUrl: googleCalendarUrl(
        shiftEvent({
          slotId: slot.id,
          date: slot.date,
          startTime: slot.startTime,
          endTime: end,
          summary: EVENT_SUMMARY,
          description: eventDescription(slot.role as Role, slot.label, true),
        }),
      ),
      trainee: { with: t.slot.assignment?.employee.fullName ?? null },
    });
  }
  myShifts.sort((a, b) => a.dayOfWeek - b.dayOfWeek || a.actualStart.localeCompare(b.actualStart));

  const openOffers: OpenOfferView[] = [];
  for (const offer of week.swapOffers) {
    if (offer.status !== "open") continue;
    const slot = slotById.get(offer.slotId);
    if (!slot) continue;

    // הצעה מיותמת: המנהל שיבץ מישהו אחר בינתיים, ולכן CAS 2 ידחה כל תפיסה.
    // אין טעם לפרסם משמרת שאי אפשר לקחת.
    const holder = assignmentBySlot.get(offer.slotId);
    if (!holder || holder.employeeId !== offer.offeredById) continue;

    const block = claimBlock({
      offer,
      slot: { ...slot, role: slot.role as Role },
      claimer: { id: args.employeeId, roles: args.roles },
      claimerAssignedDays: myDays,
      now,
    });
    if (block) continue;

    openOffers.push({
      offerId: offer.id,
      slotId: slot.id,
      dayOfWeek: slot.dayOfWeek,
      role: slot.role as Role,
      start: offer.offeredStart,
      end: offer.offeredEnd,
      label: slot.label,
      offeredBy: offer.offeredBy,
      minutesLeft: Math.floor(
        (shiftStartsAt(slot).getTime() - now.getTime()) / 60_000,
      ),
    });
  }
  openOffers.sort((a, b) => a.minutesLeft - b.minutesLeft);

  const givenAway = week.swapOffers
    .filter((o) => o.status === "claimed" && o.offeredById === args.employeeId && o.claimedBy)
    .map((o) => {
      const slot = slotById.get(o.slotId);
      return {
        slotId: o.slotId,
        dayOfWeek: slot?.dayOfWeek ?? 0,
        start: o.offeredStart,
        end: o.offeredEnd,
        to: o.claimedBy!,
      };
    })
    .sort((a, b) => a.dayOfWeek - b.dayOfWeek);

  return { weekId: week.id, myShifts, openOffers, givenAway };
}

/**
 * המשמרות של העובד כאירועי יומן, לייצוא ל-.ics.
 *
 * כולל גם משמרות שהוא מסר ומישהו לקח, מסומנות cancelled: הורדה חוזרת של
 * הקובץ תסיר אותן מהיומן שלו. זה מיטב-מאמץ — התמיכה משתנה בין לקוחות —
 * וזו הסיבה שהמסך אומר במפורש שצריך להוריד שוב אחרי שינוי.
 */
export async function loadShiftEvents(args: {
  weekId: string;
  employeeId: string;
  /**
   * משמרות שמסר, כאירועים מבוטלים — להורדה בלבד. במנוי הן מיותרות: מה
   * שנעלם מהקובץ נמחק מהיומן לבד, ואירוע מבוטל רק היה נשאר בו מחוק.
   */
  includeReleased?: boolean;
}): Promise<CalendarEvent[]> {
  const week = await prisma.week.findUnique({
    where: { id: args.weekId },
    select: {
      closingTimes: true,
      slots: {
        select: {
          id: true,
          date: true,
          dayOfWeek: true,
          role: true,
          label: true,
          startTime: true,
          endTime: true,
        },
      },
      assignments: {
        where: { employeeId: args.employeeId },
        select: { slotId: true, actualStart: true, actualEnd: true },
      },
      trainees: {
        where: { employeeId: args.employeeId },
        select: { slotId: true },
      },
      swapOffers: {
        where: { offeredById: args.employeeId, status: "claimed" },
        select: { slotId: true, offeredStart: true, offeredEnd: true },
      },
    },
  });
  if (!week) return [];

  const slotById = new Map(week.slots.map((s) => [s.id, s]));

  const mine = week.assignments.flatMap((a) => {
    const slot = slotById.get(a.slotId);
    if (!slot) return [];
    return [
      shiftEvent({
        slotId: slot.id,
        date: slot.date,
        startTime: a.actualStart,
        endTime: a.actualEnd,
        summary: EVENT_SUMMARY,
        description: eventDescription(slot.role as Role, slot.label),
      }),
    ];
  });

  // משמרות כמתלמד — בשעות הבלוק
  const training = week.trainees.flatMap((t) => {
    const slot = slotById.get(t.slotId);
    if (!slot) return [];
    return [
      shiftEvent({
        slotId: slot.id,
        date: slot.date,
        startTime: slot.startTime,
        endTime: toSlotView(slot, week).endTime,
        summary: EVENT_SUMMARY,
        description: eventDescription(slot.role as Role, slot.label, true),
      }),
    ];
  });

  const assignedSlotIds = new Set(week.assignments.map((a) => a.slotId));
  const released = week.swapOffers.flatMap((o) => {
    // אם המשבצת חזרה אליו איכשהו, היא כבר ברשימה למעלה כאירוע פעיל
    if (assignedSlotIds.has(o.slotId)) return [];
    const slot = slotById.get(o.slotId);
    if (!slot) return [];
    return [
      shiftEvent({
        slotId: slot.id,
        date: slot.date,
        startTime: o.offeredStart,
        endTime: o.offeredEnd,
        summary: EVENT_SUMMARY,
        description: eventDescription(slot.role as Role, slot.label),
        cancelled: true,
      }),
    ];
  });

  return args.includeReleased === false ? [...mine, ...training] : [...mine, ...training, ...released];
}

/** מוסר משמרת. השעות שיוצעו הן תמיד המשבצת המלאה — ראה offeredHours. */
export async function openSwapOffer(args: {
  employeeId: string;
  slotId: string;
  now?: Date;
}): Promise<void> {
  const now = args.now ?? new Date();

  const slot = await prisma.weekSlot.findUnique({
    where: { id: args.slotId },
    include: { week: true, assignment: true },
  });
  if (!slot) throw new SwapError("המשמרת לא נמצאה");

  const existingOpen = await prisma.swapOffer.findUnique({
    where: { openSlotId: args.slotId },
  });

  const block = offerBlock({
    weekStatus: slot.week.status,
    slot,
    assignedToId: slot.assignment?.employeeId ?? null,
    requesterId: args.employeeId,
    hasOpenOffer: Boolean(existingOpen),
    now,
  });
  if (block) throw new SwapError(OFFER_BLOCK_LABEL[block]);

  const hours = offeredHours(slot, closingTimeFor(slot.week, slot.dayOfWeek));

  try {
    await prisma.swapOffer.create({
      data: {
        weekId: slot.weekId,
        slotId: slot.id,
        offeredById: args.employeeId,
        status: "open",
        // המפתח שמבטיח הצעה פתוחה אחת למשבצת — ראה ההערה בסכימה
        openSlotId: slot.id,
        offeredStart: hours.start,
        offeredEnd: hours.end,
      },
    });
  } catch {
    // התנגשות על openSlotId: לחיצה כפולה, או מישהו הספיק בין הבדיקה ליצירה
    throw new SwapError(OFFER_BLOCK_LABEL["already-offered"]);
  }
}

/** מבטל הצעה שטרם נתפסה. רק מי שהציע יכול לבטל. */
export async function cancelSwapOffer(args: {
  employeeId: string;
  offerId: string;
}): Promise<void> {
  /*
   * הסיבה נקראת לפני הכתיבה כדי שההודעה תהיה מדויקת: "מישהו כבר לקח
   * וההחלטה אצל המנהל" ו"ההצעה אינה שלך" הם מצבים שונים לגמרי, ו-count=0
   * לבדו אינו יודע להבחין ביניהם.
   */
  const offer = await prisma.swapOffer.findUnique({
    where: { id: args.offerId },
    select: { status: true, offeredById: true },
  });
  if (!offer) throw new SwapError("ההצעה כבר אינה קיימת");

  const block = cancelBlock({ offer, employeeId: args.employeeId });
  if (block) throw new SwapError(CANCEL_BLOCK_LABEL[block]);

  // הכתיבה עדיין מותנית: בין הקריאה לכתיבה מישהו יכול היה לתפוס
  const cancelled = await prisma.swapOffer.updateMany({
    where: { id: args.offerId, offeredById: args.employeeId, status: "open" },
    data: { status: "cancelled", cancelledAt: new Date(), openSlotId: null },
  });
  if (cancelled.count === 0) {
    throw new SwapError(CANCEL_BLOCK_LABEL["not-open"]);
  }
}

/**
 * תופס משמרת שהוצעה. "הראשון תופס", ובלי אישור מנהל.
 *
 * שתי כתיבות מותנות (compare-and-set) הן כל המנגנון:
 * התנאי חייב לשבת בתוך הצהרת ה-UPDATE עצמה. ב-READ COMMITTED, כששתי
 * טרנזקציות נוגעות באותה שורה, השנייה נחסמת עד ה-commit של הראשונה ואז
 * מעריכה מחדש את ה-WHERE מול הגרסה החדשה — ולכן מקבלת count=0. קריאה
 * (findUnique) ואז update הייתה מאבדת בדיוק את התכונה הזו.
 */
export async function claimSwapOffer(args: {
  employeeId: string;
  offerId: string;
  now?: Date;
}): Promise<{ weekId: string; slotId: string }> {
  const now = args.now ?? new Date();

  return prisma.$transaction(async (tx) => {
    // מסדר בתור ניסיונות תפיסה של אותו עובד, כדי ששתי לשוניות פתוחות לא
    // יתפסו שתי משמרות באותו יום — בדיקת ההתנגשות היא קריאה, ו-READ
    // COMMITTED לבדו לא מגן עליה. הנעילה משוחררת בסוף הטרנזקציה מעצמה.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${args.employeeId}))`;

    const offer = await tx.swapOffer.findUnique({
      where: { id: args.offerId },
      include: { slot: { include: { week: true } } },
    });
    if (!offer) throw new SwapError("ההצעה כבר אינה קיימת");

    const claimer = await tx.employee.findUnique({
      where: { id: args.employeeId },
      select: { id: true, roles: true, active: true },
    });
    if (!claimer?.active) throw new SwapError("הקישור אינו תקין");

    const myAssignments = await tx.assignment.findMany({
      where: { weekId: offer.weekId, employeeId: claimer.id },
      select: { slot: { select: { dayOfWeek: true } } },
    });

    // אותה פונקציה בדיוק שסיננה את הרשימה על המסך
    const block = claimBlock({
      offer,
      slot: { ...offer.slot, role: offer.slot.role as Role },
      claimer,
      claimerAssignedDays: myAssignments.map((a) => a.slot.dayOfWeek),
      now,
    });
    if (block) throw new SwapError(CLAIM_BLOCK_LABEL[block]);

    /*
     * CAS — ההצעה עוברת ל-pending. count=0 פירושו שמישהו הקדים.
     *
     * `openSlotId` **נשאר** לא-null: האינדקס הייחודי עליו הוא מה שסוגר את
     * המשבצת בפני תופס שני, וזה נאכף במסד ולא בקוד. הוא מתאפס רק באישור.
     */
    const taken = await tx.swapOffer.updateMany({
      where: { id: offer.id, status: "open" },
      data: { status: "pending", claimedById: claimer.id, claimedAt: now },
    });
    if (taken.count === 0) throw new SwapError(CLAIM_BLOCK_LABEL["not-open"]);

    /*
     * השיבוץ **אינו** זז כאן. עד שהמנהל יאשר, המשמרת רשומה על מי שהציע
     * אותה — כך שהסידור תמיד מראה מי באמת אמור להגיע, ודחייה אינה דורשת
     * להחזיר שיבוץ אחורה. ההעברה קורית ב-decideSwapOffer.
     */
    return { weekId: offer.weekId, slotId: offer.slotId };
  });
}

/**
 * המנהל מאשר או דוחה תפיסה.
 *
 * אישור הוא הרגע היחיד שבו המשמרת באמת עוברת. הבדיקות של התופס נבדקות
 * **מחדש** כאן ולא רק בזמן התפיסה: בין התפיסה להחלטה הוא עלול היה לקבל
 * משמרת אחרת באותו יום, או שהמנהל שיבץ מישהו אחר למשבצת.
 */
export async function decideSwapOffer(args: {
  offerId: string;
  managerId: string;
  approve: boolean;
  now?: Date;
}): Promise<{ weekId: string; slotId: string; claimerId: string }> {
  const now = args.now ?? new Date();

  return prisma.$transaction(async (tx) => {
    const offer = await tx.swapOffer.findUnique({
      where: { id: args.offerId },
      include: { slot: true },
    });
    if (!offer) throw new SwapError("ההצעה כבר אינה קיימת");

    const block = decisionBlock(offer);
    if (block) throw new SwapError(DECISION_BLOCK_LABEL[block]);
    if (!offer.claimedById) throw new SwapError("אין מי שתפס את ההצעה");
    const claimerId = offer.claimedById;

    if (!args.approve) {
      // דחייה — ההצעה חוזרת ללוח כפתוחה, ומי שתפס משוחרר
      const back = await tx.swapOffer.updateMany({
        where: { id: offer.id, status: "pending" },
        data: {
          status: "open",
          claimedById: null,
          claimedAt: null,
          decidedById: args.managerId,
          decidedAt: now,
        },
      });
      if (back.count === 0) throw new SwapError("ההצעה כבר הוכרעה");
      return { weekId: offer.weekId, slotId: offer.slotId, claimerId };
    }

    // ההתנגשות נבדקת מחדש: התופס עשוי היה לקבל משמרת נוספת מאז
    const conflict = await tx.assignment.findFirst({
      where: {
        weekId: offer.weekId,
        employeeId: claimerId,
        slot: { dayOfWeek: offer.slot.dayOfWeek },
        NOT: { slotId: offer.slotId },
      },
      select: { id: true },
    });
    if (conflict) {
      throw new SwapError(
        "מי שתפס כבר משובץ ביום הזה מאז שתפס. יש לדחות את הבקשה.",
      );
    }

    const decided = await tx.swapOffer.updateMany({
      where: { id: offer.id, status: "pending" },
      data: {
        status: "claimed",
        openSlotId: null,
        decidedById: args.managerId,
        decidedAt: now,
      },
    });
    if (decided.count === 0) throw new SwapError("ההצעה כבר הוכרעה");

    /*
     * CAS על השיבוץ. תנאי ה-employeeId מוודא שהמשבצת עדיין של מי שהציע:
     * אם המנהל שיבץ בינתיים מישהו אחר, count=0 והכול מתגלגל אחורה.
     *
     * pinned חיוני ולא נוי: buildSchedule מוחק כל שיבוץ עם pinned=false,
     * ובלעדיו לחיצה אחת על "בניית סידור" הייתה מוחקת כל חילוף בשבוע.
     */
    const moved = await tx.assignment.updateMany({
      where: { slotId: offer.slotId, employeeId: offer.offeredById },
      data: {
        employeeId: claimerId,
        actualStart: offer.offeredStart,
        actualEnd: offer.offeredEnd,
        shortened: false,
        shortenedApproved: true,
        manualOverride: true,
        pinned: true,
      },
    });
    if (moved.count === 0) {
      throw new SwapError("המשמרת כבר אינה משובצת למי שהציע אותה");
    }

    return { weekId: offer.weekId, slotId: offer.slotId, claimerId };
  });
}

/**
 * לתצוגת המנהל: כל ההצעות של השבוע, עם סימון אילו מהן עדיין פתוחות ובתוקף.
 * הצעה שחלף עליה החתך אינה "פתוחה" יותר — הפקיעה נגזרת מהשעון.
 *
 * `risks` הוא הצד השני של ההחלטה שהמסירה מסננת רק לפי תפקיד והתנגשות:
 * הכללים שהיא *לא* אוכפת — מכסת המשמרות וזוגות שאסור לשבץ יחד — נבדקים
 * כאן בדיעבד ומוצגים למנהל. לא חוסמים, רק מספרים.
 */
export async function loadWeekSwaps(weekId: string, now: Date = new Date()) {
  const [week, employees, constraints] = await Promise.all([
    prisma.week.findUnique({
      where: { id: weekId },
      select: {
        slots: { select: { id: true, dayOfWeek: true, role: true } },
        assignments: {
          select: { slotId: true, employeeId: true, actualStart: true, actualEnd: true },
        },
        swapOffers: {
          orderBy: { createdAt: "desc" },
          select: {
            id: true,
            slotId: true,
            status: true,
            offeredStart: true,
            offeredEnd: true,
            claimedAt: true,
            offeredBy: { select: { id: true, fullName: true } },
            claimedBy: { select: { id: true, fullName: true } },
            slot: {
              select: { dayOfWeek: true, date: true, startTime: true, endTime: true, role: true },
            },
          },
        },
      },
    }),
    prisma.employee.findMany({
      select: { id: true, fullName: true, maxShifts: true },
    }),
    prisma.pairConstraint.findMany({ where: { hard: true } }),
  ]);
  if (!week) return { pending: [], awaiting: [], done: [] };

  const employeeById = new Map(employees.map((e) => [e.id, e]));
  const slotById = new Map(week.slots.map((s) => [s.id, s]));

  /** הכללים שהמסירה מדלגת עליהם במכוון — נבדקים כאן רק כדי לדווח */
  function risksFor(claimerId: string, slotId: string): string[] {
    const claimer = employeeById.get(claimerId);
    const slot = slotById.get(slotId);
    if (!claimer || !slot) return [];

    const out: string[] = [];

    const mine = week!.assignments.filter((a) => a.employeeId === claimerId);
    if (mine.length > claimer.maxShifts) {
      out.push(`${mine.length} משמרות מול מכסה של ${claimer.maxShifts}`);
    }

    const taken = week!.assignments.find((a) => a.slotId === slotId);
    for (const c of constraints) {
      const otherId = c.aId === claimerId ? c.bId : c.bId === claimerId ? c.aId : null;
      if (!otherId) continue;
      for (const a of week!.assignments) {
        if (a.employeeId !== otherId) continue;
        const otherSlot = slotById.get(a.slotId);
        if (otherSlot?.dayOfWeek !== slot.dayOfWeek) continue;
        const clash =
          c.scope === "sameDay" ||
          (taken !== undefined &&
            overlaps(
              { start: toMinutes(taken.actualStart), end: toMinutes(taken.actualEnd) },
              { start: toMinutes(a.actualStart), end: toMinutes(a.actualEnd) },
            ));
        if (clash) {
          out.push(`משובץ עם ${employeeById.get(otherId)?.fullName ?? "עובד"}`);
          break;
        }
      }
    }
    return out;
  }

  const pending = week.swapOffers
    .filter((o) => o.status === "open" && isBeforeCutoff(o.slot, now))
    .map((o) => ({
      id: o.id,
      slotId: o.slotId,
      dayOfWeek: o.slot.dayOfWeek,
      role: o.slot.role as Role,
      start: o.offeredStart,
      end: o.offeredEnd,
      offeredBy: o.offeredBy.fullName,
      hoursLeft: Math.floor(
        (shiftStartsAt(o.slot).getTime() - now.getTime()) / 3_600_000,
      ),
    }));

  /*
   * ממתינות להכרעה — הלב של מסך המנהל.
   *
   * `risks` נבנה כאן ולא בעת האישור, כי זה בדיוק מה שהמנהל צריך לראות
   * *לפני* שהוא מחליט: המסירה מסננת רק לפי תפקיד והתנגשות, וכל השאר
   * (סגירה, מנוחה, "לא עובדים יחד") מוצג לו כאן.
   */
  const awaiting = week.swapOffers
    .filter((o) => o.status === "pending" && o.claimedBy)
    .map((o) => ({
      id: o.id,
      slotId: o.slotId,
      dayOfWeek: o.slot.dayOfWeek,
      role: o.slot.role as Role,
      start: o.offeredStart,
      end: o.offeredEnd,
      from: o.offeredBy.fullName,
      to: o.claimedBy!.fullName,
      risks: risksFor(o.claimedBy!.id, o.slotId),
    }));

  const done = week.swapOffers
    .filter((o) => o.status === "claimed" && o.claimedBy)
    .map((o) => ({
      id: o.id,
      slotId: o.slotId,
      dayOfWeek: o.slot.dayOfWeek,
      role: o.slot.role as Role,
      start: o.offeredStart,
      end: o.offeredEnd,
      from: o.offeredBy.fullName,
      to: o.claimedBy!.fullName,
      risks: risksFor(o.claimedBy!.id, o.slotId),
    }));

  return { pending, awaiting, done };
}
