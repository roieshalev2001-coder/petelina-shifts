import { notFound } from "next/navigation";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Field,
  LinkButton,
  Notice,
  Num,
  PageHeader,
  RoleDot,
  ShareIcon,
  inputClass,
} from "@/components/ui";
import { TabBar, type Tab } from "@/components/TabBar";
import { ScheduleTable, type CellAssignment } from "@/components/ScheduleTable";
import type { GridSlot } from "@/lib/grid";
import { DialogDemo } from "./DialogDemo";
import { Hero, type HeroFocus } from "@/app/me/Hero";
import { WeekRows, type WeekRow } from "@/app/me/WeekRows";

/**
 * מסך תצוגה, לפיתוח בלבד.
 *
 * למה זה קיים: כל מסך באתר יושב מאחורי כניסה, ולכן אי אפשר לבדוק עיצוב
 * בלי קוד של עובד אמיתי. בלי המסך הזה כל שינוי חזותי הוא ניחוש שמאומת
 * בצילום מסך מרואי, וזה מחזור עבודה בלתי אפשרי.
 *
 * **חסום בייצור.** `notFound()` מוודא שהוא אינו קיים שם, ולכן אין כאן
 * מה לחשוף — וממילא כל הנתונים כאן מומצאים.
 */
export const metadata = { title: "תצוגה · פיתוח" };

const TABS: Tab[] = [
  { href: "/me", label: "בית", icon: "home" },
  { href: "/me/submit", label: "הגשה", icon: "submit" },
  { href: "/me/fridays", label: "שישי", icon: "calendar" },
  { href: "/me/notifications", label: "התראות", icon: "bell", dot: true },
];

const MANAGER_TABS: Tab[] = [
  { href: "/manager", label: "סידור", icon: "grid" },
  { href: "/manager/employees", label: "עובדים", icon: "people" },
  { href: "/manager/fridays", label: "שישי", icon: "calendar" },
  { href: "/manager/more", label: "עוד", icon: "more" },
];

/*
 * סידור מזויף לשבוע — שישה ימים, שלושה תפקידים, וכל המצבים שהטבלה
 * יודעת לסמן: מאויש, ריק, כיסוי חלקי, נעוץ, קוצר ומסירה פתוחה.
 *
 * שישי בנוי כמו בתבנית האמיתית: יום רציף עם שני אחמ"שים — כך נבדקים התא
 * המשותף, ושורת אחראי הערב שבשישי ממשיכה את המלצרים (ראה buildGrid).
 */
const DEMO_DAYS = [0, 1, 2, 3, 4, 5];

const WEEKDAY_SPEC: [string, string, string, string][] = [
  ["manager", "morning", "07:00", "16:00"],
  ["bartender", "morning", "07:15", "14:00"],
  ["waiter", "morning", "07:15", "15:00"],
  ["waiter", "morning", "08:45", "16:00"],
  ["manager", "evening", "16:00", "CLOSING"],
  ["waiter", "evening", "16:00", "22:15"],
  ["waiter", "evening", "16:30", "CLOSING"],
];

const FRIDAY_SPEC: [string, string, string, string][] = [
  ["manager", "allday", "07:00", "15:00"],
  ["manager", "allday", "14:00", "CLOSING"],
  ["bartender", "allday", "07:15", "14:00"],
  ["waiter", "allday", "07:15", "15:00"],
  ["waiter", "allday", "07:45", "15:00"],
  ["waiter", "allday", "08:00", "15:30"],
  ["waiter", "allday", "08:15", "16:00"],
];

const DEMO_SLOTS: GridSlot[] = DEMO_DAYS.flatMap((day) =>
  (day === 5 ? FRIDAY_SPEC : WEEKDAY_SPEC).map(([role, period, startTime, endTime], i) => ({
    id: `d${day}-${i}`,
    dayOfWeek: day,
    role,
    period,
    startTime,
    endTime,
    label: null,
    sortOrder: i,
  })),
);

/*
 * שמות של ממלא מקום בלבד. הדף מצהיר שכל הנתונים בו מומצאים, ולכן אסור
 * שיופיע כאן שם של עובד אמיתי. השם הארוך בודק שבירת שורה בכרטיס.
 */
const DEMO_NAMES = [
  "עובד א׳",
  "עובדת ב׳",
  "עובד ג׳ עם שם משפחה ארוך",
  "עובדת ד׳",
  "עובד ה׳",
  "עובדת ו׳",
];

/*
 * הנתונים הכי גרועים — break-ui.
 *
 * כל ערך כאן אפשרי במציאות: שמות משפחה כפולים ועם גרש, שם של שתי אותיות,
 * תוספת בסוגריים כמו שהמנהל כותב כדי להבדיל בין שני נועם, טווח שבוע
 * שחוצה שנה, המחרוזות הארוכות ביותר שהגיבור מייצר ("פחות משעה",
 * "צהריים טובים"). שום "אאאאאא" — ערך שלא יכול לקרות לא מוכיח כלום.
 */
const WORST_NAMES = [
  "אלכסנדרה ויסנייבסקה-קובלצ'יק",
  "יו",
  "מוחמד אבו-אלהיג'א",
  "נועם (ברמן)",
  "קונסטנטינוס פפדופולוס",
  "ניר",
];

type DataSet = "demo" | "worst" | "empty";

const HERO_DATA: Record<DataSet, { greeting: string; firstName: string; focuses: HeroFocus[] }> = {
  demo: {
    greeting: "ערב טוב",
    firstName: "עובדת",
    focuses: [
      { kind: "deadline", weekId: "w1", weekLabel: "18/10–23/10", amount: "2", unit: "ימים" },
      { kind: "next-shift", day: "מחר", date: "16/10", hours: "16:00–23:00" },
      { kind: "submitted", weekId: "w1", weekLabel: "18/10–23/10", marks: 7 },
    ],
  },
  worst: {
    greeting: "צהריים טובים",
    firstName: "אלכסנדרינה",
    focuses: [
      { kind: "deadline", weekId: "w1", weekLabel: "28/12–2/1", amount: "פחות", unit: "משעה" },
      {
        kind: "next-shift",
        day: "חמישי",
        date: "31/12",
        hours: "16:30–23:30",
        submitted: { weekId: "w2", weekLabel: "28/12–2/1" },
      },
      { kind: "submitted", weekId: "w1", weekLabel: "28/12–2/1", marks: 0 },
      { kind: "submitted", weekId: "w1", weekLabel: "28/12–2/1", marks: 1 },
    ],
  },
  empty: { greeting: "לילה טוב", firstName: "יו", focuses: [{ kind: "calm" }] },
};

const WEEK_ROWS: Record<DataSet, WeekRow[]> = {
  demo: [
    { id: "a", label: "25/10–30/10", accepting: true, submitted: false, myMarks: 0, deadline: "23.10.2026, 20:00" },
    { id: "b", label: "11/10–16/10", accepting: false, submitted: true, myMarks: 6, deadline: "9.10.2026, 20:00" },
  ],
  worst: [
    { id: "a", label: "28/12–2/1", accepting: true, submitted: false, myMarks: 0, deadline: "31.12.2026, 23:59" },
    { id: "b", label: "4/1–9/1", accepting: true, submitted: true, myMarks: 31, deadline: "1.1.2027, 20:00" },
    { id: "c", label: "11/1–16/1", accepting: true, submitted: false, myMarks: 0, deadline: "8.1.2027, 20:00" },
    { id: "d", label: "21/12–26/12", accepting: false, submitted: false, myMarks: 0, deadline: "18.12.2026, 20:00" },
    { id: "e", label: "14/12–19/12", accepting: false, submitted: true, myMarks: 1, deadline: "11.12.2026, 20:00" },
  ],
  empty: [],
};

const assignmentsFor = (names: string[]): CellAssignment[] => DEMO_SLOTS.flatMap((s, i) => {
  // כל משבצת שביעית נשארת ריקה, כדי שייראו גם המצבים החריגים
  if (i % 7 === 3) return [];
  const shortened = i % 11 === 5;
  return [
    {
      slotId: s.id,
      employeeId: `e${i}`,
      employeeName: names[i % names.length],
      actualStart: s.startTime,
      actualEnd: shortened ? "14:30" : s.endTime,
      shortened,
      shortenedApproved: false,
      pinned: i % 9 === 2,
      manualOverride: false,
    },
  ];
});

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-8">
      <h2 className="mb-3 text-xs font-semibold tracking-wide text-muted">
        {title}
      </h2>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

export default async function PreviewPage({ searchParams }: PageProps<"/preview">) {
  if (process.env.NODE_ENV === "production") notFound();

  /*
   * `?nav=manager` מחליף את סט הלשוניות. הסרגל מקובע לתחתית המסך ולכן
   * אי אפשר להציג שניים זה לצד זה, וציור עותק סטטי היה מציג משהו שאינו
   * הרכיב האמיתי — בדיוק מה שבדיקה חזותית אמורה למנוע.
   */
  const params = await searchParams;
  const manager = params.nav === "manager";
  const data: DataSet =
    params.data === "worst" || params.data === "empty" ? params.data : "demo";
  const hero = HERO_DATA[data];
  const scheduleNames = data === "worst" ? WORST_NAMES : DEMO_NAMES;
  /** אותה כתובת עם מערך נתונים אחר — `nav` נשמר */
  const dataHref = (d: DataSet) =>
    `/preview?${new URLSearchParams({ ...(manager ? { nav: "manager" } : {}), ...(d === "demo" ? {} : { data: d }) })}`;

  return (
    <div className="mx-auto max-w-3xl px-4 py-5">
      <PageHeader
        title="תצוגת רכיבים"
        subtitle={
          <>
            פיתוח בלבד. כל הנתונים כאן מומצאים, והמסך אינו קיים בייצור.{" "}
            <a
              className="underline"
              href={manager ? "/preview" : "/preview?nav=manager"}
            >
              {manager ? "לסרגל העובד" : "לסרגל הניהול"}
            </a>
          </>
        }
      />

      <Section title="בית העובד — הגיבור, בכל אחד מהמצבים">
        {hero.focuses.map((focus, i) => (
          <Hero
            key={i}
            tucked={false}
            greeting={hero.greeting}
            firstName={hero.firstName}
            focus={focus}
          />
        ))}
        <WeekRows rows={WEEK_ROWS[data]} />
      </Section>

      <Section title="כפתורים">
        <Card className="space-y-3">
          <div className="flex flex-wrap gap-2">
            <Button>ראשי</Button>
            <Button variant="secondary">משני</Button>
            <Button variant="danger">מסוכן</Button>
            <Button variant="ghost">שקוף</Button>
            <Button size="sm" variant="secondary">קטן</Button>
            <Button disabled>מושבת</Button>
          </div>
          {/* בטלפון הפעולה הראשית היא שורה מלאה — זה מה שנבדק כאן */}
          <Button block>פעולה ראשית לרוחב מלא</Button>
          <LinkButton href="/preview" block variant="secondary">
            קישור לרוחב מלא
          </LinkButton>
        </Card>
      </Section>

      <Section title="חלון קופץ">
        <Card>
          <DialogDemo />
        </Card>
      </Section>

      <Section title="שדות — 16px, כדי ש-iOS לא יזניק את המסך">
        <Card className="space-y-3">
          <Field label="שם מלא" hint="נראה לכל מי שרואה את הסידור">
            <input className={inputClass} defaultValue="עובדת ב׳" />
          </Field>
          <Field label="טלפון">
            <input className={`${inputClass} num`} dir="ltr" defaultValue="050-1234567" />
          </Field>
          <Field label="תפקיד">
            <select className={inputClass} defaultValue="waiter">
              <option value="waiter">מלצר</option>
              <option value="bartender">ברמן</option>
            </select>
          </Field>
        </Card>
      </Section>

      <Section title="אייקון השיתוף — ההוראה להוספה למסך הבית">
        <Card>
          <p className="text-sm">
            שתף <ShareIcon /> ← <b>הוספה למסך הבית</b>
          </p>
        </Card>
      </Section>

      <Section title="תגיות וסימונים">
        <Card className="flex flex-wrap items-center gap-2">
          <Badge>ניטרלי</Badge>
          <Badge tone="brand">נבחר</Badge>
          <Badge tone="green">אושר</Badge>
          <Badge tone="amber">סגירה</Badge>
          <Badge tone="blue">מהגיליון</Badge>
          <span className="flex items-center gap-1.5 text-sm">
            <RoleDot role="waiter" /> מלצר
          </span>
          <span className="flex items-center gap-1.5 text-sm">
            <RoleDot role="bartender" /> ברמן
          </span>
          <span className="flex items-center gap-1.5 text-sm">
            <RoleDot role="manager" /> אחמ״ש
          </span>
        </Card>
      </Section>

      <Section title="הודעות">
        <Notice title="3 שובצו בשישי בלי שסימנו זמינות">
          <p className="text-sm">
            שישי הוא סבב חובה, ולכן הם שובצו לפי התור.
          </p>
        </Notice>
        <Notice tone="green" title="הסידור פורסם">
          <p className="text-sm">כל העובדים קיבלו התראה.</p>
        </Notice>
        <EmptyState title="אין כרגע שבוע פתוח להגשה" hint="תקבל הודעה כשייפתח." />
      </Section>

      <Section title="כרטיס משמרת — כמו באזור האישי">
        <Card>
          <h3 className="font-semibold">המשמרות שלי</h3>
          <ul className="mt-3 space-y-2 text-sm">
            {[
              ["ראשון", "24.8", "07:15–15:00", false],
              ["רביעי", "27.8", "16:00–22:15", false],
              // בשישי רק שעת ההגעה — ראה showsEndTime
              ["שישי", "28.8", "09:00", false],
            ].map(([day, date, hours, closing]) => (
              <li
                key={String(date)}
                className="flex flex-wrap items-center gap-2 border border-line p-3"
              >
                <span className="font-medium">{day}</span>
                <span className="num text-muted">{date}</span>
                <span className="num mr-auto">{hours}</span>
                {closing && <Badge tone="amber">סגירה</Badge>}
              </li>
            ))}
          </ul>
          <p className="mt-3 text-sm text-muted">
            סומנו <Num>14</Num> משמרות.
          </p>
        </Card>
      </Section>

      <Section title="הסידור — יום ברשימה בטלפון, גיליון בדסקטופ">
        <ScheduleTable
          weekStart="2026-08-23T00:00:00.000Z"
          slots={DEMO_SLOTS}
          assignments={data === "empty" ? [] : assignmentsFor(scheduleNames)}
          days={DEMO_DAYS}
          partialCounts={{ "d2-3": 2 }}
          swapMarks={{ "d1-4": "open", "d3-2": "done" }}
        />
      </Section>

      <Section title="שורת עובד — כרטיס בטלפון, טבלה בדסקטופ">
        <ul className="space-y-2 md:hidden">
          {[
            ["עובדת ב׳", ["מלצר"], "2 / 4", "בוקר", true],
            ["עובד א׳", ["ברמן", "אחמ״ש"], "4 / 6", "ערב", true],
            ["עובדת ד׳", ["מלצר"], "1 / 4", "—", false],
          ].map(([name, roles, quota, period, active]) => (
            <li
              key={String(name)}
              className={`border border-line bg-surface ${active ? "" : "opacity-60"}`}
            >
              <div className="space-y-2.5 p-4">
                <span className="font-semibold">
                  {name}
                  {!active && (
                    <span className="mr-2">
                      <Badge>לא פעיל</Badge>
                    </span>
                  )}
                </span>
                <div className="flex flex-wrap gap-1">
                  {(roles as string[]).map((r) => (
                    <Badge key={r} tone="blue">
                      {r}
                    </Badge>
                  ))}
                </div>
                <div className="flex flex-wrap gap-x-5 gap-y-1 text-sm text-muted">
                  <span>
                    חובה / מקס׳ <Num>{quota}</Num>
                  </span>
                  <span>העדפה {period}</span>
                </div>
                <div className="text-sm text-muted">כניסה · נשלח</div>
              </div>
              <div className="flex flex-wrap gap-1 border-t border-line px-3 py-2">
                <Button variant="ghost" size="sm">עריכה</Button>
                <Button variant="ghost" size="sm">מתן ניהול</Button>
                <Button variant="ghost" size="sm">הוצאה</Button>
              </div>
            </li>
          ))}
        </ul>
        <p className="hidden text-sm text-muted md:block">
          במסך רחב מוצגת כאן הטבלה המלאה, ללא שינוי.
        </p>
      </Section>

      {/*
        מתג הנתונים — break-ui. אפור ופשוט בכוונה: הוא כרום של כלי בדיקה,
        לא חלק מהעיצוב שנבדק. יושב מעל סרגל הלשוניות כדי לא להסתיר אותו.
      */}
      <nav
        aria-label="מערך נתונים"
        className="fixed inset-x-0 z-50 flex justify-center"
        style={{ bottom: "calc(4.25rem + env(safe-area-inset-bottom))" }}
      >
        <div className="flex gap-0.5 bg-stone-200 p-0.5 text-xs font-medium shadow">
          {(["demo", "worst", "empty"] as const).map((d) => (
            <a
              key={d}
              href={dataHref(d)}
              aria-current={d === data ? "page" : undefined}
              className={`px-3 py-1.5 ${d === data ? "bg-white text-ink" : "text-stone-600"}`}
            >
              {d === "demo" ? "נתוני דמו" : d === "worst" ? "המקרה הגרוע" : "ריק"}
            </a>
          ))}
        </div>
      </nav>

      <TabBar tabs={manager ? MANAGER_TABS : TABS} root={manager ? "/manager" : "/me"} />
    </div>
  );
}
