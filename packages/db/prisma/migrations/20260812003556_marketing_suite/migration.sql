-- CreateEnum
CREATE TYPE "MarketingStatus" AS ENUM ('SUBSCRIBED', 'UNSUBSCRIBED', 'BOUNCED', 'COMPLAINED');

-- CreateEnum
CREATE TYPE "MarketingConsent" AS ENUM ('FORM', 'IMPORT', 'MANUAL', 'DOUBLE_OPT_IN');

-- CreateEnum
CREATE TYPE "MarketingPartialKind" AS ENUM ('HEADER', 'FOOTER');

-- CreateEnum
CREATE TYPE "MarketingSegmentKind" AS ENUM ('DYNAMIC', 'STATIC');

-- CreateEnum
CREATE TYPE "MarketingMemberMode" AS ENUM ('INCLUDE', 'EXCLUDE');

-- CreateEnum
CREATE TYPE "MarketingCampaignKind" AS ENUM ('BLAST', 'DRIP');

-- CreateEnum
CREATE TYPE "MarketingEntryMode" AS ENUM ('MANUAL', 'CONTINUOUS');

-- CreateEnum
CREATE TYPE "MarketingCampaignStatus" AS ENUM ('DRAFT', 'PENDING_APPROVAL', 'SCHEDULED', 'SENDING', 'SENT', 'ACTIVE', 'PAUSED', 'DRAINING', 'CANCELLED', 'ARCHIVED', 'FAILED');

-- CreateEnum
CREATE TYPE "MarketingNodeKind" AS ENUM ('EMAIL', 'WAIT', 'BRANCH', 'SPLIT', 'EXIT');

-- CreateEnum
CREATE TYPE "MarketingSendStatus" AS ENUM ('QUEUED', 'SENDING', 'SENT', 'DELIVERED', 'BOUNCED', 'COMPLAINED', 'FAILED', 'SKIPPED');

-- CreateEnum
CREATE TYPE "MarketingEventType" AS ENUM ('SENT', 'DELIVERED', 'OPENED', 'CLICKED', 'REPLIED', 'BOUNCED', 'COMPLAINED', 'UNSUBSCRIBED', 'FAILED', 'DELAYED');

-- CreateEnum
CREATE TYPE "MarketingSendOrigin" AS ENUM ('CAMPAIGN', 'DRIP', 'DIRECT', 'TEST');

-- CreateEnum
CREATE TYPE "MarketingEnrolmentStatus" AS ENUM ('ACTIVE', 'COMPLETED', 'EXITED', 'PAUSED', 'FAILED');

-- CreateEnum
CREATE TYPE "MarketingExitKind" AS ENUM ('GOAL', 'RULE', 'SUPPRESSED', 'MANUAL', 'ARCHIVED');

-- AlterTable
ALTER TABLE "agentConversation" ADD COLUMN     "campaignId" TEXT,
ADD COLUMN     "segmentId" TEXT,
ADD COLUMN     "templateId" TEXT;

-- AlterTable
ALTER TABLE "appSetting" ADD COLUMN     "marketingDailyCap" INTEGER,
ADD COLUMN     "marketingFromAddress" TEXT,
ADD COLUMN     "marketingFromName" TEXT,
ADD COLUMN     "marketingOnboardedAt" TIMESTAMP(3),
ADD COLUMN     "marketingPostalAddress" TEXT,
ADD COLUMN     "marketingQuietEnd" INTEGER,
ADD COLUMN     "marketingQuietStart" INTEGER,
ADD COLUMN     "marketingReplyTo" TEXT,
ADD COLUMN     "marketingResendApiKey" TEXT,
ADD COLUMN     "marketingResendDomainId" TEXT,
ADD COLUMN     "marketingSendingDomain" TEXT,
ADD COLUMN     "marketingSendsPerMinute" INTEGER,
ADD COLUMN     "marketingTimeZone" TEXT;

-- CreateTable
CREATE TABLE "marketingRecipient" (
    "id" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "contactId" TEXT,
    "status" "MarketingStatus" NOT NULL DEFAULT 'SUBSCRIBED',
    "statusReason" TEXT,
    "statusAt" TIMESTAMP(3),
    "consentBasis" "MarketingConsent",
    "consentAt" TIMESTAMP(3),
    "consentSource" TEXT,
    "lastSentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "marketingRecipient_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "marketingPartial" (
    "id" TEXT NOT NULL,
    "kind" "MarketingPartialKind" NOT NULL,
    "name" TEXT NOT NULL,
    "document" JSONB NOT NULL,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "marketingPartial_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "marketingTemplate" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "preheader" TEXT,
    "document" JSONB NOT NULL,
    "headerId" TEXT,
    "footerId" TEXT,
    "archivedAt" TIMESTAMP(3),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "marketingTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "marketingSegment" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "kind" "MarketingSegmentKind" NOT NULL DEFAULT 'DYNAMIC',
    "definition" JSONB,
    "lastCount" INTEGER,
    "lastCountedAt" TIMESTAMP(3),
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "marketingSegment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "marketingSegmentMember" (
    "segmentId" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "mode" "MarketingMemberMode" NOT NULL DEFAULT 'INCLUDE',
    "addedById" TEXT,
    "addedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "marketingSegmentMember_pkey" PRIMARY KEY ("segmentId","contactId")
);

-- CreateTable
CREATE TABLE "marketingCampaign" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" "MarketingCampaignKind" NOT NULL DEFAULT 'BLAST',
    "status" "MarketingCampaignStatus" NOT NULL DEFAULT 'DRAFT',
    "segmentId" TEXT,
    "entryMode" "MarketingEntryMode" NOT NULL DEFAULT 'MANUAL',
    "entryDefinition" JSONB,
    "exitDefinition" JSONB,
    "reentryCooldownDays" INTEGER,
    "maxPasses" INTEGER NOT NULL DEFAULT 1,
    "fromName" TEXT,
    "fromAddress" TEXT,
    "replyTo" TEXT,
    "scheduledAt" TIMESTAMP(3),
    "activatedAt" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "pausedReason" TEXT,
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "createdById" TEXT,
    "totalRecipients" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "marketingCampaign_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "marketingCampaignNode" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "kind" "MarketingNodeKind" NOT NULL,
    "label" TEXT,
    "templateId" TEXT,
    "subject" TEXT,
    "preheader" TEXT,
    "document" JSONB,
    "delayHours" INTEGER,
    "condition" JSONB,
    "x" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "y" DOUBLE PRECISION NOT NULL DEFAULT 0,

    CONSTRAINT "marketingCampaignNode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "marketingCampaignEdge" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "fromId" TEXT NOT NULL,
    "toId" TEXT NOT NULL,
    "handle" TEXT NOT NULL DEFAULT 'next',
    "label" TEXT,
    "weight" INTEGER NOT NULL DEFAULT 100,

    CONSTRAINT "marketingCampaignEdge_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "marketingSend" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT,
    "enrolmentId" TEXT,
    "nodeId" TEXT,
    "recipientId" TEXT NOT NULL,
    "contactId" TEXT,
    "origin" "MarketingSendOrigin" NOT NULL DEFAULT 'CAMPAIGN',
    "pass" INTEGER NOT NULL DEFAULT 1,
    "requestedById" TEXT,
    "subject" TEXT,
    "document" JSONB,
    "replyTo" TEXT,
    "status" "MarketingSendStatus" NOT NULL DEFAULT 'QUEUED',
    "skipReason" TEXT,
    "dueAt" TIMESTAMP(3) NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "leasedAt" TIMESTAMP(3),
    "sentAt" TIMESTAMP(3),
    "providerId" TEXT,
    "error" TEXT,
    "openedAt" TIMESTAMP(3),
    "clickedAt" TIMESTAMP(3),
    "repliedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "marketingSend_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "marketingAttachment" (
    "id" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "bytes" INTEGER NOT NULL,
    "url" TEXT NOT NULL,
    "campaignId" TEXT,
    "templateId" TEXT,
    "sendId" TEXT,
    "uploadedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "marketingAttachment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "marketingEvent" (
    "id" TEXT NOT NULL,
    "sendId" TEXT NOT NULL,
    "type" "MarketingEventType" NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "url" TEXT,

    CONSTRAINT "marketingEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "marketingEnrolment" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "recipientId" TEXT NOT NULL,
    "status" "MarketingEnrolmentStatus" NOT NULL DEFAULT 'ACTIVE',
    "pass" INTEGER NOT NULL DEFAULT 1,
    "currentNodeId" TEXT,
    "nextDueAt" TIMESTAMP(3),
    "exitKind" "MarketingExitKind",
    "exitReason" TEXT,
    "exitedAt" TIMESTAMP(3),
    "enrolledAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "marketingEnrolment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "marketingRecipient_address_key" ON "marketingRecipient"("address");

-- CreateIndex
CREATE UNIQUE INDEX "marketingRecipient_token_key" ON "marketingRecipient"("token");

-- CreateIndex
CREATE INDEX "marketingRecipient_status_idx" ON "marketingRecipient"("status");

-- CreateIndex
CREATE INDEX "marketingRecipient_contactId_idx" ON "marketingRecipient"("contactId");

-- CreateIndex
CREATE INDEX "marketingPartial_kind_isDefault_idx" ON "marketingPartial"("kind", "isDefault");

-- CreateIndex
CREATE INDEX "marketingTemplate_archivedAt_idx" ON "marketingTemplate"("archivedAt");

-- CreateIndex
CREATE UNIQUE INDEX "marketingSegment_name_key" ON "marketingSegment"("name");

-- CreateIndex
CREATE INDEX "marketingSegment_archivedAt_idx" ON "marketingSegment"("archivedAt");

-- CreateIndex
CREATE INDEX "marketingSegmentMember_contactId_idx" ON "marketingSegmentMember"("contactId");

-- CreateIndex
CREATE INDEX "marketingCampaign_status_scheduledAt_idx" ON "marketingCampaign"("status", "scheduledAt");

-- CreateIndex
CREATE INDEX "marketingCampaign_kind_status_idx" ON "marketingCampaign"("kind", "status");

-- CreateIndex
CREATE INDEX "marketingCampaignNode_campaignId_idx" ON "marketingCampaignNode"("campaignId");

-- CreateIndex
CREATE INDEX "marketingCampaignEdge_campaignId_idx" ON "marketingCampaignEdge"("campaignId");

-- CreateIndex
CREATE INDEX "marketingCampaignEdge_toId_idx" ON "marketingCampaignEdge"("toId");

-- CreateIndex
CREATE UNIQUE INDEX "marketingCampaignEdge_fromId_handle_key" ON "marketingCampaignEdge"("fromId", "handle");

-- CreateIndex
CREATE UNIQUE INDEX "marketingSend_providerId_key" ON "marketingSend"("providerId");

-- CreateIndex
CREATE INDEX "marketingSend_status_dueAt_idx" ON "marketingSend"("status", "dueAt");

-- CreateIndex
CREATE INDEX "marketingSend_campaignId_status_idx" ON "marketingSend"("campaignId", "status");

-- CreateIndex
CREATE INDEX "marketingSend_recipientId_idx" ON "marketingSend"("recipientId");

-- CreateIndex
CREATE INDEX "marketingSend_nodeId_status_idx" ON "marketingSend"("nodeId", "status");

-- CreateIndex
CREATE INDEX "marketingSend_enrolmentId_idx" ON "marketingSend"("enrolmentId");

-- CreateIndex
CREATE INDEX "marketingSend_contactId_idx" ON "marketingSend"("contactId");

-- CreateIndex
CREATE UNIQUE INDEX "marketingSend_nodeId_recipientId_pass_key" ON "marketingSend"("nodeId", "recipientId", "pass");

-- CreateIndex
CREATE INDEX "marketingAttachment_campaignId_idx" ON "marketingAttachment"("campaignId");

-- CreateIndex
CREATE INDEX "marketingAttachment_templateId_idx" ON "marketingAttachment"("templateId");

-- CreateIndex
CREATE INDEX "marketingAttachment_sendId_idx" ON "marketingAttachment"("sendId");

-- CreateIndex
CREATE INDEX "marketingEvent_sendId_at_idx" ON "marketingEvent"("sendId", "at");

-- CreateIndex
CREATE INDEX "marketingEvent_type_at_idx" ON "marketingEvent"("type", "at");

-- CreateIndex
CREATE INDEX "marketingEnrolment_campaignId_status_currentNodeId_idx" ON "marketingEnrolment"("campaignId", "status", "currentNodeId");

-- CreateIndex
CREATE INDEX "marketingEnrolment_campaignId_contactId_exitedAt_idx" ON "marketingEnrolment"("campaignId", "contactId", "exitedAt");

-- CreateIndex
CREATE INDEX "marketingEnrolment_status_nextDueAt_idx" ON "marketingEnrolment"("status", "nextDueAt");

-- CreateIndex
CREATE INDEX "marketingEnrolment_contactId_idx" ON "marketingEnrolment"("contactId");

-- CreateIndex
CREATE UNIQUE INDEX "marketingEnrolment_campaignId_contactId_pass_key" ON "marketingEnrolment"("campaignId", "contactId", "pass");

-- CreateIndex
CREATE INDEX "agentConversation_campaignId_lastMessageAt_idx" ON "agentConversation"("campaignId", "lastMessageAt");

-- CreateIndex
CREATE INDEX "agentConversation_segmentId_lastMessageAt_idx" ON "agentConversation"("segmentId", "lastMessageAt");

-- CreateIndex
CREATE INDEX "agentConversation_templateId_lastMessageAt_idx" ON "agentConversation"("templateId", "lastMessageAt");

-- AddForeignKey
ALTER TABLE "agentConversation" ADD CONSTRAINT "agentConversation_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "marketingCampaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agentConversation" ADD CONSTRAINT "agentConversation_segmentId_fkey" FOREIGN KEY ("segmentId") REFERENCES "marketingSegment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agentConversation" ADD CONSTRAINT "agentConversation_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "marketingTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "marketingRecipient" ADD CONSTRAINT "marketingRecipient_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "contact"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "marketingTemplate" ADD CONSTRAINT "marketingTemplate_headerId_fkey" FOREIGN KEY ("headerId") REFERENCES "marketingPartial"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "marketingTemplate" ADD CONSTRAINT "marketingTemplate_footerId_fkey" FOREIGN KEY ("footerId") REFERENCES "marketingPartial"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "marketingSegmentMember" ADD CONSTRAINT "marketingSegmentMember_segmentId_fkey" FOREIGN KEY ("segmentId") REFERENCES "marketingSegment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "marketingSegmentMember" ADD CONSTRAINT "marketingSegmentMember_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "contact"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "marketingCampaign" ADD CONSTRAINT "marketingCampaign_segmentId_fkey" FOREIGN KEY ("segmentId") REFERENCES "marketingSegment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "marketingCampaignNode" ADD CONSTRAINT "marketingCampaignNode_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "marketingCampaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "marketingCampaignNode" ADD CONSTRAINT "marketingCampaignNode_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "marketingTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "marketingCampaignEdge" ADD CONSTRAINT "marketingCampaignEdge_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "marketingCampaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "marketingCampaignEdge" ADD CONSTRAINT "marketingCampaignEdge_fromId_fkey" FOREIGN KEY ("fromId") REFERENCES "marketingCampaignNode"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "marketingCampaignEdge" ADD CONSTRAINT "marketingCampaignEdge_toId_fkey" FOREIGN KEY ("toId") REFERENCES "marketingCampaignNode"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "marketingSend" ADD CONSTRAINT "marketingSend_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "marketingCampaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "marketingSend" ADD CONSTRAINT "marketingSend_enrolmentId_fkey" FOREIGN KEY ("enrolmentId") REFERENCES "marketingEnrolment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "marketingSend" ADD CONSTRAINT "marketingSend_nodeId_fkey" FOREIGN KEY ("nodeId") REFERENCES "marketingCampaignNode"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "marketingSend" ADD CONSTRAINT "marketingSend_recipientId_fkey" FOREIGN KEY ("recipientId") REFERENCES "marketingRecipient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "marketingAttachment" ADD CONSTRAINT "marketingAttachment_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "marketingCampaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "marketingAttachment" ADD CONSTRAINT "marketingAttachment_sendId_fkey" FOREIGN KEY ("sendId") REFERENCES "marketingSend"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "marketingEvent" ADD CONSTRAINT "marketingEvent_sendId_fkey" FOREIGN KEY ("sendId") REFERENCES "marketingSend"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "marketingEnrolment" ADD CONSTRAINT "marketingEnrolment_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "marketingCampaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "marketingEnrolment" ADD CONSTRAINT "marketingEnrolment_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "contact"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "marketingEnrolment" ADD CONSTRAINT "marketingEnrolment_recipientId_fkey" FOREIGN KEY ("recipientId") REFERENCES "marketingRecipient"("id") ON DELETE CASCADE ON UPDATE CASCADE;
