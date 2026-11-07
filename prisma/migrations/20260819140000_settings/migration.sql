-- הגדרות כזוגות מפתח-ערך. היום: קישורי קבוצות הוואטסאפ.
-- נכתבה ידנית מאותה סיבה כמו 20260819120000 — ראה ההערה שם.

-- CreateTable
CREATE TABLE "Setting" (
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Setting_pkey" PRIMARY KEY ("key")
);
