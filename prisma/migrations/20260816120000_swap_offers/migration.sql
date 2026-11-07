-- CreateTable
CREATE TABLE "SwapOffer" (
    "id" TEXT NOT NULL,
    "weekId" TEXT NOT NULL,
    "slotId" TEXT NOT NULL,
    "offeredById" TEXT NOT NULL,
    "claimedById" TEXT,
    "status" TEXT NOT NULL DEFAULT 'open',
    "openSlotId" TEXT,
    "offeredStart" TEXT NOT NULL,
    "offeredEnd" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "claimedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),

    CONSTRAINT "SwapOffer_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SwapOffer_openSlotId_key" ON "SwapOffer"("openSlotId");

-- CreateIndex
CREATE INDEX "SwapOffer_weekId_status_idx" ON "SwapOffer"("weekId", "status");

-- CreateIndex
CREATE INDEX "SwapOffer_slotId_idx" ON "SwapOffer"("slotId");

-- AddForeignKey
ALTER TABLE "SwapOffer" ADD CONSTRAINT "SwapOffer_weekId_fkey" FOREIGN KEY ("weekId") REFERENCES "Week"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SwapOffer" ADD CONSTRAINT "SwapOffer_slotId_fkey" FOREIGN KEY ("slotId") REFERENCES "WeekSlot"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SwapOffer" ADD CONSTRAINT "SwapOffer_offeredById_fkey" FOREIGN KEY ("offeredById") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SwapOffer" ADD CONSTRAINT "SwapOffer_claimedById_fkey" FOREIGN KEY ("claimedById") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;
