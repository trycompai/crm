CREATE TYPE "OutreachVariant" AS ENUM ('A', 'B', 'C');

ALTER TYPE "EmailDraftStatus" ADD VALUE 'SENDING';

CREATE TYPE "CustomerOnboardingStatus" AS ENUM ('DISCOVERY', 'SYSTEMS', 'DATA_ACCESS', 'INGESTION', 'READY', 'LIVE');

CREATE TYPE "OnboardingItemKind" AS ENUM ('SYSTEM', 'DATA_SOURCE', 'ACCESS', 'INGESTION', 'DECISION');

CREATE TYPE "OnboardingItemStatus" AS ENUM ('NOT_STARTED', 'IN_PROGRESS', 'BLOCKED', 'COMPLETE');

ALTER TABLE "agentTask" ADD COLUMN "dealId" TEXT, ADD COLUMN "emailDraftId" TEXT;

ALTER TABLE "prospect" ADD COLUMN "emailAllowedAt" TIMESTAMP(3), ADD COLUMN "emailAllowedById" TEXT;

ALTER TABLE "emailDraft"
ADD COLUMN "prospectId" TEXT,
ADD COLUMN "experimentKey" TEXT,
ADD COLUMN "variant" "OutreachVariant",
ADD COLUMN "sequenceId" TEXT,
ADD COLUMN "sequenceStep" INTEGER,
ADD COLUMN "scheduledFor" TIMESTAMP(3),
ADD COLUMN "sendRequestedAt" TIMESTAMP(3),
ADD COLUMN "sendError" TEXT;

CREATE TABLE "customerOnboarding" (
    "id" TEXT NOT NULL,
    "dealId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "status" "CustomerOnboardingStatus" NOT NULL DEFAULT 'DISCOVERY',
    "objective" TEXT,
    "systemsSummary" TEXT,
    "dataSummary" TEXT,
    "brainPlan" TEXT,
    "agentPlannedAt" TIMESTAMP(3),
    "targetLiveAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "customerOnboarding_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "onboardingItem" (
    "id" TEXT NOT NULL,
    "onboardingId" TEXT NOT NULL,
    "kind" "OnboardingItemKind" NOT NULL,
    "status" "OnboardingItemStatus" NOT NULL DEFAULT 'NOT_STARTED',
    "name" TEXT NOT NULL,
    "details" TEXT,
    "ownerName" TEXT,
    "source" TEXT,
    "dueAt" TIMESTAMP(3),
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "onboardingItem_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "agentTask_dealId_idx" ON "agentTask"("dealId");
CREATE INDEX "agentTask_emailDraftId_idx" ON "agentTask"("emailDraftId");
CREATE INDEX "emailDraft_prospectId_status_idx" ON "emailDraft"("prospectId", "status");
CREATE INDEX "emailDraft_sequenceId_sequenceStep_idx" ON "emailDraft"("sequenceId", "sequenceStep");
CREATE INDEX "emailDraft_status_scheduledFor_idx" ON "emailDraft"("status", "scheduledFor");
CREATE UNIQUE INDEX "emailDraft_prospectId_experimentKey_sequenceStep_key" ON "emailDraft"("prospectId", "experimentKey", "sequenceStep");
CREATE INDEX "prospect_emailAllowedById_idx" ON "prospect"("emailAllowedById");
CREATE UNIQUE INDEX "customerOnboarding_dealId_key" ON "customerOnboarding"("dealId");
CREATE INDEX "customerOnboarding_companyId_status_idx" ON "customerOnboarding"("companyId", "status");
CREATE INDEX "customerOnboarding_ownerId_status_idx" ON "customerOnboarding"("ownerId", "status");
CREATE INDEX "onboardingItem_onboardingId_kind_position_idx" ON "onboardingItem"("onboardingId", "kind", "position");

ALTER TABLE "emailDraft" ADD CONSTRAINT "emailDraft_prospectId_fkey" FOREIGN KEY ("prospectId") REFERENCES "prospect"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "prospect" ADD CONSTRAINT "prospect_emailAllowedById_fkey" FOREIGN KEY ("emailAllowedById") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "customerOnboarding" ADD CONSTRAINT "customerOnboarding_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "deal"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "customerOnboarding" ADD CONSTRAINT "customerOnboarding_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "customerOnboarding" ADD CONSTRAINT "customerOnboarding_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "onboardingItem" ADD CONSTRAINT "onboardingItem_onboardingId_fkey" FOREIGN KEY ("onboardingId") REFERENCES "customerOnboarding"("id") ON DELETE CASCADE ON UPDATE CASCADE;
