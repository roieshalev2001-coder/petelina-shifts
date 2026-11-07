
-- AlterTable
ALTER TABLE "Employee" ADD COLUMN     "canManage" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "failedAttempts" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "lastFailedAt" TIMESTAMP(3),
ADD COLUMN     "lockedUntil" TIMESTAMP(3),
ADD COLUMN     "mustChangePasscode" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "passcodeHash" TEXT;

