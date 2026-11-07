-- חילופים על סבב שישי.
-- נכתבה ידנית מאותה סיבה כמו 20260819120000 — ראה ההערה שם.
--
-- טבלה נפרדת מ-SwapOffer ולא הרחבה שלה: SwapOffer תלוי ב-WeekSlot, ושישי
-- בעוד חודש הוא רק שורת FridayPlan — אין לו משבצת ואין לו שיבוץ.

-- CreateTable
CREATE TABLE "FridaySwap" (
    "id" TEXT NOT NULL,
    "mode" TEXT NOT NULL DEFAULT 'give',
    "offeredPlanId" TEXT NOT NULL,
    "offeredById" TEXT NOT NULL,
    "claimedById" TEXT,
    "claimedPlanId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'open',
    "openPlanId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "claimedAt" TIMESTAMP(3),
    "decidedAt" TIMESTAMP(3),

    CONSTRAINT "FridaySwap_pkey" PRIMARY KEY ("id")
);

-- הצעה פתוחה אחת לכל שיבוץ. NULL אינו נספר כהתנגשות, ולכן ההיסטוריה חופשית.
CREATE UNIQUE INDEX "FridaySwap_openPlanId_key" ON "FridaySwap"("openPlanId");

-- CreateIndex
CREATE INDEX "FridaySwap_status_idx" ON "FridaySwap"("status");

-- AddForeignKey
ALTER TABLE "FridaySwap" ADD CONSTRAINT "FridaySwap_offeredPlanId_fkey" FOREIGN KEY ("offeredPlanId") REFERENCES "FridayPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FridaySwap" ADD CONSTRAINT "FridaySwap_offeredById_fkey" FOREIGN KEY ("offeredById") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FridaySwap" ADD CONSTRAINT "FridaySwap_claimedById_fkey" FOREIGN KEY ("claimedById") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FridaySwap" ADD CONSTRAINT "FridaySwap_claimedPlanId_fkey" FOREIGN KEY ("claimedPlanId") REFERENCES "FridayPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;
