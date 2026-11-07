-- סבב שישי: מדרגות הפטור, והתוכנית החודשית.
-- נכתבה ידנית מאותה סיבה כמו 20260819120000 — ראה ההערה שם.

-- AlterTable
ALTER TABLE "Employee" ADD COLUMN "fridayLimit" TEXT NOT NULL DEFAULT 'unlimited';

-- CreateTable
CREATE TABLE "FridayPlan" (
    "id" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "role" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'auto',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FridayPlan_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "FridayPlan_date_employeeId_key" ON "FridayPlan"("date", "employeeId");

-- CreateIndex
CREATE INDEX "FridayPlan_date_role_idx" ON "FridayPlan"("date", "role");

-- AddForeignKey
ALTER TABLE "FridayPlan" ADD CONSTRAINT "FridayPlan_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;
