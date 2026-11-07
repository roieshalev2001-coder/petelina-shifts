-- שעת הגעה ששונתה לשישי אחד בלבד ("רק בשישי הזה" במסך סבב שישי).
--
-- נכתבה ידנית, כמו המיגרציות שלפניה: `migrate diff` משווה מול מסד הייצור,
-- והוא עלול לשכפל לכאן מיגרציה שטרם הוחלה שם.
--
-- טבלה חדשה בלבד — שום דבר קיים לא משתנה, ולכן בטוח להחיל אותה לפני
-- שהקוד שמשתמש בה עולה.

-- CreateTable
CREATE TABLE "FridayTimeOverride" (
    "id" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "role" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "startTime" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FridayTimeOverride_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "FridayTimeOverride_date_role_position_key" ON "FridayTimeOverride"("date", "role", "position");
