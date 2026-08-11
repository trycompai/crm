CREATE TYPE "ApprovalStatus" AS ENUM ('PROPOSED', 'APPROVED', 'REJECTED', 'APPLIED');

CREATE TYPE "PipelineStageCategory" AS ENUM ('NEW', 'PROSPECTING', 'ENGAGEMENT', 'QUALIFICATION', 'OPPORTUNITY', 'COMMIT', 'CLOSED', 'DISQUALIFIED');

CREATE TYPE "DraftStatus" AS ENUM ('DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'REJECTED', 'PUBLISHED', 'ARCHIVED');

CREATE TYPE "ContentType" AS ENUM ('BLOG', 'LINKEDIN', 'NEWSLETTER', 'WEBSITE', 'OTHER');

CREATE TYPE "SocialPlatform" AS ENUM ('LINKEDIN', 'X', 'INSTAGRAM', 'FACEBOOK', 'OTHER');

CREATE TYPE "DecisionScope" AS ENUM ('COMPANY', 'COMMERCIAL', 'CONTENT', 'OPERATIONS', 'PRODUCT', 'LEGAL', 'OTHER');

CREATE TABLE "ApprovalQueue" (
    "id" TEXT NOT NULL,
    "recordType" TEXT NOT NULL,
    "recordId" TEXT NOT NULL,
    "companyId" TEXT,
    "organizationId" TEXT,
    "workspaceProfileId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ApprovalQueue_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ApprovalProposal" (
    "id" TEXT NOT NULL,
    "queueId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "proposerContext" JSONB,
    "status" "ApprovalStatus" NOT NULL DEFAULT 'PROPOSED',
    "approvalCode" TEXT,
    "proposerId" TEXT,
    "approverId" TEXT,
    "decidedAt" TIMESTAMP(3),
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ApprovalProposal_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "FounderDecision" (
    "id" TEXT NOT NULL,
    "scope" "DecisionScope" NOT NULL,
    "decisionText" TEXT NOT NULL,
    "rationale" TEXT,
    "effectiveFrom" TIMESTAMP(3),
    "effectiveUntil" TIMESTAMP(3),
    "supersededById" TEXT,
    "decidedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "FounderDecision_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PipelineStage" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "category" "PipelineStageCategory" NOT NULL,
    "entryCriteria" TEXT,
    "exitCriteria" TEXT,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "PipelineStage_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ContentDraft" (
    "id" TEXT NOT NULL,
    "type" "ContentType" NOT NULL,
    "title" TEXT,
    "body" TEXT NOT NULL,
    "status" "DraftStatus" NOT NULL DEFAULT 'DRAFT',
    "authorId" TEXT,
    "approverId" TEXT,
    "approvalCode" TEXT,
    "scheduledAt" TIMESTAMP(3),
    "publishedAt" TIMESTAMP(3),
    "publicationReceipts" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ContentDraft_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SocialDraft" (
    "id" TEXT NOT NULL,
    "platform" "SocialPlatform" NOT NULL,
    "content" TEXT NOT NULL,
    "scheduledAt" TIMESTAMP(3),
    "status" "DraftStatus" NOT NULL DEFAULT 'DRAFT',
    "authorId" TEXT,
    "approverId" TEXT,
    "approvalCode" TEXT,
    "publishedAt" TIMESTAMP(3),
    "publishReceipt" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "SocialDraft_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "DiscoveryLearning" (
    "id" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "evidence" JSONB,
    "tags" JSONB,
    "companyId" TEXT,
    "contactId" TEXT,
    "dealId" TEXT,
    "sessionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "DiscoveryLearning_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "HermesAudit" (
    "id" TEXT NOT NULL,
    "tool" TEXT NOT NULL,
    "args" JSONB,
    "outcome" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "model" TEXT,
    "cost" DECIMAL(14, 4),
    "userId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "HermesAudit_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ApprovalQueue_recordType_recordId_key" ON "ApprovalQueue"("recordType", "recordId");

CREATE INDEX "ApprovalQueue_companyId_idx" ON "ApprovalQueue"("companyId");

CREATE INDEX "ApprovalQueue_organizationId_idx" ON "ApprovalQueue"("organizationId");

CREATE INDEX "ApprovalQueue_workspaceProfileId_idx" ON "ApprovalQueue"("workspaceProfileId");

CREATE INDEX "ApprovalProposal_queueId_idx" ON "ApprovalProposal"("queueId");

CREATE UNIQUE INDEX "ApprovalProposal_approvalCode_key" ON "ApprovalProposal"("approvalCode");

CREATE INDEX "ApprovalProposal_status_createdAt_idx" ON "ApprovalProposal"("status", "createdAt");

CREATE INDEX "ApprovalProposal_proposerId_idx" ON "ApprovalProposal"("proposerId");

CREATE INDEX "ApprovalProposal_approverId_idx" ON "ApprovalProposal"("approverId");

CREATE UNIQUE INDEX "FounderDecision_supersededById_key" ON "FounderDecision"("supersededById");

CREATE INDEX "FounderDecision_scope_createdAt_idx" ON "FounderDecision"("scope", "createdAt");

CREATE INDEX "FounderDecision_effectiveFrom_idx" ON "FounderDecision"("effectiveFrom");

CREATE INDEX "FounderDecision_effectiveUntil_idx" ON "FounderDecision"("effectiveUntil");

CREATE UNIQUE INDEX "PipelineStage_workspaceId_order_key" ON "PipelineStage"("workspaceId", "order");

CREATE UNIQUE INDEX "PipelineStage_workspaceId_name_key" ON "PipelineStage"("workspaceId", "name");

CREATE INDEX "PipelineStage_workspaceId_category_idx" ON "PipelineStage"("workspaceId", "category");

CREATE UNIQUE INDEX "ContentDraft_approvalCode_key" ON "ContentDraft"("approvalCode");

CREATE INDEX "ContentDraft_status_scheduledAt_idx" ON "ContentDraft"("status", "scheduledAt");

CREATE INDEX "ContentDraft_authorId_idx" ON "ContentDraft"("authorId");

CREATE UNIQUE INDEX "SocialDraft_approvalCode_key" ON "SocialDraft"("approvalCode");

CREATE INDEX "SocialDraft_status_scheduledAt_idx" ON "SocialDraft"("status", "scheduledAt");

CREATE INDEX "SocialDraft_authorId_idx" ON "SocialDraft"("authorId");

CREATE INDEX "DiscoveryLearning_companyId_createdAt_idx" ON "DiscoveryLearning"("companyId", "createdAt");

CREATE INDEX "DiscoveryLearning_contactId_createdAt_idx" ON "DiscoveryLearning"("contactId", "createdAt");

CREATE INDEX "DiscoveryLearning_dealId_createdAt_idx" ON "DiscoveryLearning"("dealId", "createdAt");

CREATE INDEX "DiscoveryLearning_source_createdAt_idx" ON "DiscoveryLearning"("source", "createdAt");

CREATE INDEX "HermesAudit_tool_createdAt_idx" ON "HermesAudit"("tool", "createdAt");

CREATE INDEX "HermesAudit_sessionId_createdAt_idx" ON "HermesAudit"("sessionId", "createdAt");

CREATE INDEX "HermesAudit_userId_idx" ON "HermesAudit"("userId");

ALTER TABLE "ApprovalQueue" ADD CONSTRAINT "ApprovalQueue_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "company"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ApprovalQueue" ADD CONSTRAINT "ApprovalQueue_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ApprovalQueue" ADD CONSTRAINT "ApprovalQueue_workspaceProfileId_fkey" FOREIGN KEY ("workspaceProfileId") REFERENCES "workspaceProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ApprovalProposal" ADD CONSTRAINT "ApprovalProposal_queueId_fkey" FOREIGN KEY ("queueId") REFERENCES "ApprovalQueue"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ApprovalProposal" ADD CONSTRAINT "ApprovalProposal_proposerId_fkey" FOREIGN KEY ("proposerId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ApprovalProposal" ADD CONSTRAINT "ApprovalProposal_approverId_fkey" FOREIGN KEY ("approverId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "FounderDecision" ADD CONSTRAINT "FounderDecision_supersededById_fkey" FOREIGN KEY ("supersededById") REFERENCES "FounderDecision"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "FounderDecision" ADD CONSTRAINT "FounderDecision_decidedById_fkey" FOREIGN KEY ("decidedById") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "PipelineStage" ADD CONSTRAINT "PipelineStage_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ContentDraft" ADD CONSTRAINT "ContentDraft_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ContentDraft" ADD CONSTRAINT "ContentDraft_approverId_fkey" FOREIGN KEY ("approverId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "SocialDraft" ADD CONSTRAINT "SocialDraft_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "SocialDraft" ADD CONSTRAINT "SocialDraft_approverId_fkey" FOREIGN KEY ("approverId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "DiscoveryLearning" ADD CONSTRAINT "DiscoveryLearning_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "company"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "DiscoveryLearning" ADD CONSTRAINT "DiscoveryLearning_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "contact"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "DiscoveryLearning" ADD CONSTRAINT "DiscoveryLearning_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "deal"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "HermesAudit" ADD CONSTRAINT "HermesAudit_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;
