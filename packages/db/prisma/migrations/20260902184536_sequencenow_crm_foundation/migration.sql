-- AlterTable
ALTER TABLE "agentTask" ADD COLUMN     "businessUnitId" TEXT;

-- AlterTable
ALTER TABLE "company" ADD COLUMN     "businessUnitId" TEXT;

-- AlterTable
ALTER TABLE "deal" ADD COLUMN     "businessUnitId" TEXT;

-- CreateTable
CREATE TABLE "business_unit" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "business_unit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "canonical_company" (
    "id" TEXT NOT NULL,
    "businessUnitId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "normalizedName" TEXT NOT NULL,
    "domain" TEXT,
    "phone" TEXT,
    "website" TEXT,
    "fields" JSONB,
    "verifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "canonical_company_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "person" (
    "id" TEXT NOT NULL,
    "businessUnitId" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT,
    "normalizedName" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "title" TEXT,
    "fields" JSONB,
    "verifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "person_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "company_person" (
    "companyId" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "role" TEXT,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "company_person_pkey" PRIMARY KEY ("companyId","personId")
);

-- CreateTable
CREATE TABLE "pipeline" (
    "id" TEXT NOT NULL,
    "businessUnitId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "stages" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pipeline_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "canonical_opportunity" (
    "id" TEXT NOT NULL,
    "businessUnitId" TEXT NOT NULL,
    "companyId" TEXT,
    "pipelineId" TEXT,
    "name" TEXT NOT NULL,
    "stage" TEXT NOT NULL,
    "amount" DECIMAL(14,2),
    "fields" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "canonical_opportunity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "source_record" (
    "id" TEXT NOT NULL,
    "businessUnitId" TEXT NOT NULL,
    "sourceSystem" TEXT NOT NULL,
    "sourceType" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "sourceUrl" TEXT,
    "observedAt" TIMESTAMP(3),
    "payload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "companyId" TEXT,
    "personId" TEXT,
    "opportunityId" TEXT,

    CONSTRAINT "source_record_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "record_mapping" (
    "id" TEXT NOT NULL,
    "sourceSystem" TEXT NOT NULL,
    "sourceType" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "canonicalType" TEXT NOT NULL,
    "canonicalId" TEXT NOT NULL,
    "application" TEXT,
    "applicationId" TEXT,
    "matchMethod" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "record_mapping_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "campaign" (
    "id" TEXT NOT NULL,
    "businessUnitId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "segment" JSONB,
    "template" TEXT,
    "sendingEnabled" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "campaign_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "campaign_member" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "companyId" TEXT,
    "personId" TEXT,
    "state" TEXT NOT NULL DEFAULT 'queued',
    "draft" TEXT,
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "campaign_member_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "outreach_approval" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "memberId" TEXT,
    "state" TEXT NOT NULL DEFAULT 'pending',
    "approvedBy" TEXT,
    "approvedAt" TIMESTAMP(3),
    "rejectionReason" TEXT,
    "immutableHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "outreach_approval_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "suppression_entry" (
    "id" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "normalized" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "reason" TEXT,
    "source" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "suppression_entry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agent_run_context" (
    "id" TEXT NOT NULL,
    "businessUnitId" TEXT NOT NULL,
    "agentRunId" TEXT NOT NULL,
    "budget" INTEGER NOT NULL DEFAULT 0,
    "fitScores" JSONB,
    "reasons" JSONB,
    "evidenceCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "agent_run_context_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "business_unit_key_key" ON "business_unit"("key");

-- CreateIndex
CREATE INDEX "business_unit_enabled_key_idx" ON "business_unit"("enabled", "key");

-- CreateIndex
CREATE INDEX "canonical_company_domain_idx" ON "canonical_company"("domain");

-- CreateIndex
CREATE UNIQUE INDEX "canonical_company_businessUnitId_normalizedName_key" ON "canonical_company"("businessUnitId", "normalizedName");

-- CreateIndex
CREATE INDEX "person_email_idx" ON "person"("email");

-- CreateIndex
CREATE INDEX "person_phone_idx" ON "person"("phone");

-- CreateIndex
CREATE UNIQUE INDEX "pipeline_businessUnitId_name_key" ON "pipeline"("businessUnitId", "name");

-- CreateIndex
CREATE INDEX "canonical_opportunity_businessUnitId_stage_idx" ON "canonical_opportunity"("businessUnitId", "stage");

-- CreateIndex
CREATE INDEX "source_record_businessUnitId_sourceType_idx" ON "source_record"("businessUnitId", "sourceType");

-- CreateIndex
CREATE UNIQUE INDEX "source_record_sourceSystem_sourceType_sourceId_key" ON "source_record"("sourceSystem", "sourceType", "sourceId");

-- CreateIndex
CREATE INDEX "record_mapping_canonicalType_canonicalId_idx" ON "record_mapping"("canonicalType", "canonicalId");

-- CreateIndex
CREATE UNIQUE INDEX "record_mapping_sourceSystem_sourceType_sourceId_canonicalTy_key" ON "record_mapping"("sourceSystem", "sourceType", "sourceId", "canonicalType");

-- CreateIndex
CREATE INDEX "campaign_businessUnitId_status_idx" ON "campaign"("businessUnitId", "status");

-- CreateIndex
CREATE INDEX "campaign_member_state_idx" ON "campaign_member"("state");

-- CreateIndex
CREATE UNIQUE INDEX "campaign_member_campaignId_companyId_personId_key" ON "campaign_member"("campaignId", "companyId", "personId");

-- CreateIndex
CREATE INDEX "outreach_approval_campaignId_state_idx" ON "outreach_approval"("campaignId", "state");

-- CreateIndex
CREATE UNIQUE INDEX "suppression_entry_normalized_kind_key" ON "suppression_entry"("normalized", "kind");

-- CreateIndex
CREATE INDEX "agent_run_context_businessUnitId_createdAt_idx" ON "agent_run_context"("businessUnitId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "agent_run_context_agentRunId_key" ON "agent_run_context"("agentRunId");

-- AddForeignKey
ALTER TABLE "company" ADD CONSTRAINT "company_businessUnitId_fkey" FOREIGN KEY ("businessUnitId") REFERENCES "business_unit"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agentTask" ADD CONSTRAINT "agentTask_businessUnitId_fkey" FOREIGN KEY ("businessUnitId") REFERENCES "business_unit"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deal" ADD CONSTRAINT "deal_businessUnitId_fkey" FOREIGN KEY ("businessUnitId") REFERENCES "business_unit"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "canonical_company" ADD CONSTRAINT "canonical_company_businessUnitId_fkey" FOREIGN KEY ("businessUnitId") REFERENCES "business_unit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "person" ADD CONSTRAINT "person_businessUnitId_fkey" FOREIGN KEY ("businessUnitId") REFERENCES "business_unit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "company_person" ADD CONSTRAINT "company_person_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "canonical_company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "company_person" ADD CONSTRAINT "company_person_personId_fkey" FOREIGN KEY ("personId") REFERENCES "person"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pipeline" ADD CONSTRAINT "pipeline_businessUnitId_fkey" FOREIGN KEY ("businessUnitId") REFERENCES "business_unit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "canonical_opportunity" ADD CONSTRAINT "canonical_opportunity_businessUnitId_fkey" FOREIGN KEY ("businessUnitId") REFERENCES "business_unit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "canonical_opportunity" ADD CONSTRAINT "canonical_opportunity_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "canonical_company"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "canonical_opportunity" ADD CONSTRAINT "canonical_opportunity_pipelineId_fkey" FOREIGN KEY ("pipelineId") REFERENCES "pipeline"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "source_record" ADD CONSTRAINT "source_record_businessUnitId_fkey" FOREIGN KEY ("businessUnitId") REFERENCES "business_unit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "source_record" ADD CONSTRAINT "source_record_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "canonical_company"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "source_record" ADD CONSTRAINT "source_record_personId_fkey" FOREIGN KEY ("personId") REFERENCES "person"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "source_record" ADD CONSTRAINT "source_record_opportunityId_fkey" FOREIGN KEY ("opportunityId") REFERENCES "canonical_opportunity"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaign" ADD CONSTRAINT "campaign_businessUnitId_fkey" FOREIGN KEY ("businessUnitId") REFERENCES "business_unit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaign_member" ADD CONSTRAINT "campaign_member_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "outreach_approval" ADD CONSTRAINT "outreach_approval_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_run_context" ADD CONSTRAINT "agent_run_context_businessUnitId_fkey" FOREIGN KEY ("businessUnitId") REFERENCES "business_unit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
