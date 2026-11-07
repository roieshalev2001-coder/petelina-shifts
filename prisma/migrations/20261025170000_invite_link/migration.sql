-- קישור כניסה אישי לכל עובד (ראה Employee.inviteTokenHash בסכימה).
--
-- נכתבה ידנית, כמו המיגרציות שלפניה: `migrate diff` משווה מול מסד הייצור,
-- והוא עלול לשכפל לכאן מיגרציה שטרם הוחלה שם.
--
-- שתי עמודות חדשות וריקות — נמלאות כשהמנהל יוצר קישור. בטוח להחיל לפני
-- שהקוד שמשתמש בהן עולה; עובדים שכבר יש להם קוד לא מושפעים.

-- AlterTable
ALTER TABLE "Employee" ADD COLUMN "inviteTokenHash" TEXT;
ALTER TABLE "Employee" ADD COLUMN "inviteExpiresAt" TIMESTAMP(3);

-- CreateIndex
CREATE UNIQUE INDEX "Employee_inviteTokenHash_key" ON "Employee"("inviteTokenHash");
