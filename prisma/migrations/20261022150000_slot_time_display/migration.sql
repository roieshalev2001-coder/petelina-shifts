-- איך השעות של בלוק מוצגות: טווח מלא, רק שעת הגעה, או רק שעת סיום.
--
-- נכתבה ידנית, כמו המיגרציות שלפניה: `migrate diff` משווה מול מסד הייצור,
-- והוא עלול לשכפל לכאן מיגרציה שטרם הוחלה שם.
--
-- ברירת מחדל "range" — כל הבלוקים הקיימים נשארים בדיוק כמו היום. תצוגה
-- בלבד: שתי השעות נשמרות תמיד. בטוח להחיל לפני שהקוד שמשתמש בה עולה.

-- AlterTable
ALTER TABLE "TemplateSlot" ADD COLUMN "timeDisplay" TEXT NOT NULL DEFAULT 'range';

-- AlterTable
ALTER TABLE "WeekSlot" ADD COLUMN "timeDisplay" TEXT NOT NULL DEFAULT 'range';
