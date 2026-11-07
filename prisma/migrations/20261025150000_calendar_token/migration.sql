-- המפתח של מנוי היומן האישי לכל עובד (ראה Employee.calendarToken בסכימה).
--
-- נכתבה ידנית, כמו המיגרציות שלפניה: `migrate diff` משווה מול מסד הייצור,
-- והוא עלול לשכפל לכאן מיגרציה שטרם הוחלה שם.
--
-- עמודה חדשה וריקה בלבד — נמלאת כשעובד פותח "הוספה ליומן". בטוח להחיל
-- לפני שהקוד שמשתמש בה עולה.

-- AlterTable
ALTER TABLE "Employee" ADD COLUMN "calendarToken" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Employee_calendarToken_key" ON "Employee"("calendarToken");
