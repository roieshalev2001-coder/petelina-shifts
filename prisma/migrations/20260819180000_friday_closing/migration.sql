-- סגירה בשישי כסבב בפני עצמו. ראה src/lib/fridays.ts
-- נכתבה ידנית מאותה סיבה כמו 20260819120000.

-- AlterTable
ALTER TABLE "FridayPlan" ADD COLUMN "isClosing" BOOLEAN NOT NULL DEFAULT false;
