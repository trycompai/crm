-- ============================================================
-- Zayn Scales agency modules
-- ============================================================

-- Extend the ActivityType enum
ALTER TYPE "ActivityType" ADD VALUE IF NOT EXISTS 'SMS';
ALTER TYPE "ActivityType" ADD VALUE IF NOT EXISTS 'FORM_SUBMISSION';
ALTER TYPE "ActivityType" ADD VALUE IF NOT EXISTS 'WORKFLOW';

-- New enums
CREATE TYPE "ClientAccountStatus" AS ENUM ('ACTIVE', 'ONBOARDING', 'PAUSED', 'CHURNED');
CREATE TYPE "SmsDirection" AS ENUM ('INBOUND', 'OUTBOUND');
CREATE TYPE "SmsStatus" AS ENUM ('QUEUED', 'SENT', 'DELIVERED', 'READ', 'FAILED', 'RECEIVED');
CREATE TYPE "FormFieldType" AS ENUM ('TEXT', 'LONG_TEXT', 'EMAIL', 'PHONE', 'NUMBER', 'SELECT', 'CHECKBOX', 'DATE', 'URL');
CREATE TYPE "FormStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');
CREATE TYPE "WorkflowTriggerKind" AS ENUM ('CONTACT_CREATED', 'DEAL_STAGE_CHANGED', 'FORM_SUBMITTED', 'SMS_RECEIVED', 'SCHEDULE', 'MANUAL');
CREATE TYPE "WorkflowRunStatus" AS ENUM ('QUEUED', 'RUNNING', 'SUCCEEDED', 'FAILED', 'CANCELLED');
CREATE TYPE "WorkflowStatus" AS ENUM ('DRAFT', 'ACTIVE', 'PAUSED', 'ARCHIVED');

-- ClientAccount
CREATE TABLE "clientAccount" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "status" "ClientAccountStatus" NOT NULL DEFAULT 'ACTIVE',
    "logoUrl" TEXT,
    "brandColor" TEXT,
    "website" TEXT,
    "industry" TEXT,
    "timezone" TEXT,
    "monthlyRetainerCents" BIGINT,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "startedAt" TIMESTAMP(3),
    "churnedAt" TIMESTAMP(3),
    "notes" TEXT,
    "tags" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "clientAccount_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "clientAccount_slug_key" ON "clientAccount"("slug");
CREATE INDEX "clientAccount_status_idx" ON "clientAccount"("status");
CREATE INDEX "clientAccount_name_idx" ON "clientAccount"("name");

-- Company additions
ALTER TABLE "company"
    ADD COLUMN "clientAccountId" TEXT,
    ADD COLUMN "tags" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
CREATE INDEX "company_clientAccountId_idx" ON "company"("clientAccountId");
ALTER TABLE "company"
    ADD CONSTRAINT "company_clientAccountId_fkey"
    FOREIGN KEY ("clientAccountId") REFERENCES "clientAccount"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

-- Contact additions
ALTER TABLE "contact"
    ADD COLUMN "clientAccountId" TEXT,
    ADD COLUMN "tags" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
CREATE INDEX "contact_clientAccountId_idx" ON "contact"("clientAccountId");
ALTER TABLE "contact"
    ADD CONSTRAINT "contact_clientAccountId_fkey"
    FOREIGN KEY ("clientAccountId") REFERENCES "clientAccount"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

-- Deal additions
ALTER TABLE "deal"
    ADD COLUMN "clientAccountId" TEXT,
    ADD COLUMN "boardOrder" INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN "tags" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
CREATE INDEX "deal_clientAccountId_idx" ON "deal"("clientAccountId");
CREATE INDEX "deal_stage_boardOrder_idx" ON "deal"("stage", "boardOrder");
ALTER TABLE "deal"
    ADD CONSTRAINT "deal_clientAccountId_fkey"
    FOREIGN KEY ("clientAccountId") REFERENCES "clientAccount"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

-- SmsThread
CREATE TABLE "smsThread" (
    "id" TEXT NOT NULL,
    "contactId" TEXT,
    "ourNumber" TEXT NOT NULL,
    "theirNumber" TEXT NOT NULL,
    "lastMessageAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastPreview" TEXT,
    "unreadCount" INTEGER NOT NULL DEFAULT 0,
    "clientAccountId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "smsThread_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "smsThread_ourNumber_theirNumber_key" ON "smsThread"("ourNumber", "theirNumber");
CREATE INDEX "smsThread_contactId_lastMessageAt_idx" ON "smsThread"("contactId", "lastMessageAt");
CREATE INDEX "smsThread_lastMessageAt_idx" ON "smsThread"("lastMessageAt");
CREATE INDEX "smsThread_clientAccountId_idx" ON "smsThread"("clientAccountId");
ALTER TABLE "smsThread"
    ADD CONSTRAINT "smsThread_contactId_fkey"
    FOREIGN KEY ("contactId") REFERENCES "contact"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

-- SmsMessage
CREATE TABLE "smsMessage" (
    "id" TEXT NOT NULL,
    "threadId" TEXT NOT NULL,
    "direction" "SmsDirection" NOT NULL,
    "status" "SmsStatus" NOT NULL DEFAULT 'RECEIVED',
    "body" TEXT NOT NULL,
    "providerSid" TEXT,
    "errorCode" TEXT,
    "errorMessage" TEXT,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "smsMessage_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "smsMessage_providerSid_key" ON "smsMessage"("providerSid");
CREATE INDEX "smsMessage_threadId_sentAt_idx" ON "smsMessage"("threadId", "sentAt");
ALTER TABLE "smsMessage"
    ADD CONSTRAINT "smsMessage_threadId_fkey"
    FOREIGN KEY ("threadId") REFERENCES "smsThread"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- FormDefinition
CREATE TABLE "formDefinition" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "status" "FormStatus" NOT NULL DEFAULT 'DRAFT',
    "redirectUrl" TEXT,
    "submitButtonLabel" TEXT NOT NULL DEFAULT 'Submit',
    "successMessage" TEXT NOT NULL DEFAULT 'Thanks — we''ll be in touch.',
    "clientAccountId" TEXT,
    "createDeal" BOOLEAN NOT NULL DEFAULT true,
    "dealStage" TEXT,
    "tagsToApply" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "workflowIdOnSubmit" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "formDefinition_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "formDefinition_slug_key" ON "formDefinition"("slug");
CREATE INDEX "formDefinition_status_idx" ON "formDefinition"("status");
CREATE INDEX "formDefinition_clientAccountId_idx" ON "formDefinition"("clientAccountId");
ALTER TABLE "formDefinition"
    ADD CONSTRAINT "formDefinition_clientAccountId_fkey"
    FOREIGN KEY ("clientAccountId") REFERENCES "clientAccount"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

-- FormField
CREATE TABLE "formField" (
    "id" TEXT NOT NULL,
    "formId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "type" "FormFieldType" NOT NULL,
    "required" BOOLEAN NOT NULL DEFAULT false,
    "placeholder" TEXT,
    "helpText" TEXT,
    "options" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "position" INTEGER NOT NULL,
    CONSTRAINT "formField_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "formField_formId_key_key" ON "formField"("formId", "key");
CREATE INDEX "formField_formId_position_idx" ON "formField"("formId", "position");
ALTER TABLE "formField"
    ADD CONSTRAINT "formField_formId_fkey"
    FOREIGN KEY ("formId") REFERENCES "formDefinition"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- FormSubmission
CREATE TABLE "formSubmission" (
    "id" TEXT NOT NULL,
    "formId" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "contactId" TEXT,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "referrer" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "formSubmission_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "formSubmission_formId_createdAt_idx" ON "formSubmission"("formId", "createdAt");
CREATE INDEX "formSubmission_contactId_createdAt_idx" ON "formSubmission"("contactId", "createdAt");
ALTER TABLE "formSubmission"
    ADD CONSTRAINT "formSubmission_formId_fkey"
    FOREIGN KEY ("formId") REFERENCES "formDefinition"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "formSubmission"
    ADD CONSTRAINT "formSubmission_contactId_fkey"
    FOREIGN KEY ("contactId") REFERENCES "contact"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

-- WorkflowDefinition
CREATE TABLE "workflowDefinition" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "status" "WorkflowStatus" NOT NULL DEFAULT 'DRAFT',
    "triggerKind" "WorkflowTriggerKind" NOT NULL,
    "triggerConfig" JSONB NOT NULL DEFAULT '{}',
    "steps" JSONB NOT NULL DEFAULT '[]',
    "clientAccountId" TEXT,
    "lastRunAt" TIMESTAMP(3),
    "runCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "workflowDefinition_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "workflowDefinition_status_triggerKind_idx" ON "workflowDefinition"("status", "triggerKind");
CREATE INDEX "workflowDefinition_clientAccountId_idx" ON "workflowDefinition"("clientAccountId");
ALTER TABLE "workflowDefinition"
    ADD CONSTRAINT "workflowDefinition_clientAccountId_fkey"
    FOREIGN KEY ("clientAccountId") REFERENCES "clientAccount"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

-- WorkflowRun
CREATE TABLE "workflowRun" (
    "id" TEXT NOT NULL,
    "workflowId" TEXT NOT NULL,
    "status" "WorkflowRunStatus" NOT NULL DEFAULT 'QUEUED',
    "triggerData" JSONB NOT NULL,
    "contextData" JSONB NOT NULL DEFAULT '{}',
    "currentStep" INTEGER NOT NULL DEFAULT 0,
    "contactId" TEXT,
    "dealId" TEXT,
    "companyId" TEXT,
    "errorMessage" TEXT,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "workflowRun_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "workflowRun_workflowId_createdAt_idx" ON "workflowRun"("workflowId", "createdAt");
CREATE INDEX "workflowRun_status_idx" ON "workflowRun"("status");
CREATE INDEX "workflowRun_contactId_idx" ON "workflowRun"("contactId");
ALTER TABLE "workflowRun"
    ADD CONSTRAINT "workflowRun_workflowId_fkey"
    FOREIGN KEY ("workflowId") REFERENCES "workflowDefinition"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- BookingLink
CREATE TABLE "bookingLink" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "durationMinutes" INTEGER NOT NULL DEFAULT 30,
    "bufferMinutes" INTEGER NOT NULL DEFAULT 15,
    "location" TEXT,
    "timezone" TEXT NOT NULL DEFAULT 'UTC',
    "color" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "bookingLink_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "bookingLink_slug_key" ON "bookingLink"("slug");
CREATE INDEX "bookingLink_ownerId_idx" ON "bookingLink"("ownerId");

-- Booking
CREATE TABLE "booking" (
    "id" TEXT NOT NULL,
    "linkId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "timezone" TEXT NOT NULL,
    "notes" TEXT,
    "cancelledAt" TIMESTAMP(3),
    "contactId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "booking_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "booking_linkId_startsAt_idx" ON "booking"("linkId", "startsAt");
CREATE INDEX "booking_contactId_idx" ON "booking"("contactId");
ALTER TABLE "booking"
    ADD CONSTRAINT "booking_linkId_fkey"
    FOREIGN KEY ("linkId") REFERENCES "bookingLink"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
