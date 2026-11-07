-- מתלמד שמצטרף לבלוק של עובד רגיל בשבוע אחד (ראה TraineeAssignment בסכימה).
--
-- נכתבה ידנית, כמו המיגרציות שלפניה: `migrate diff` משווה מול מסד הייצור,
-- והוא עלול לשכפל לכאן מיגרציה שטרם הוחלה שם.
--
-- טבלה חדשה בלבד — שום דבר קיים לא משתנה, ולכן בטוח להחיל אותה לפני
-- שהקוד שמשתמש בה עולה. התפקידים של המתלמדים נשמרים בעמודת roles הקיימת.

-- CreateTable
CREATE TABLE "TraineeAssignment" (
    "id" TEXT NOT NULL,
    "weekId" TEXT NOT NULL,
    "slotId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TraineeAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TraineeAssignment_slotId_key" ON "TraineeAssignment"("slotId");

-- CreateIndex
CREATE INDEX "TraineeAssignment_weekId_employeeId_idx" ON "TraineeAssignment"("weekId", "employeeId");

-- AddForeignKey
ALTER TABLE "TraineeAssignment" ADD CONSTRAINT "TraineeAssignment_weekId_fkey" FOREIGN KEY ("weekId") REFERENCES "Week"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TraineeAssignment" ADD CONSTRAINT "TraineeAssignment_slotId_fkey" FOREIGN KEY ("slotId") REFERENCES "WeekSlot"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TraineeAssignment" ADD CONSTRAINT "TraineeAssignment_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;
