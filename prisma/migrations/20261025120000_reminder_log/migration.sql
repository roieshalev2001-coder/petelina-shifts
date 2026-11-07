-- יומן התזכורות להגשה (ראה ReminderLog בסכימה) — מה שמונע תזכורת כפולה.
--
-- נכתבה ידנית, כמו המיגרציות שלפניה: `migrate diff` משווה מול מסד הייצור,
-- והוא עלול לשכפל לכאן מיגרציה שטרם הוחלה שם.
--
-- טבלה חדשה, ומילוי לאחור מההתראות שכבר נשלחו: בלעדיו, השבוע הפתוח היה
-- נראה כאילו איש עוד לא קיבל תזכורת, והשעון היה שולח שוב. התזכורת
-- האוטומטית ("submit-reminder") נרשמת כ"יום לפני" — זה בדיוק מה שהייתה —
-- והכפתור הידני ("submit-nudge") כ"ידנית". השבוע נקרא מהכתובת שבהתראה.

-- CreateTable
CREATE TABLE "ReminderLog" (
    "id" TEXT NOT NULL,
    "weekId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "stage" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReminderLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ReminderLog_weekId_stage_idx" ON "ReminderLog"("weekId", "stage");

-- AddForeignKey
ALTER TABLE "ReminderLog" ADD CONSTRAINT "ReminderLog_weekId_fkey" FOREIGN KEY ("weekId") REFERENCES "Week"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReminderLog" ADD CONSTRAINT "ReminderLog_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill
INSERT INTO "ReminderLog" ("id", "weekId", "employeeId", "stage", "createdAt")
SELECT
    'bf' || md5(n."id"),
    w."id",
    n."employeeId",
    CASE n."kind" WHEN 'submit-reminder' THEN 'day-before' ELSE 'manual' END,
    n."createdAt"
FROM "Notification" n
JOIN "Week" w ON w."id" = substring(n."url" from 'week=([^&]+)$')
WHERE n."kind" IN ('submit-reminder', 'submit-nudge');
