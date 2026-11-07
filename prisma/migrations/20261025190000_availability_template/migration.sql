-- "השבוע הרגיל שלי" — תבנית זמינות לכל עובד (ראה AvailabilityTemplate בסכימה).
--
-- נכתבה ידנית, כמו המיגרציות שלפניה: `migrate diff` משווה מול מסד הייצור,
-- והוא עלול לשכפל לכאן מיגרציה שטרם הוחלה שם.
--
-- טבלה חדשה בלבד — שום דבר קיים לא משתנה, ולכן בטוח להחיל אותה לפני
-- שהקוד שמשתמש בה עולה.

-- CreateTable
CREATE TABLE "AvailabilityTemplate" (
    "employeeId" TEXT NOT NULL,
    "data" TEXT NOT NULL,
    "savedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AvailabilityTemplate_pkey" PRIMARY KEY ("employeeId")
);

-- AddForeignKey
ALTER TABLE "AvailabilityTemplate" ADD CONSTRAINT "AvailabilityTemplate_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;
