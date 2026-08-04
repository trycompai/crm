-- Product-aware prospecting lives beside the CRM records. Candidates are
-- deliberately isolated until a rep converts a qualified prospect.

ALTER TYPE "RecordSource" ADD VALUE 'PROSPECTING';
ALTER TYPE "RecordSource" ADD VALUE 'PRODUCT_FORM';

CREATE TYPE "ProductKey" AS ENUM ('BEAMDEPLOY', 'PROPMARGIN', 'ARQUIVO_FATURAS');
CREATE TYPE "OutreachRole" AS ENUM ('VIEWER', 'REVIEWER', 'ADMIN');
CREATE TYPE "ProspectKind" AS ENUM ('COMPANY', 'INDIVIDUAL');
CREATE TYPE "ProspectStatus" AS ENUM (
    'DISCOVERED', 'ENRICHING', 'REVIEW', 'APPROVED', 'CONTACTED',
    'REPLIED', 'QUALIFIED', 'CONVERTED', 'REJECTED', 'SUPPRESSED',
    'EXPIRED'
);
CREATE TYPE "OutreachStep" AS ENUM ('FIRST_TOUCH', 'FOLLOW_UP_ONE', 'FOLLOW_UP_TWO');
CREATE TYPE "OutreachStatus" AS ENUM ('DRAFT', 'APPROVED', 'SENDING', 'SENT', 'FAILED', 'CANCELLED');
CREATE TYPE "ConsentStatus" AS ENUM ('NOT_REQUIRED', 'GRANTED', 'DENIED', 'UNKNOWN');

ALTER TABLE "user"
ADD COLUMN "outreachRole" "OutreachRole" NOT NULL DEFAULT 'VIEWER';

UPDATE "user"
SET "outreachRole" = 'ADMIN'
WHERE id = (SELECT id FROM "user" ORDER BY "createdAt" ASC, id ASC LIMIT 1);

CREATE TABLE "product" (
    "id" "ProductKey" NOT NULL,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT false,
    "discoveryDailyCap" INTEGER NOT NULL DEFAULT 0,
    "outreachDailyCap" INTEGER NOT NULL DEFAULT 0,
    "offerName" TEXT NOT NULL,
    "offerPrice" TEXT NOT NULL,
    "offerUrl" TEXT,
    "defaultLocale" TEXT NOT NULL DEFAULT 'en',
    "senderUserId" TEXT,
    "commercialReadyAt" TIMESTAMP(3),
    "nextDiscoveryAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "product_pkey" PRIMARY KEY ("id")
);

INSERT INTO "product" (
    "id", "name", "discoveryDailyCap", "outreachDailyCap",
    "offerName", "offerPrice", "defaultLocale", "updatedAt"
) VALUES
    ('BEAMDEPLOY', 'BeamDeploy', 50, 12, 'Starter', '€29/mês', 'en', CURRENT_TIMESTAMP),
    ('PROPMARGIN', 'PropMargin', 25, 7, 'Project Pass', '€49', 'pt-PT', CURRENT_TIMESTAMP),
    ('ARQUIVO_FATURAS', 'Arquivo de Faturas', 25, 6, 'Essencial', '€6,99/mês', 'pt-PT', CURRENT_TIMESTAMP);

CREATE TABLE "prospectCandidate" (
    "id" TEXT NOT NULL,
    "productId" "ProductKey" NOT NULL,
    "kind" "ProspectKind" NOT NULL,
    "status" "ProspectStatus" NOT NULL DEFAULT 'DISCOVERED',
    "name" TEXT NOT NULL,
    "companyName" TEXT,
    "domain" TEXT,
    "website" TEXT,
    "email" TEXT,
    "emailHash" TEXT,
    "countryCode" TEXT,
    "legalForm" TEXT,
    "title" TEXT,
    "source" TEXT NOT NULL,
    "sourceExternalId" TEXT,
    "sourceUrl" TEXT,
    "consentStatus" "ConsentStatus" NOT NULL DEFAULT 'UNKNOWN',
    "consentCapturedAt" TIMESTAMP(3),
    "consentPolicyVersion" TEXT,
    "consentSource" TEXT,
    "fitScore" INTEGER NOT NULL DEFAULT 0,
    "intentScore" INTEGER NOT NULL DEFAULT 0,
    "contactabilityScore" INTEGER NOT NULL DEFAULT 0,
    "totalScore" INTEGER NOT NULL DEFAULT 0,
    "scoreRationale" TEXT,
    "eligibilityReason" TEXT,
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "contactedAt" TIMESTAMP(3),
    "repliedAt" TIMESTAMP(3),
    "qualifiedAt" TIMESTAMP(3),
    "convertedCompanyId" TEXT,
    "convertedContactId" TEXT,
    "convertedDealId" TEXT,
    "retentionExpiresAt" TIMESTAMP(3),
    "lastResearchedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "prospectCandidate_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "prospectEvidence" (
    "id" TEXT NOT NULL,
    "candidateId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "detail" TEXT NOT NULL,
    "sourceUrl" TEXT NOT NULL,
    "sourceName" TEXT NOT NULL,
    "observedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "prospectEvidence_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "inboundLeadEvent" (
    "id" TEXT NOT NULL,
    "productId" "ProductKey" NOT NULL,
    "eventId" TEXT NOT NULL,
    "candidateId" TEXT NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "inboundLeadEvent_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "prospectingRun" (
    "id" TEXT NOT NULL,
    "productId" "ProductKey" NOT NULL,
    "source" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "targetCount" INTEGER NOT NULL,
    "discovered" INTEGER NOT NULL DEFAULT 0,
    "qualified" INTEGER NOT NULL DEFAULT 0,
    "costCents" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "scheduledFor" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "prospectingRun_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "prospectRunCandidate" (
    "runId" TEXT NOT NULL,
    "candidateId" TEXT NOT NULL,
    CONSTRAINT "prospectRunCandidate_pkey" PRIMARY KEY ("runId", "candidateId")
);

CREATE TABLE "outreachMessage" (
    "id" TEXT NOT NULL,
    "candidateId" TEXT NOT NULL,
    "step" "OutreachStep" NOT NULL,
    "status" "OutreachStatus" NOT NULL DEFAULT 'DRAFT',
    "recipientEmail" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "scheduledAt" TIMESTAMP(3),
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "contentHash" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "gmailMessageId" TEXT,
    "gmailThreadId" TEXT,
    "rfcMessageId" TEXT,
    "sentAt" TIMESTAMP(3),
    "failureReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "outreachMessage_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "suppressionEntry" (
    "id" TEXT NOT NULL,
    "productId" "ProductKey",
    "fingerprint" TEXT NOT NULL,
    "emailHash" TEXT,
    "domain" TEXT,
    "reason" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "suppressionEntry_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "complianceSnapshot" (
    "id" TEXT NOT NULL,
    "jurisdiction" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "checksum" TEXT NOT NULL,
    "effectiveAt" TIMESTAMP(3) NOT NULL,
    "importedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "entryCount" INTEGER NOT NULL,
    "data" JSONB NOT NULL,
    CONSTRAINT "complianceSnapshot_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "agentTask" ADD COLUMN "productId" "ProductKey";
ALTER TABLE "agentTask" ADD COLUMN "candidateId" TEXT;
ALTER TABLE "deal" ALTER COLUMN "companyId" DROP NOT NULL;
ALTER TABLE "deal" ADD COLUMN "productId" "ProductKey";

CREATE UNIQUE INDEX "prospectCandidate_productId_domain_key" ON "prospectCandidate"("productId", "domain");
CREATE UNIQUE INDEX "prospectCandidate_productId_emailHash_key" ON "prospectCandidate"("productId", "emailHash");
CREATE UNIQUE INDEX "prospectCandidate_convertedDealId_key" ON "prospectCandidate"("convertedDealId");
CREATE INDEX "prospectCandidate_productId_status_totalScore_idx" ON "prospectCandidate"("productId", "status", "totalScore");
CREATE INDEX "prospectCandidate_status_retentionExpiresAt_idx" ON "prospectCandidate"("status", "retentionExpiresAt");
CREATE UNIQUE INDEX "prospectEvidence_candidateId_kind_sourceUrl_key" ON "prospectEvidence"("candidateId", "kind", "sourceUrl");
CREATE INDEX "prospectEvidence_candidateId_observedAt_idx" ON "prospectEvidence"("candidateId", "observedAt");
CREATE UNIQUE INDEX "inboundLeadEvent_productId_eventId_key" ON "inboundLeadEvent"("productId", "eventId");
CREATE INDEX "inboundLeadEvent_candidateId_idx" ON "inboundLeadEvent"("candidateId");
CREATE UNIQUE INDEX "prospectingRun_productId_source_scheduledFor_key" ON "prospectingRun"("productId", "source", "scheduledFor");
CREATE INDEX "prospectingRun_status_scheduledFor_idx" ON "prospectingRun"("status", "scheduledFor");
CREATE INDEX "prospectRunCandidate_candidateId_idx" ON "prospectRunCandidate"("candidateId");
CREATE UNIQUE INDEX "outreachMessage_idempotencyKey_key" ON "outreachMessage"("idempotencyKey");
CREATE UNIQUE INDEX "outreachMessage_candidateId_step_key" ON "outreachMessage"("candidateId", "step");
CREATE INDEX "outreachMessage_status_scheduledAt_idx" ON "outreachMessage"("status", "scheduledAt");
CREATE UNIQUE INDEX "suppressionEntry_fingerprint_key" ON "suppressionEntry"("fingerprint");
CREATE INDEX "suppressionEntry_productId_emailHash_idx" ON "suppressionEntry"("productId", "emailHash");
CREATE INDEX "suppressionEntry_productId_domain_idx" ON "suppressionEntry"("productId", "domain");
CREATE UNIQUE INDEX "complianceSnapshot_checksum_key" ON "complianceSnapshot"("checksum");
CREATE INDEX "complianceSnapshot_jurisdiction_effectiveAt_idx" ON "complianceSnapshot"("jurisdiction", "effectiveAt");
CREATE INDEX "product_active_nextDiscoveryAt_idx" ON "product"("active", "nextDiscoveryAt");
CREATE INDEX "agentTask_productId_idx" ON "agentTask"("productId");
CREATE INDEX "agentTask_candidateId_idx" ON "agentTask"("candidateId");
CREATE INDEX "deal_productId_idx" ON "deal"("productId");

ALTER TABLE "product" ADD CONSTRAINT "product_senderUserId_fkey" FOREIGN KEY ("senderUserId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "prospectCandidate" ADD CONSTRAINT "prospectCandidate_productId_fkey" FOREIGN KEY ("productId") REFERENCES "product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "prospectCandidate" ADD CONSTRAINT "prospectCandidate_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "prospectCandidate" ADD CONSTRAINT "prospectCandidate_convertedDealId_fkey" FOREIGN KEY ("convertedDealId") REFERENCES "deal"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "prospectEvidence" ADD CONSTRAINT "prospectEvidence_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "prospectCandidate"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "inboundLeadEvent" ADD CONSTRAINT "inboundLeadEvent_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "prospectCandidate"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "prospectingRun" ADD CONSTRAINT "prospectingRun_productId_fkey" FOREIGN KEY ("productId") REFERENCES "product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "prospectRunCandidate" ADD CONSTRAINT "prospectRunCandidate_runId_fkey" FOREIGN KEY ("runId") REFERENCES "prospectingRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "prospectRunCandidate" ADD CONSTRAINT "prospectRunCandidate_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "prospectCandidate"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "outreachMessage" ADD CONSTRAINT "outreachMessage_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "prospectCandidate"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "outreachMessage" ADD CONSTRAINT "outreachMessage_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "agentTask" ADD CONSTRAINT "agentTask_productId_fkey" FOREIGN KEY ("productId") REFERENCES "product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "agentTask" ADD CONSTRAINT "agentTask_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "prospectCandidate"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "deal" ADD CONSTRAINT "deal_productId_fkey" FOREIGN KEY ("productId") REFERENCES "product"("id") ON DELETE SET NULL ON UPDATE CASCADE;
