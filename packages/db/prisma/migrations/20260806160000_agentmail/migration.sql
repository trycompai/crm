-- CreateEnum
CREATE TYPE "EmailProvider" AS ENUM ('GMAIL', 'AGENTMAIL');

-- CreateEnum
CREATE TYPE "EmailDraftStatus" AS ENUM ('DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'SENT', 'REJECTED');

-- CreateEnum
CREATE TYPE "EmailEventType" AS ENUM ('INBOUND', 'DELIVERED', 'BOUNCED', 'COMPLAINED', 'REJECTED');

-- CreateEnum
CREATE TYPE "SuppressionReviewStatus" AS ENUM ('PENDING', 'DISMISSED', 'SUPPRESSED');

-- CreateEnum
CREATE TYPE "SuppressionReviewSource" AS ENUM ('BOUNCE', 'COMPLAINT', 'REJECTED');

-- AlterEnum
ALTER TYPE "RecordSource" ADD VALUE 'AGENTMAIL';

-- AlterTable
ALTER TABLE "emailMessage" ADD COLUMN     "createdById" TEXT,
ADD COLUMN     "draftId" TEXT,
ADD COLUMN     "externalInboxId" TEXT,
ADD COLUMN     "externalMessageId" TEXT,
ADD COLUMN     "externalThreadId" TEXT,
ADD COLUMN     "provider" "EmailProvider" NOT NULL DEFAULT 'GMAIL';

-- AlterTable
ALTER TABLE "emailThread" ADD COLUMN     "externalThreadId" TEXT,
ADD COLUMN     "provider" "EmailProvider";

-- CreateTable
CREATE TABLE "emailInbox" (
    "id" TEXT NOT NULL,
    "provider" "EmailProvider" NOT NULL,
    "externalInboxId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "isEnabled" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "emailInbox_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "emailDraft" (
    "id" TEXT NOT NULL,
    "provider" "EmailProvider" NOT NULL DEFAULT 'AGENTMAIL',
    "externalInboxId" TEXT NOT NULL,
    "externalDraftId" TEXT,
    "externalMessageId" TEXT,
    "threadId" TEXT,
    "companyId" TEXT,
    "contactId" TEXT,
    "dealId" TEXT,
    "createdById" TEXT NOT NULL,
    "approvedById" TEXT,
    "fromEmail" TEXT NOT NULL,
    "fromName" TEXT,
    "recipients" JSONB NOT NULL,
    "subject" TEXT NOT NULL,
    "plainTextBody" TEXT NOT NULL,
    "htmlBody" TEXT,
    "attachments" JSONB,
    "status" "EmailDraftStatus" NOT NULL DEFAULT 'DRAFT',
    "approvedAt" TIMESTAMP(3),
    "approvalDigest" TEXT,
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "emailDraft_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "emailProviderEvent" (
    "id" TEXT NOT NULL,
    "provider" "EmailProvider" NOT NULL,
    "eventType" "EmailEventType" NOT NULL,
    "externalEventId" TEXT NOT NULL,
    "externalInboxId" TEXT,
    "externalThreadId" TEXT,
    "externalMessageId" TEXT,
    "externalDraftId" TEXT,
    "inboxId" TEXT,
    "draftId" TEXT,
    "messageId" TEXT,
    "recipient" TEXT,
    "payload" JSONB NOT NULL,
    "svixId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "emailProviderEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "suppressionReview" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "domain" TEXT,
    "companyId" TEXT,
    "contactId" TEXT,
    "reason" TEXT NOT NULL,
    "source" "SuppressionReviewSource" NOT NULL,
    "eventId" TEXT,
    "status" "SuppressionReviewStatus" NOT NULL DEFAULT 'PENDING',
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "suppressionReview_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "emailInbox_provider_externalInboxId_key" ON "emailInbox"("provider", "externalInboxId");

-- CreateIndex
CREATE INDEX "emailDraft_contactId_status_idx" ON "emailDraft"("contactId", "status");

-- CreateIndex
CREATE INDEX "emailDraft_companyId_status_idx" ON "emailDraft"("companyId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "emailDraft_provider_externalDraftId_key" ON "emailDraft"("provider", "externalDraftId");

-- CreateIndex
CREATE UNIQUE INDEX "emailDraft_provider_externalMessageId_key" ON "emailDraft"("provider", "externalMessageId");

-- CreateIndex
CREATE INDEX "emailProviderEvent_messageId_idx" ON "emailProviderEvent"("messageId");

-- CreateIndex
CREATE INDEX "emailProviderEvent_draftId_idx" ON "emailProviderEvent"("draftId");

-- CreateIndex
CREATE INDEX "emailProviderEvent_provider_externalMessageId_idx" ON "emailProviderEvent"("provider", "externalMessageId");

-- CreateIndex
CREATE UNIQUE INDEX "emailProviderEvent_provider_externalEventId_key" ON "emailProviderEvent"("provider", "externalEventId");

-- CreateIndex
CREATE INDEX "suppressionReview_email_idx" ON "suppressionReview"("email");

-- CreateIndex
CREATE INDEX "suppressionReview_status_idx" ON "suppressionReview"("status");

-- CreateIndex
CREATE UNIQUE INDEX "emailMessage_provider_externalMessageId_key" ON "emailMessage"("provider", "externalMessageId");

-- CreateIndex
CREATE UNIQUE INDEX "emailThread_provider_externalThreadId_key" ON "emailThread"("provider", "externalThreadId");

-- Backfill provider-specific message identifiers from the legacy Gmail column
UPDATE "emailMessage" SET "externalMessageId" = "gmailMessageId" WHERE "externalMessageId" IS NULL AND "gmailMessageId" IS NOT NULL;

-- AddForeignKey
ALTER TABLE "emailMessage" ADD CONSTRAINT "emailMessage_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "emailMessage" ADD CONSTRAINT "emailMessage_draftId_fkey" FOREIGN KEY ("draftId") REFERENCES "emailDraft"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "emailDraft" ADD CONSTRAINT "emailDraft_provider_externalInboxId_fkey" FOREIGN KEY ("provider", "externalInboxId") REFERENCES "emailInbox"("provider", "externalInboxId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "emailDraft" ADD CONSTRAINT "emailDraft_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "emailThread"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "emailDraft" ADD CONSTRAINT "emailDraft_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "company"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "emailDraft" ADD CONSTRAINT "emailDraft_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "contact"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "emailDraft" ADD CONSTRAINT "emailDraft_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "deal"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "emailDraft" ADD CONSTRAINT "emailDraft_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "emailDraft" ADD CONSTRAINT "emailDraft_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "emailProviderEvent" ADD CONSTRAINT "emailProviderEvent_inboxId_fkey" FOREIGN KEY ("inboxId") REFERENCES "emailInbox"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "emailProviderEvent" ADD CONSTRAINT "emailProviderEvent_draftId_fkey" FOREIGN KEY ("draftId") REFERENCES "emailDraft"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "emailProviderEvent" ADD CONSTRAINT "emailProviderEvent_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "emailMessage"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "suppressionReview" ADD CONSTRAINT "suppressionReview_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "emailProviderEvent"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "suppressionReview" ADD CONSTRAINT "suppressionReview_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

