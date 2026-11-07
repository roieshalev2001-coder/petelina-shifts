-- CreateTable
CREATE TABLE "Employee" (
    "id" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "phone" TEXT,
    "roles" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "token" TEXT NOT NULL,
    "needsReview" BOOLEAN NOT NULL DEFAULT false,
    "requiredShifts" INTEGER NOT NULL DEFAULT 0,
    "maxShifts" INTEGER NOT NULL DEFAULT 6,
    "canClose" BOOLEAN NOT NULL DEFAULT false,
    "seniority" INTEGER NOT NULL DEFAULT 3,
    "preferredPeriod" TEXT,
    "privateNotes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Employee_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PairConstraint" (
    "id" TEXT NOT NULL,
    "aId" TEXT NOT NULL,
    "bId" TEXT NOT NULL,
    "scope" TEXT NOT NULL DEFAULT 'overlapping',
    "hard" BOOLEAN NOT NULL DEFAULT true,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PairConstraint_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TemplateSlot" (
    "id" TEXT NOT NULL,
    "dayOfWeek" INTEGER NOT NULL,
    "role" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "startTime" TEXT NOT NULL,
    "endTime" TEXT NOT NULL,
    "label" TEXT,
    "sortOrder" INTEGER NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "fixedStart" BOOLEAN NOT NULL DEFAULT false,
    "fixedEnd" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "TemplateSlot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Week" (
    "id" TEXT NOT NULL,
    "weekStart" TIMESTAMP(3) NOT NULL,
    "opensAt" TIMESTAMP(3) NOT NULL,
    "deadline" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "closingTimes" TEXT NOT NULL DEFAULT '{}',
    "publishedAt" TIMESTAMP(3),
    "lastReport" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Week_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WeekSlot" (
    "id" TEXT NOT NULL,
    "weekId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "dayOfWeek" INTEGER NOT NULL,
    "role" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "startTime" TEXT NOT NULL,
    "endTime" TEXT NOT NULL,
    "label" TEXT,
    "sortOrder" INTEGER NOT NULL,
    "fixedStart" BOOLEAN NOT NULL DEFAULT false,
    "fixedEnd" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "WeekSlot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Submission" (
    "id" TEXT NOT NULL,
    "weekId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "submittedAt" TIMESTAMP(3),
    "note" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Submission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Availability" (
    "id" TEXT NOT NULL,
    "weekId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "slotId" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "earliestStart" TEXT,
    "latestEnd" TEXT,
    "note" TEXT,

    CONSTRAINT "Availability_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Assignment" (
    "id" TEXT NOT NULL,
    "weekId" TEXT NOT NULL,
    "slotId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "actualStart" TEXT NOT NULL,
    "actualEnd" TEXT NOT NULL,
    "shortened" BOOLEAN NOT NULL DEFAULT false,
    "shortenedApproved" BOOLEAN NOT NULL DEFAULT false,
    "manualOverride" BOOLEAN NOT NULL DEFAULT false,
    "pinned" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Assignment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Employee_token_key" ON "Employee"("token");

-- CreateIndex
CREATE UNIQUE INDEX "PairConstraint_aId_bId_key" ON "PairConstraint"("aId", "bId");

-- CreateIndex
CREATE INDEX "TemplateSlot_dayOfWeek_sortOrder_idx" ON "TemplateSlot"("dayOfWeek", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "Week_weekStart_key" ON "Week"("weekStart");

-- CreateIndex
CREATE INDEX "WeekSlot_weekId_dayOfWeek_sortOrder_idx" ON "WeekSlot"("weekId", "dayOfWeek", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "Submission_weekId_employeeId_key" ON "Submission"("weekId", "employeeId");

-- CreateIndex
CREATE INDEX "Availability_weekId_employeeId_idx" ON "Availability"("weekId", "employeeId");

-- CreateIndex
CREATE UNIQUE INDEX "Availability_employeeId_slotId_key" ON "Availability"("employeeId", "slotId");

-- CreateIndex
CREATE UNIQUE INDEX "Assignment_slotId_key" ON "Assignment"("slotId");

-- CreateIndex
CREATE INDEX "Assignment_weekId_employeeId_idx" ON "Assignment"("weekId", "employeeId");

-- AddForeignKey
ALTER TABLE "PairConstraint" ADD CONSTRAINT "PairConstraint_aId_fkey" FOREIGN KEY ("aId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PairConstraint" ADD CONSTRAINT "PairConstraint_bId_fkey" FOREIGN KEY ("bId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WeekSlot" ADD CONSTRAINT "WeekSlot_weekId_fkey" FOREIGN KEY ("weekId") REFERENCES "Week"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Submission" ADD CONSTRAINT "Submission_weekId_fkey" FOREIGN KEY ("weekId") REFERENCES "Week"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Submission" ADD CONSTRAINT "Submission_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Availability" ADD CONSTRAINT "Availability_weekId_fkey" FOREIGN KEY ("weekId") REFERENCES "Week"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Availability" ADD CONSTRAINT "Availability_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Availability" ADD CONSTRAINT "Availability_slotId_fkey" FOREIGN KEY ("slotId") REFERENCES "WeekSlot"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Assignment" ADD CONSTRAINT "Assignment_weekId_fkey" FOREIGN KEY ("weekId") REFERENCES "Week"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Assignment" ADD CONSTRAINT "Assignment_slotId_fkey" FOREIGN KEY ("slotId") REFERENCES "WeekSlot"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Assignment" ADD CONSTRAINT "Assignment_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;
