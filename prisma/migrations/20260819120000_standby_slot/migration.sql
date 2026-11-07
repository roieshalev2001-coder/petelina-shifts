-- משמרת כוננות (SB): אותו עובד לא משובץ אליה פעמיים באותו שבוע.
-- ראה isFeasible ב-src/lib/scheduler/candidates.ts
--
-- נכתבה ידנית ולא ב-migrate diff: ה-diff משווה מול מסד הייצור, שעדיין לא
-- קיבל את המיגרציה הקודמת, ולכן הוא היה משכפל אותה לתוך הקובץ הזה.

-- AlterTable
ALTER TABLE "TemplateSlot" ADD COLUMN "standby" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "WeekSlot" ADD COLUMN "standby" BOOLEAN NOT NULL DEFAULT false;

-- משבצות הכוננות הקיימות: מלצר 18:30–22:00 בימים א׳–ה׳.
-- מסומנות גם בתבנית וגם בשבועות שכבר נפתחו, כדי שהכלל יחול על השבוע
-- הנוכחי ולא רק על שבועות עתידיים.
UPDATE "TemplateSlot"
SET "standby" = true
WHERE "role" = 'waiter' AND "startTime" = '18:30' AND "endTime" = '22:00';

UPDATE "WeekSlot"
SET "standby" = true
WHERE "role" = 'waiter' AND "startTime" = '18:30' AND "endTime" = '22:00';
