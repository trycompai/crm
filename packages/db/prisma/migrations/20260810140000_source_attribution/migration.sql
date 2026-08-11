-- AlterTable
ALTER TABLE "trackedEvent" ADD COLUMN "source" TEXT;
ALTER TABLE "trackedEvent" ADD COLUMN "medium" TEXT;
ALTER TABLE "trackedEvent" ADD COLUMN "campaign" TEXT;

-- CreateIndex
CREATE INDEX "trackedEvent_source_occurredAt_idx" ON "trackedEvent"("source", "occurredAt");

-- AlterTable
ALTER TABLE "formSubmission" ADD COLUMN "firstTouch" JSONB;
ALTER TABLE "formSubmission" ADD COLUMN "lastTouch" JSONB;

-- AlterTable
ALTER TABLE "trackedVisitor" ADD COLUMN "firstSource" TEXT;
ALTER TABLE "trackedVisitor" ADD COLUMN "firstMedium" TEXT;
ALTER TABLE "trackedVisitor" ADD COLUMN "firstCampaign" TEXT;
ALTER TABLE "trackedVisitor" ADD COLUMN "firstTerm" TEXT;
ALTER TABLE "trackedVisitor" ADD COLUMN "firstContent" TEXT;
ALTER TABLE "trackedVisitor" ADD COLUMN "firstReferrer" TEXT;
ALTER TABLE "trackedVisitor" ADD COLUMN "firstLanding" TEXT;
ALTER TABLE "trackedVisitor" ADD COLUMN "firstTouchAt" TIMESTAMP(3);
ALTER TABLE "trackedVisitor" ADD COLUMN "lastSource" TEXT;
ALTER TABLE "trackedVisitor" ADD COLUMN "lastMedium" TEXT;
ALTER TABLE "trackedVisitor" ADD COLUMN "lastCampaign" TEXT;
ALTER TABLE "trackedVisitor" ADD COLUMN "lastTerm" TEXT;
ALTER TABLE "trackedVisitor" ADD COLUMN "lastContent" TEXT;
ALTER TABLE "trackedVisitor" ADD COLUMN "lastReferrer" TEXT;
ALTER TABLE "trackedVisitor" ADD COLUMN "lastLanding" TEXT;
ALTER TABLE "trackedVisitor" ADD COLUMN "lastTouchAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "trackedVisitor_firstSource_idx" ON "trackedVisitor"("firstSource");
