CREATE TYPE "SubjectType" AS ENUM ('WORKSPACE', 'USER', 'COMPANY', 'CONTACT', 'PROSPECT', 'DEAL', 'EMAIL_DRAFT', 'WORK_ITEM', 'CAMPAIGN', 'CONTENT_ITEM', 'CONTENT_VARIANT', 'EXPERIMENT', 'SOCIAL_MENTION', 'SUPPORT_CASE', 'CUSTOMER_ACCOUNT', 'CUSTOMER_INSTANCE', 'PROVIDER_ACCOUNT', 'PROVIDER_RESOURCE', 'PLAN', 'CONTROL_COMMAND', 'PROVIDER_OPERATION');

CREATE TYPE "WorkItemUrgency" AS ENUM ('LOW', 'NORMAL', 'HIGH', 'URGENT');

CREATE TYPE "WorkItemState" AS ENUM ('OPEN', 'IN_PROGRESS', 'WAITING', 'BLOCKED', 'DONE', 'DISMISSED');

CREATE TYPE "AgentTaskState" AS ENUM ('QUEUED', 'LEASED', 'WAITING_FOR_APPROVAL', 'SUCCEEDED', 'FAILED', 'UNKNOWN', 'CANCELLED');

CREATE TYPE "ApprovalRequestRisk" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

CREATE TYPE "ApprovalRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'EXPIRED', 'INVALIDATED', 'EXECUTED', 'CANCELLED');

CREATE TYPE "ActionReceiptStatus" AS ENUM ('PENDING', 'SUCCEEDED', 'FAILED', 'INDETERMINATE');

CREATE TYPE "ConnectorBindingStatus" AS ENUM ('ACTIVE', 'PAUSED', 'REVOKED', 'ERROR');

CREATE TYPE "ConnectorTestState" AS ENUM ('NOT_TESTED', 'PENDING', 'PASSED', 'FAILED');

CREATE TYPE "CampaignStatus" AS ENUM ('DRAFT', 'ACTIVE', 'PAUSED', 'COMPLETED', 'ARCHIVED');

CREATE TYPE "ContentItemStatus" AS ENUM ('DRAFT', 'IN_REVIEW', 'APPROVED', 'PUBLISHED', 'ARCHIVED');

CREATE TYPE "ContentVariantStatus" AS ENUM ('DRAFT', 'ACTIVE', 'RETIRED');

CREATE TYPE "ExperimentStatus" AS ENUM ('DRAFT', 'RUNNING', 'PAUSED', 'COMPLETED');

CREATE TYPE "SocialMentionStatus" AS ENUM ('NEW', 'TRIAGED', 'RESPONDED', 'DISMISSED');

CREATE TYPE "MarketingTriageProposalStatus" AS ENUM ('PROPOSED', 'APPROVED', 'REJECTED', 'APPLIED', 'DISMISSED');

CREATE TYPE "PublicationStatus" AS ENUM ('PLANNED', 'SCHEDULED', 'PUBLISHED', 'FAILED', 'CANCELLED');

CREATE TYPE "AttributionModel" AS ENUM ('FIRST_TOUCH', 'LAST_TOUCH', 'LINEAR', 'MANUAL');

CREATE TYPE "SupportCaseStatus" AS ENUM ('NEW', 'OPEN', 'PENDING_CUSTOMER', 'PENDING_INTERNAL', 'RESOLVED', 'CLOSED');

CREATE TYPE "SupportCasePriority" AS ENUM ('LOW', 'NORMAL', 'HIGH', 'URGENT');

CREATE TYPE "SupportIdentityMatchState" AS ENUM ('UNMATCHED', 'MATCH_PROPOSED', 'MATCHED', 'EXCLUDED');

CREATE TYPE "SupportCaseEventType" AS ENUM ('CREATED', 'MESSAGE', 'NOTE', 'STATUS_CHANGE', 'ASSIGNMENT', 'INTERNAL');

CREATE TYPE "SupportSlaPolicyStatus" AS ENUM ('ACTIVE', 'INACTIVE');

CREATE TYPE "SupportTriageProposalStatus" AS ENUM ('PROPOSED', 'ACCEPTED', 'REJECTED', 'APPLIED', 'DISMISSED');

CREATE TYPE "SupportReplyDraftStatus" AS ENUM ('DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'REJECTED', 'SENT');

CREATE TYPE "SupportKnowledgeDocumentStatus" AS ENUM ('DRAFT', 'ACTIVE', 'ARCHIVED');

CREATE TYPE "SupportKnowledgeAudience" AS ENUM ('INTERNAL', 'CUSTOMER_SAFE');

CREATE TYPE "SupportEscalationSeverity" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

CREATE TYPE "SupportEscalationStatus" AS ENUM ('OPEN', 'ACKNOWLEDGED', 'RESOLVED', 'CANCELLED');

CREATE TYPE "SupportProductHandoffStatus" AS ENUM ('PROPOSED', 'ACCEPTED', 'IN_PROGRESS', 'RESOLVED', 'DECLINED');

CREATE TYPE "CustomerAccountStatus" AS ENUM ('PROSPECT', 'ACTIVE', 'SUSPENDED', 'CLOSED');

CREATE TYPE "CustomerInstanceStatus" AS ENUM ('DISCOVERED', 'UNMANAGED', 'PROVISIONING', 'ACTIVE', 'PAUSED', 'DECOMMISSIONED', 'FAILED');

CREATE TYPE "ProviderAccountStatus" AS ENUM ('PENDING', 'ACTIVE', 'PAUSED', 'REVOKED', 'ERROR');

CREATE TYPE "ProviderResourceStatus" AS ENUM ('DISCOVERED', 'ACTIVE', 'DRIFTED', 'DELETED', 'ERROR');

CREATE TYPE "SecretReferenceStatus" AS ENUM ('ACTIVE', 'ROTATED', 'REVOKED');

CREATE TYPE "DesiredStateRevisionStatus" AS ENUM ('DRAFT', 'PLANNED', 'APPLIED', 'SUPERSEDED', 'FAILED');

CREATE TYPE "ObservedStateStatus" AS ENUM ('UNKNOWN', 'SYNCING', 'CURRENT', 'STALE', 'ERROR');

CREATE TYPE "PlanStatus" AS ENUM ('DRAFT', 'READY', 'RUNNING', 'SUCCEEDED', 'FAILED', 'CANCELLED');

CREATE TYPE "PlanStepStatus" AS ENUM ('PENDING', 'RUNNING', 'SUCCEEDED', 'FAILED', 'SKIPPED', 'CANCELLED');

CREATE TYPE "ControlCommandStatus" AS ENUM ('QUEUED', 'RUNNING', 'SUCCEEDED', 'FAILED', 'CANCELLED');

CREATE TYPE "ProviderOperationStatus" AS ENUM ('QUEUED', 'RUNNING', 'SUCCEEDED', 'FAILED', 'INDETERMINATE', 'RETRYING', 'CANCELLED');

CREATE TYPE "IncidentStatus" AS ENUM ('OPEN', 'ACKNOWLEDGED', 'MITIGATING', 'RESOLVED', 'CLOSED');

CREATE TYPE "IncidentSeverity" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

ALTER TYPE "AgentRunStatus" ADD VALUE 'INDETERMINATE' BEFORE 'CANCELLED';

ALTER TYPE "AgentActionStatus" ADD VALUE 'INDETERMINATE' BEFORE 'CANCELLED';

SET lock_timeout = '5s';

ALTER TABLE "agentTask"
ADD COLUMN "subjectType" "SubjectType",
ADD COLUMN "subjectId" TEXT,
ADD COLUMN "subjectLabel" TEXT,
ADD COLUMN "state" "AgentTaskState",
ADD COLUMN "operationKey" TEXT,
ADD COLUMN "idempotencyKey" TEXT,
ADD COLUMN "budgetTokens" INTEGER,
ADD COLUMN "budgetUsd" DECIMAL(12, 6),
ADD COLUMN "costUsd" DECIMAL(12, 6),
ADD COLUMN "modelId" TEXT,
ADD COLUMN "inputTokens" INTEGER,
ADD COLUMN "outputTokens" INTEGER,
ADD COLUMN "modelUsage" JSONB,
ADD COLUMN "channel" TEXT,
ADD COLUMN "provider" TEXT,
ADD COLUMN "scopes" JSONB,
ADD COLUMN "approvalRequestId" TEXT,
ADD COLUMN "approvalContentDigest" TEXT;

UPDATE "agentTask"
SET "state" = CASE
    WHEN "finishedAt" IS NOT NULL AND ("outcome" LIKE 'Gave up after%' OR "outcome" LIKE 'Failed after%') THEN 'FAILED'::"AgentTaskState"
    WHEN "finishedAt" IS NOT NULL AND (
        "outcome" = 'ran'
        OR "outcome" = 'Prospect research recorded.'
        OR "outcome" = 'Approved email sent.'
        OR "outcome" = 'Three-step outreach sequence prepared for review.'
        OR "outcome" = 'Customer systems and data onboarding plan recorded.'
        OR "outcome" = 'Everything Context.dev returned was already on the record.'
        OR "outcome" LIKE 'Created % fresh candidates and queued full research.'
        OR "outcome" LIKE 'Imported % website enquiries;%'
        OR "outcome" LIKE 'Stored % AgentMail messages;%'
        OR "outcome" LIKE 'Imported % Granola notes;%'
        OR "outcome" LIKE 'Picture stored from %.'
        OR "outcome" LIKE 'Filled %'
    ) THEN 'SUCCEEDED'::"AgentTaskState"
    WHEN "finishedAt" IS NOT NULL THEN 'UNKNOWN'::"AgentTaskState"
    WHEN "leasedUntil" IS NOT NULL AND "leasedUntil" > CURRENT_TIMESTAMP THEN 'LEASED'::"AgentTaskState"
    ELSE 'QUEUED'::"AgentTaskState"
END;

ALTER TABLE "agentTask"
ALTER COLUMN "state" SET DEFAULT 'QUEUED',
ALTER COLUMN "state" SET NOT NULL;

ALTER TABLE "agentRun"
ADD COLUMN "subjectType" "SubjectType",
ADD COLUMN "subjectId" TEXT,
ADD COLUMN "subjectLabel" TEXT,
ADD COLUMN "operationKey" TEXT,
ADD COLUMN "budgetTokens" INTEGER,
ADD COLUMN "budgetUsd" DECIMAL(12, 6),
ADD COLUMN "modelUsage" JSONB,
ADD COLUMN "channel" TEXT,
ADD COLUMN "provider" TEXT,
ADD COLUMN "scopes" JSONB,
ADD COLUMN "approvalRequestId" TEXT,
ADD COLUMN "approvalContentDigest" TEXT;

ALTER TABLE "agentAction"
ADD COLUMN "subjectType" "SubjectType",
ADD COLUMN "subjectId" TEXT,
ADD COLUMN "subjectLabel" TEXT,
ADD COLUMN "operationKey" TEXT,
ADD COLUMN "budgetTokens" INTEGER,
ADD COLUMN "budgetUsd" DECIMAL(12, 6),
ADD COLUMN "costUsd" DECIMAL(12, 6),
ADD COLUMN "modelId" TEXT,
ADD COLUMN "inputTokens" INTEGER,
ADD COLUMN "outputTokens" INTEGER,
ADD COLUMN "modelUsage" JSONB,
ADD COLUMN "channel" TEXT,
ADD COLUMN "scopes" JSONB,
ADD COLUMN "approvalRequestId" TEXT;

ALTER TABLE "agentTask"
ADD CONSTRAINT "agentTask_subject_pair_check" CHECK (num_nonnulls("subjectType", "subjectId") IN (0, 2)),
ADD CONSTRAINT "agentTask_approval_pair_check" CHECK (num_nonnulls("approvalRequestId", "approvalContentDigest") IN (0, 2));

ALTER TABLE "agentRun"
ADD CONSTRAINT "agentRun_subject_pair_check" CHECK (num_nonnulls("subjectType", "subjectId") IN (0, 2)),
ADD CONSTRAINT "agentRun_approval_pair_check" CHECK (num_nonnulls("approvalRequestId", "approvalContentDigest") IN (0, 2));

ALTER TABLE "agentAction"
ADD CONSTRAINT "agentAction_subject_pair_check" CHECK (num_nonnulls("subjectType", "subjectId") IN (0, 2)),
ADD CONSTRAINT "agentAction_approval_digest_check" CHECK ("approvalRequestId" IS NULL OR "requestHash" IS NOT NULL);

RESET lock_timeout;

CREATE TABLE "workItem" (
    "id" TEXT NOT NULL,
    "subjectType" "SubjectType" NOT NULL,
    "subjectId" TEXT NOT NULL,
    "subjectLabel" TEXT,
    "ownerId" TEXT,
    "queue" TEXT NOT NULL,
    "urgency" "WorkItemUrgency" NOT NULL DEFAULT 'NORMAL',
    "dueAt" TIMESTAMP(3),
    "nextReviewAt" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 0,
    "evidence" JSONB,
    "reason" TEXT NOT NULL,
    "state" "WorkItemState" NOT NULL DEFAULT 'OPEN',
    "primaryAction" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "workItem_waiting_review_check" CHECK ("state" <> 'WAITING' OR "nextReviewAt" IS NOT NULL),
    CONSTRAINT "workItem_in_progress_started_check" CHECK ("state" <> 'IN_PROGRESS' OR "startedAt" IS NOT NULL),
    CONSTRAINT "workItem_completed_state_check" CHECK ("state" NOT IN ('DONE', 'DISMISSED') OR "completedAt" IS NOT NULL),
    CONSTRAINT "workItem_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "approvalRequest" (
    "id" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "contentDigest" TEXT NOT NULL,
    "contentSnapshot" JSONB NOT NULL,
    "targetType" "SubjectType" NOT NULL,
    "targetId" TEXT NOT NULL,
    "targetLabel" TEXT,
    "risk" "ApprovalRequestRisk" NOT NULL,
    "policyVersion" TEXT NOT NULL,
    "requestorId" TEXT,
    "approverId" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "invalidationVersion" INTEGER NOT NULL DEFAULT 0,
    "version" INTEGER NOT NULL DEFAULT 0,
    "status" "ApprovalRequestStatus" NOT NULL DEFAULT 'PENDING',
    "idempotencyKey" TEXT NOT NULL,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decidedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "approvalRequest_decision_fields_check" CHECK ("status" NOT IN ('APPROVED', 'REJECTED', 'EXECUTED') OR ("approverId" IS NOT NULL AND "decidedAt" IS NOT NULL)),
    CONSTRAINT "approvalRequest_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "policyGrant" (
    "id" TEXT NOT NULL,
    "actorType" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "operation" TEXT NOT NULL,
    "limits" JSONB NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "grantKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "policyGrant_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "actionReceipt" (
    "id" TEXT NOT NULL,
    "operationKey" TEXT,
    "idempotencyKey" TEXT NOT NULL,
    "requestHash" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "channel" TEXT,
    "externalId" TEXT,
    "providerReadback" JSONB,
    "costUsd" DECIMAL(12, 6),
    "result" JSONB,
    "errorCode" TEXT,
    "errorMessage" TEXT,
    "status" "ActionReceiptStatus" NOT NULL DEFAULT 'PENDING',
    "providerAccountId" TEXT,
    "agentActionId" TEXT,
    "approvalRequestId" TEXT,
    "providerOperationId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "actionReceipt_agent_action_scope_check" CHECK ("agentActionId" IS NULL OR "channel" IS NOT NULL),
    CONSTRAINT "actionReceipt_provider_operation_scope_check" CHECK ("providerOperationId" IS NULL OR "providerAccountId" IS NOT NULL),
    CONSTRAINT "actionReceipt_terminal_completed_check" CHECK ("status" = 'PENDING' OR "completedAt" IS NOT NULL),
    CONSTRAINT "actionReceipt_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "connectorBinding" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "scopes" JSONB NOT NULL,
    "secretReferenceId" TEXT NOT NULL,
    "status" "ConnectorBindingStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "connectorBinding_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "connectorHealth" (
    "id" TEXT NOT NULL,
    "bindingId" TEXT NOT NULL,
    "cursor" TEXT,
    "freshnessAt" TIMESTAMP(3),
    "paused" BOOLEAN NOT NULL DEFAULT false,
    "pausedAt" TIMESTAMP(3),
    "pauseReason" TEXT,
    "lastError" TEXT,
    "errorCode" TEXT,
    "consecutiveFailures" INTEGER NOT NULL DEFAULT 0,
    "lastAttemptAt" TIMESTAMP(3),
    "lastSuccessAt" TIMESTAMP(3),
    "nextRetryAt" TIMESTAMP(3),
    "testState" "ConnectorTestState" NOT NULL DEFAULT 'NOT_TESTED',
    "testedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "connectorHealth_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "campaign" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "channel" TEXT,
    "objective" TEXT,
    "status" "CampaignStatus" NOT NULL DEFAULT 'DRAFT',
    "ownerId" TEXT,
    "budget" DECIMAL(14, 2),
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "startsAt" TIMESTAMP(3),
    "endsAt" TIMESTAMP(3),
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "campaign_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "contentItem" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT,
    "kind" TEXT NOT NULL,
    "title" TEXT,
    "brief" TEXT,
    "body" TEXT,
    "status" "ContentItemStatus" NOT NULL DEFAULT 'DRAFT',
    "sourceUrl" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "contentItem_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "contentVariant" (
    "id" TEXT NOT NULL,
    "contentItemId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "status" "ContentVariantStatus" NOT NULL DEFAULT 'DRAFT',
    "experimentId" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "contentVariant_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "experiment" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "hypothesis" TEXT,
    "metric" TEXT,
    "status" "ExperimentStatus" NOT NULL DEFAULT 'DRAFT',
    "startsAt" TIMESTAMP(3),
    "endsAt" TIMESTAMP(3),
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "experiment_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "socialMention" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT,
    "source" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "authorName" TEXT,
    "body" TEXT NOT NULL,
    "url" TEXT,
    "sentiment" TEXT,
    "occurredAt" TIMESTAMP(3),
    "status" "SocialMentionStatus" NOT NULL DEFAULT 'NEW',
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "socialMention_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "triageProposal" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT,
    "contentItemId" TEXT,
    "socialMentionId" TEXT,
    "subjectType" "SubjectType",
    "subjectId" TEXT,
    "action" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "evidence" JSONB,
    "status" "MarketingTriageProposalStatus" NOT NULL DEFAULT 'PROPOSED',
    "idempotencyKey" TEXT,
    "decidedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "triageProposal_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "marketingTouchpoint" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT,
    "experimentId" TEXT,
    "subjectType" "SubjectType" NOT NULL,
    "subjectId" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "provider" TEXT,
    "externalId" TEXT,
    "idempotencyKey" TEXT,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "marketingTouchpoint_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "attributionCredit" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT,
    "touchpointId" TEXT,
    "subjectType" "SubjectType" NOT NULL,
    "subjectId" TEXT NOT NULL,
    "model" "AttributionModel" NOT NULL,
    "credit" DECIMAL(10, 6) NOT NULL,
    "value" DECIMAL(14, 2),
    "currency" TEXT,
    "idempotencyKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "attributionCredit_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "publication" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT,
    "contentItemId" TEXT,
    "contentVariantId" TEXT,
    "connectorBindingId" TEXT,
    "channel" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "externalId" TEXT,
    "idempotencyKey" TEXT NOT NULL,
    "contentDigest" TEXT NOT NULL,
    "status" "PublicationStatus" NOT NULL DEFAULT 'PLANNED',
    "approvalRequestId" TEXT,
    "actionReceiptId" TEXT,
    "scheduledAt" TIMESTAMP(3),
    "publishedAt" TIMESTAMP(3),
    "receipt" JSONB,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "publication_receipt_approval_check" CHECK ("actionReceiptId" IS NULL OR "approvalRequestId" IS NOT NULL),
    CONSTRAINT "publication_published_evidence_check" CHECK ("status" <> 'PUBLISHED' OR ("approvalRequestId" IS NOT NULL AND "actionReceiptId" IS NOT NULL AND "publishedAt" IS NOT NULL)),
    CONSTRAINT "publication_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "marketingSourceReceipt" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT,
    "contentItemId" TEXT,
    "source" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "url" TEXT,
    "contentHash" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "capturedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "marketingSourceReceipt_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "supportCase" (
    "id" TEXT NOT NULL,
    "customerAccountId" TEXT,
    "dedupeKey" TEXT NOT NULL,
    "connectorBindingId" TEXT,
    "subjectType" "SubjectType",
    "subjectId" TEXT,
    "provider" TEXT,
    "externalId" TEXT,
    "channel" TEXT NOT NULL,
    "queue" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "status" "SupportCaseStatus" NOT NULL DEFAULT 'NEW',
    "priority" "SupportCasePriority" NOT NULL DEFAULT 'NORMAL',
    "matchState" "SupportIdentityMatchState" NOT NULL DEFAULT 'UNMATCHED',
    "matchMethod" TEXT,
    "matchEvidence" JSONB,
    "matchedAt" TIMESTAMP(3),
    "matchedById" TEXT,
    "ownerId" TEXT,
    "slaPolicyId" TEXT,
    "openedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "firstResponseAt" TIMESTAMP(3),
    "dueAt" TIMESTAMP(3),
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "supportCase_connector_identity_check" CHECK ("connectorBindingId" IS NULL OR "provider" IS NOT NULL),
    CONSTRAINT "supportCase_subject_pair_check" CHECK (num_nonnulls("subjectType", "subjectId") IN (0, 2)),
    CONSTRAINT "supportCase_match_evidence_check" CHECK ("matchState" <> 'MATCHED' OR ("matchMethod" IS NOT NULL AND "matchedAt" IS NOT NULL AND "matchedById" IS NOT NULL AND ("customerAccountId" IS NOT NULL OR ("subjectType" IS NOT NULL AND "subjectId" IS NOT NULL)))),
    CONSTRAINT "supportCase_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "supportCaseSource" (
    "id" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "connectorBindingId" TEXT,
    "source" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "url" TEXT,
    "contentHash" TEXT,
    "payload" JSONB NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "supportCaseSource_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "supportCaseEvent" (
    "id" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "eventType" "SupportCaseEventType" NOT NULL,
    "actorType" TEXT,
    "actorId" TEXT,
    "body" TEXT,
    "data" JSONB,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "supportCaseEvent_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "supportSlaPolicy" (
    "id" TEXT NOT NULL,
    "customerAccountId" TEXT,
    "policyKey" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "channel" TEXT,
    "priority" "SupportCasePriority" NOT NULL DEFAULT 'NORMAL',
    "timezone" TEXT NOT NULL DEFAULT 'UTC',
    "businessHours" JSONB,
    "status" "SupportSlaPolicyStatus" NOT NULL DEFAULT 'ACTIVE',
    "firstResponseMinutes" INTEGER NOT NULL,
    "resolutionMinutes" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "supportSlaPolicy_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "supportTriageProposal" (
    "id" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "queue" TEXT,
    "priority" "SupportCasePriority",
    "category" TEXT,
    "reason" TEXT NOT NULL,
    "evidence" JSONB,
    "proposedOwnerId" TEXT,
    "status" "SupportTriageProposalStatus" NOT NULL DEFAULT 'PROPOSED',
    "decidedById" TEXT,
    "decidedAt" TIMESTAMP(3),
    "idempotencyKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "supportTriageProposal_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "supportReplyDraft" (
    "id" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "recipients" JSONB NOT NULL,
    "subject" TEXT,
    "body" TEXT NOT NULL,
    "contentDigest" TEXT NOT NULL,
    "status" "SupportReplyDraftStatus" NOT NULL DEFAULT 'DRAFT',
    "approvalRequestId" TEXT,
    "idempotencyKey" TEXT NOT NULL,
    "actionReceiptId" TEXT,
    "sentAt" TIMESTAMP(3),
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "supportReplyDraft_receipt_approval_check" CHECK ("actionReceiptId" IS NULL OR "approvalRequestId" IS NOT NULL),
    CONSTRAINT "supportReplyDraft_sent_evidence_check" CHECK ("status" <> 'SENT' OR ("approvalRequestId" IS NOT NULL AND "actionReceiptId" IS NOT NULL AND "sentAt" IS NOT NULL)),
    CONSTRAINT "supportReplyDraft_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "supportKnowledgeDocument" (
    "id" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "externalId" TEXT,
    "title" TEXT NOT NULL,
    "uri" TEXT,
    "content" TEXT,
    "checksum" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "status" "SupportKnowledgeDocumentStatus" NOT NULL DEFAULT 'DRAFT',
    "audience" "SupportKnowledgeAudience" NOT NULL DEFAULT 'INTERNAL',
    "metadata" JSONB,
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "supportKnowledgeDocument_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "supportEscalation" (
    "id" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "queue" TEXT NOT NULL,
    "severity" "SupportEscalationSeverity" NOT NULL,
    "reason" TEXT NOT NULL,
    "status" "SupportEscalationStatus" NOT NULL DEFAULT 'OPEN',
    "assignedToId" TEXT,
    "dueAt" TIMESTAMP(3),
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "supportEscalation_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "supportProductHandoff" (
    "id" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "productArea" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "impact" TEXT,
    "status" "SupportProductHandoffStatus" NOT NULL DEFAULT 'PROPOSED',
    "externalKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "supportProductHandoff_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "customerAccount" (
    "id" TEXT NOT NULL,
    "companyId" TEXT,
    "customerOnboardingId" TEXT,
    "name" TEXT NOT NULL,
    "externalKey" TEXT,
    "status" "CustomerAccountStatus" NOT NULL DEFAULT 'PROSPECT',
    "ownerId" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "customerAccount_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "customerInstance" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "environment" TEXT NOT NULL,
    "region" TEXT,
    "status" "CustomerInstanceStatus" NOT NULL DEFAULT 'PROVISIONING',
    "externalId" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "customerInstance_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "providerAccount" (
    "id" TEXT NOT NULL,
    "customerAccountId" TEXT NOT NULL,
    "instanceId" TEXT,
    "provider" TEXT NOT NULL,
    "externalAccountId" TEXT NOT NULL,
    "displayName" TEXT,
    "scopes" JSONB,
    "secretReferenceId" TEXT,
    "status" "ProviderAccountStatus" NOT NULL DEFAULT 'PENDING',
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "providerAccount_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "providerResource" (
    "id" TEXT NOT NULL,
    "customerAccountId" TEXT NOT NULL,
    "providerAccountId" TEXT NOT NULL,
    "instanceId" TEXT,
    "provider" TEXT NOT NULL,
    "resourceType" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "name" TEXT,
    "status" "ProviderResourceStatus" NOT NULL DEFAULT 'DISCOVERED',
    "observed" JSONB,
    "observedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "providerResource_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "secretReference" (
    "id" TEXT NOT NULL,
    "customerAccountId" TEXT,
    "provider" TEXT NOT NULL,
    "externalAccountId" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "version" TEXT,
    "status" "SecretReferenceStatus" NOT NULL DEFAULT 'ACTIVE',
    "capabilityMetadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "secretReference_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "desiredStateRevision" (
    "id" TEXT NOT NULL,
    "instanceId" TEXT NOT NULL,
    "revision" INTEGER NOT NULL,
    "digest" TEXT NOT NULL,
    "desired" JSONB NOT NULL,
    "status" "DesiredStateRevisionStatus" NOT NULL DEFAULT 'DRAFT',
    "source" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "desiredStateRevision_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "observedState" (
    "id" TEXT NOT NULL,
    "instanceId" TEXT NOT NULL,
    "digest" TEXT,
    "observed" JSONB NOT NULL,
    "status" "ObservedStateStatus" NOT NULL DEFAULT 'UNKNOWN',
    "source" TEXT,
    "observedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "observedState_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "plan" (
    "id" TEXT NOT NULL,
    "instanceId" TEXT NOT NULL,
    "desiredRevisionId" TEXT,
    "observedStateId" TEXT NOT NULL,
    "preconditionDigest" TEXT NOT NULL,
    "contentDigest" TEXT NOT NULL,
    "status" "PlanStatus" NOT NULL DEFAULT 'DRAFT',
    "idempotencyKey" TEXT NOT NULL,
    "approvalRequestId" TEXT,
    "summary" TEXT,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "plan_execution_approval_check" CHECK ("status" NOT IN ('RUNNING', 'SUCCEEDED', 'FAILED') OR "approvalRequestId" IS NOT NULL),
    CONSTRAINT "plan_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "planStep" (
    "id" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "instanceId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "operation" TEXT NOT NULL,
    "provider" TEXT,
    "resourceType" TEXT,
    "resourceId" TEXT,
    "desired" JSONB,
    "observed" JSONB,
    "status" "PlanStepStatus" NOT NULL DEFAULT 'PENDING',
    "operationKey" TEXT,
    "idempotencyKey" TEXT,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "planStep_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "controlCommand" (
    "id" TEXT NOT NULL,
    "instanceId" TEXT NOT NULL,
    "command" TEXT NOT NULL,
    "payload" JSONB,
    "contentDigest" TEXT NOT NULL,
    "status" "ControlCommandStatus" NOT NULL DEFAULT 'QUEUED',
    "idempotencyKey" TEXT NOT NULL,
    "approvalRequestId" TEXT,
    "requestedByType" TEXT,
    "requestedById" TEXT,
    "result" JSONB,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "controlCommand_execution_approval_check" CHECK ("status" NOT IN ('RUNNING', 'SUCCEEDED', 'FAILED') OR "approvalRequestId" IS NOT NULL),
    CONSTRAINT "controlCommand_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "providerOperation" (
    "id" TEXT NOT NULL,
    "customerAccountId" TEXT NOT NULL,
    "instanceId" TEXT,
    "providerAccountId" TEXT NOT NULL,
    "planStepId" TEXT,
    "controlCommandId" TEXT,
    "provider" TEXT NOT NULL,
    "operation" TEXT NOT NULL,
    "operationKey" TEXT,
    "idempotencyKey" TEXT NOT NULL,
    "status" "ProviderOperationStatus" NOT NULL DEFAULT 'QUEUED',
    "request" JSONB,
    "response" JSONB,
    "externalId" TEXT,
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "errorCode" TEXT,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "providerOperation_reference_scope_check" CHECK (("planStepId" IS NULL AND "controlCommandId" IS NULL) OR ("instanceId" IS NOT NULL AND "customerAccountId" IS NOT NULL AND "provider" IS NOT NULL)),
    CONSTRAINT "providerOperation_single_origin_check" CHECK (num_nonnulls("planStepId", "controlCommandId") <= 1),
    CONSTRAINT "providerOperation_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "incident" (
    "id" TEXT NOT NULL,
    "instanceId" TEXT NOT NULL,
    "provider" TEXT,
    "fingerprint" TEXT,
    "severity" "IncidentSeverity" NOT NULL,
    "status" "IncidentStatus" NOT NULL DEFAULT 'OPEN',
    "title" TEXT NOT NULL,
    "summary" TEXT,
    "detectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "acknowledgedAt" TIMESTAMP(3),
    "resolvedAt" TIMESTAMP(3),
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "incident_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "usageSample" (
    "id" TEXT NOT NULL,
    "customerAccountId" TEXT NOT NULL,
    "instanceId" TEXT,
    "providerAccountId" TEXT,
    "provider" TEXT,
    "metric" TEXT NOT NULL,
    "quantity" DECIMAL(20, 6) NOT NULL,
    "unit" TEXT NOT NULL,
    "observedAt" TIMESTAMP(3) NOT NULL,
    "dimensions" JSONB,
    "source" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "usageSample_provider_scope_check" CHECK ("providerAccountId" IS NULL OR "provider" IS NOT NULL),
    CONSTRAINT "usageSample_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "costLineItem" (
    "id" TEXT NOT NULL,
    "customerAccountId" TEXT NOT NULL,
    "instanceId" TEXT,
    "providerAccountId" TEXT,
    "provider" TEXT NOT NULL,
    "externalId" TEXT,
    "category" TEXT NOT NULL,
    "description" TEXT,
    "quantity" DECIMAL(20, 6) NOT NULL,
    "unitCost" DECIMAL(20, 8) NOT NULL,
    "totalCost" DECIMAL(20, 8) NOT NULL,
    "currency" TEXT NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "costLineItem_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "agentTask_idempotencyKey_key" ON "agentTask"("idempotencyKey");
CREATE UNIQUE INDEX "agentAction_receipt_scope_key" ON "agentAction"("id", "provider", "channel", "requestHash");
CREATE UNIQUE INDEX "approvalRequest_idempotencyKey_key" ON "approvalRequest"("idempotencyKey");
CREATE UNIQUE INDEX "approvalRequest_action_contentDigest_targetType_targetId_po_key" ON "approvalRequest"("action", "contentDigest", "targetType", "targetId", "policyVersion", "invalidationVersion");
CREATE UNIQUE INDEX "approvalRequest_id_contentDigest_key" ON "approvalRequest"("id", "contentDigest");
CREATE UNIQUE INDEX "approvalRequest_id_version_key" ON "approvalRequest"("id", "version");
CREATE UNIQUE INDEX "policyGrant_grantKey_key" ON "policyGrant"("grantKey");
CREATE UNIQUE INDEX "actionReceipt_idempotencyKey_key" ON "actionReceipt"("idempotencyKey");
CREATE UNIQUE INDEX "actionReceipt_providerAccountId_externalId_key" ON "actionReceipt"("providerAccountId", "externalId");
CREATE UNIQUE INDEX "actionReceipt_unbound_provider_externalId_key" ON "actionReceipt"("provider", "externalId") WHERE ("providerAccountId" IS NULL);
CREATE UNIQUE INDEX "actionReceipt_provider_operation_scope_key" ON "actionReceipt"("providerOperationId", "providerAccountId", "provider");
CREATE UNIQUE INDEX "actionReceipt_receipt_scope_key" ON "actionReceipt"("id", "approvalRequestId", "requestHash", "provider", "channel");
CREATE UNIQUE INDEX "connectorBinding_provider_accountId_key" ON "connectorBinding"("provider", "accountId");
CREATE UNIQUE INDEX "connectorBinding_id_provider_key" ON "connectorBinding"("id", "provider");
CREATE UNIQUE INDEX "connectorHealth_bindingId_key" ON "connectorHealth"("bindingId");
CREATE UNIQUE INDEX "contentVariant_contentItemId_key_key" ON "contentVariant"("contentItemId", "key");
CREATE UNIQUE INDEX "experiment_campaignId_key_key" ON "experiment"("campaignId", "key");
CREATE UNIQUE INDEX "socialMention_source_externalId_key" ON "socialMention"("source", "externalId");
CREATE UNIQUE INDEX "triageProposal_idempotencyKey_key" ON "triageProposal"("idempotencyKey");
CREATE UNIQUE INDEX "marketingTouchpoint_idempotencyKey_key" ON "marketingTouchpoint"("idempotencyKey");
CREATE UNIQUE INDEX "marketingTouchpoint_channel_externalId_key" ON "marketingTouchpoint"("channel", "externalId");
CREATE UNIQUE INDEX "attributionCredit_idempotencyKey_key" ON "attributionCredit"("idempotencyKey");
CREATE UNIQUE INDEX "publication_idempotencyKey_key" ON "publication"("idempotencyKey");
CREATE UNIQUE INDEX "publication_actionReceiptId_key" ON "publication"("actionReceiptId");
CREATE UNIQUE INDEX "publication_connectorBindingId_externalId_key" ON "publication"("connectorBindingId", "externalId");
CREATE UNIQUE INDEX "publication_unbound_provider_externalId_key" ON "publication"("provider", "externalId") WHERE ("connectorBindingId" IS NULL);
CREATE UNIQUE INDEX "publication_receipt_scope_key" ON "publication"("actionReceiptId", "approvalRequestId", "contentDigest", "provider", "channel");
CREATE UNIQUE INDEX "marketingSourceReceipt_source_externalId_key" ON "marketingSourceReceipt"("source", "externalId");
CREATE UNIQUE INDEX "supportCase_dedupeKey_key" ON "supportCase"("dedupeKey");
CREATE UNIQUE INDEX "supportCase_connectorBindingId_externalId_key" ON "supportCase"("connectorBindingId", "externalId");
CREATE UNIQUE INDEX "supportCase_unbound_provider_externalId_key" ON "supportCase"("provider", "externalId") WHERE ("connectorBindingId" IS NULL);
CREATE UNIQUE INDEX "supportCaseSource_connectorBindingId_source_externalId_key" ON "supportCaseSource"("connectorBindingId", "source", "externalId");
CREATE UNIQUE INDEX "supportCaseSource_unbound_source_externalId_key" ON "supportCaseSource"("source", "externalId") WHERE ("connectorBindingId" IS NULL);
CREATE UNIQUE INDEX "supportSlaPolicy_policyKey_key" ON "supportSlaPolicy"("policyKey");
CREATE UNIQUE INDEX "supportTriageProposal_idempotencyKey_key" ON "supportTriageProposal"("idempotencyKey");
CREATE UNIQUE INDEX "supportReplyDraft_idempotencyKey_key" ON "supportReplyDraft"("idempotencyKey");
CREATE UNIQUE INDEX "supportReplyDraft_actionReceiptId_key" ON "supportReplyDraft"("actionReceiptId");
CREATE UNIQUE INDEX "supportReplyDraft_receipt_scope_key" ON "supportReplyDraft"("actionReceiptId", "approvalRequestId", "contentDigest", "provider", "channel");
CREATE UNIQUE INDEX "supportKnowledgeDocument_source_externalId_key" ON "supportKnowledgeDocument"("source", "externalId");
CREATE UNIQUE INDEX "supportProductHandoff_caseId_externalKey_key" ON "supportProductHandoff"("caseId", "externalKey");
CREATE UNIQUE INDEX "customerAccount_externalKey_key" ON "customerAccount"("externalKey");
CREATE UNIQUE INDEX "customerAccount_companyId_key" ON "customerAccount"("companyId");
CREATE UNIQUE INDEX "customerAccount_customerOnboardingId_key" ON "customerAccount"("customerOnboardingId");
CREATE UNIQUE INDEX "customerInstance_accountId_key_key" ON "customerInstance"("accountId", "key");
CREATE UNIQUE INDEX "customerInstance_id_accountId_key" ON "customerInstance"("id", "accountId");
CREATE UNIQUE INDEX "providerAccount_customerAccountId_provider_externalAccountI_key" ON "providerAccount"("customerAccountId", "provider", "externalAccountId");
CREATE UNIQUE INDEX "providerAccount_id_customerAccountId_key" ON "providerAccount"("id", "customerAccountId");
CREATE UNIQUE INDEX "providerAccount_id_customerAccountId_provider_key" ON "providerAccount"("id", "customerAccountId", "provider");
CREATE UNIQUE INDEX "providerAccount_id_provider_key" ON "providerAccount"("id", "provider");
CREATE UNIQUE INDEX "providerResource_providerAccountId_resourceType_externalId_key" ON "providerResource"("providerAccountId", "resourceType", "externalId");
CREATE UNIQUE INDEX "secretReference_provider_reference_key" ON "secretReference"("provider", "reference");
CREATE UNIQUE INDEX "secretReference_id_provider_externalAccountId_key" ON "secretReference"("id", "provider", "externalAccountId");
CREATE UNIQUE INDEX "secretReference_id_customerAccountId_provider_externalAccou_key" ON "secretReference"("id", "customerAccountId", "provider", "externalAccountId");
CREATE UNIQUE INDEX "desiredStateRevision_instanceId_revision_key" ON "desiredStateRevision"("instanceId", "revision");
CREATE UNIQUE INDEX "desiredStateRevision_instanceId_digest_key" ON "desiredStateRevision"("instanceId", "digest");
CREATE UNIQUE INDEX "desiredStateRevision_id_instanceId_key" ON "desiredStateRevision"("id", "instanceId");
CREATE UNIQUE INDEX "observedState_id_instanceId_key" ON "observedState"("id", "instanceId");
CREATE UNIQUE INDEX "plan_idempotencyKey_key" ON "plan"("idempotencyKey");
CREATE UNIQUE INDEX "plan_id_instanceId_key" ON "plan"("id", "instanceId");
CREATE UNIQUE INDEX "planStep_idempotencyKey_key" ON "planStep"("idempotencyKey");
CREATE UNIQUE INDEX "planStep_planId_position_key" ON "planStep"("planId", "position");
CREATE UNIQUE INDEX "planStep_provider_scope_key" ON "planStep"("id", "instanceId", "provider");
CREATE UNIQUE INDEX "controlCommand_idempotencyKey_key" ON "controlCommand"("idempotencyKey");
CREATE UNIQUE INDEX "controlCommand_id_instanceId_key" ON "controlCommand"("id", "instanceId");
CREATE UNIQUE INDEX "providerOperation_idempotencyKey_key" ON "providerOperation"("idempotencyKey");
CREATE UNIQUE INDEX "providerOperation_providerAccountId_externalId_key" ON "providerOperation"("providerAccountId", "externalId");
CREATE UNIQUE INDEX "providerOperation_receipt_scope_key" ON "providerOperation"("id", "providerAccountId", "provider");
CREATE UNIQUE INDEX "incident_instanceId_fingerprint_key" ON "incident"("instanceId", "fingerprint");
CREATE UNIQUE INDEX "usageSample_customerAccountId_metric_observedAt_key" ON "usageSample"("customerAccountId", "metric", "observedAt");
CREATE UNIQUE INDEX "costLineItem_providerAccountId_externalId_key" ON "costLineItem"("providerAccountId", "externalId");
CREATE UNIQUE INDEX "costLineItem_unbound_provider_externalId_key" ON "costLineItem"("provider", "externalId") WHERE ("providerAccountId" IS NULL);

CREATE INDEX "agentTask_subjectType_subjectId_idx" ON "agentTask"("subjectType", "subjectId");
CREATE INDEX "agentTask_operationKey_idx" ON "agentTask"("operationKey");
CREATE INDEX "agentTask_approval_scope_idx" ON "agentTask"("approvalRequestId", "approvalContentDigest");
CREATE INDEX "agentTask_channel_provider_idx" ON "agentTask"("channel", "provider");
CREATE INDEX "agentRun_subjectType_subjectId_idx" ON "agentRun"("subjectType", "subjectId");
CREATE INDEX "agentRun_operationKey_idx" ON "agentRun"("operationKey");
CREATE INDEX "agentRun_approval_scope_idx" ON "agentRun"("approvalRequestId", "approvalContentDigest");
CREATE INDEX "agentRun_channel_provider_idx" ON "agentRun"("channel", "provider");
CREATE INDEX "agentAction_subjectType_subjectId_idx" ON "agentAction"("subjectType", "subjectId");
CREATE INDEX "agentAction_operationKey_idx" ON "agentAction"("operationKey");
CREATE INDEX "agentAction_approval_scope_idx" ON "agentAction"("approvalRequestId", "requestHash");
CREATE INDEX "agentAction_channel_provider_idx" ON "agentAction"("channel", "provider");
CREATE INDEX "workItem_state_urgency_dueAt_idx" ON "workItem"("state", "urgency", "dueAt");
CREATE INDEX "workItem_state_nextReviewAt_idx" ON "workItem"("state", "nextReviewAt");
CREATE INDEX "workItem_ownerId_state_dueAt_idx" ON "workItem"("ownerId", "state", "dueAt");
CREATE INDEX "workItem_queue_state_dueAt_idx" ON "workItem"("queue", "state", "dueAt");
CREATE INDEX "workItem_subjectType_subjectId_idx" ON "workItem"("subjectType", "subjectId");
CREATE INDEX "approvalRequest_status_expiresAt_idx" ON "approvalRequest"("status", "expiresAt");
CREATE INDEX "approvalRequest_status_version_updatedAt_idx" ON "approvalRequest"("status", "version", "updatedAt");
CREATE INDEX "approvalRequest_targetType_targetId_createdAt_idx" ON "approvalRequest"("targetType", "targetId", "createdAt");
CREATE INDEX "approvalRequest_requestorId_createdAt_idx" ON "approvalRequest"("requestorId", "createdAt");
CREATE INDEX "approvalRequest_approverId_status_createdAt_idx" ON "approvalRequest"("approverId", "status", "createdAt");
CREATE INDEX "policyGrant_actorType_actorId_channel_operation_idx" ON "policyGrant"("actorType", "actorId", "channel", "operation");
CREATE INDEX "policyGrant_accountId_expiresAt_idx" ON "policyGrant"("accountId", "expiresAt");
CREATE INDEX "policyGrant_revokedAt_expiresAt_idx" ON "policyGrant"("revokedAt", "expiresAt");
CREATE INDEX "actionReceipt_requestHash_idx" ON "actionReceipt"("requestHash");
CREATE INDEX "actionReceipt_operationKey_idx" ON "actionReceipt"("operationKey");
CREATE INDEX "actionReceipt_status_createdAt_idx" ON "actionReceipt"("status", "createdAt");
CREATE INDEX "actionReceipt_agentActionId_createdAt_idx" ON "actionReceipt"("agentActionId", "createdAt");
CREATE INDEX "actionReceipt_providerAccountId_createdAt_idx" ON "actionReceipt"("providerAccountId", "createdAt");
CREATE INDEX "connectorBinding_status_updatedAt_idx" ON "connectorBinding"("status", "updatedAt");
CREATE INDEX "connectorHealth_paused_freshnessAt_idx" ON "connectorHealth"("paused", "freshnessAt");
CREATE INDEX "connectorHealth_paused_nextRetryAt_idx" ON "connectorHealth"("paused", "nextRetryAt");
CREATE INDEX "connectorHealth_testState_freshnessAt_idx" ON "connectorHealth"("testState", "freshnessAt");
CREATE INDEX "campaign_status_startsAt_idx" ON "campaign"("status", "startsAt");
CREATE INDEX "campaign_ownerId_status_idx" ON "campaign"("ownerId", "status");
CREATE INDEX "campaign_channel_status_idx" ON "campaign"("channel", "status");
CREATE INDEX "contentItem_campaignId_status_updatedAt_idx" ON "contentItem"("campaignId", "status", "updatedAt");
CREATE INDEX "contentItem_status_updatedAt_idx" ON "contentItem"("status", "updatedAt");
CREATE INDEX "contentVariant_channel_status_idx" ON "contentVariant"("channel", "status");
CREATE INDEX "contentVariant_experimentId_status_idx" ON "contentVariant"("experimentId", "status");
CREATE INDEX "experiment_status_startsAt_idx" ON "experiment"("status", "startsAt");
CREATE INDEX "socialMention_campaignId_status_occurredAt_idx" ON "socialMention"("campaignId", "status", "occurredAt");
CREATE INDEX "socialMention_platform_status_occurredAt_idx" ON "socialMention"("platform", "status", "occurredAt");
CREATE INDEX "triageProposal_campaignId_status_createdAt_idx" ON "triageProposal"("campaignId", "status", "createdAt");
CREATE INDEX "triageProposal_socialMentionId_status_idx" ON "triageProposal"("socialMentionId", "status");
CREATE INDEX "triageProposal_subjectType_subjectId_idx" ON "triageProposal"("subjectType", "subjectId");
CREATE INDEX "marketingTouchpoint_campaignId_occurredAt_idx" ON "marketingTouchpoint"("campaignId", "occurredAt");
CREATE INDEX "marketingTouchpoint_subjectType_subjectId_occurredAt_idx" ON "marketingTouchpoint"("subjectType", "subjectId", "occurredAt");
CREATE INDEX "marketingTouchpoint_experimentId_occurredAt_idx" ON "marketingTouchpoint"("experimentId", "occurredAt");
CREATE INDEX "attributionCredit_campaignId_model_createdAt_idx" ON "attributionCredit"("campaignId", "model", "createdAt");
CREATE INDEX "attributionCredit_subjectType_subjectId_model_idx" ON "attributionCredit"("subjectType", "subjectId", "model");
CREATE INDEX "attributionCredit_touchpointId_idx" ON "attributionCredit"("touchpointId");
CREATE INDEX "publication_status_scheduledAt_idx" ON "publication"("status", "scheduledAt");
CREATE INDEX "publication_approvalRequestId_status_scheduledAt_idx" ON "publication"("approvalRequestId", "status", "scheduledAt");
CREATE INDEX "publication_connectorBindingId_status_scheduledAt_idx" ON "publication"("connectorBindingId", "status", "scheduledAt");
CREATE INDEX "publication_campaignId_publishedAt_idx" ON "publication"("campaignId", "publishedAt");
CREATE INDEX "publication_contentVariantId_idx" ON "publication"("contentVariantId");
CREATE INDEX "marketingSourceReceipt_campaignId_capturedAt_idx" ON "marketingSourceReceipt"("campaignId", "capturedAt");
CREATE INDEX "marketingSourceReceipt_contentItemId_capturedAt_idx" ON "marketingSourceReceipt"("contentItemId", "capturedAt");
CREATE INDEX "marketingSourceReceipt_contentHash_idx" ON "marketingSourceReceipt"("contentHash");
CREATE INDEX "supportCase_status_priority_dueAt_idx" ON "supportCase"("status", "priority", "dueAt");
CREATE INDEX "supportCase_matchState_updatedAt_idx" ON "supportCase"("matchState", "updatedAt");
CREATE INDEX "supportCase_matchedById_matchState_updatedAt_idx" ON "supportCase"("matchedById", "matchState", "updatedAt");
CREATE INDEX "supportCase_ownerId_status_dueAt_idx" ON "supportCase"("ownerId", "status", "dueAt");
CREATE INDEX "supportCase_queue_status_updatedAt_idx" ON "supportCase"("queue", "status", "updatedAt");
CREATE INDEX "supportCase_subjectType_subjectId_idx" ON "supportCase"("subjectType", "subjectId");
CREATE INDEX "supportCase_customerAccountId_status_priority_updatedAt_idx" ON "supportCase"("customerAccountId", "status", "priority", "updatedAt");
CREATE INDEX "supportCase_slaPolicyId_status_idx" ON "supportCase"("slaPolicyId", "status");
CREATE INDEX "supportCaseSource_caseId_receivedAt_idx" ON "supportCaseSource"("caseId", "receivedAt");
CREATE INDEX "supportCaseSource_contentHash_idx" ON "supportCaseSource"("contentHash");
CREATE INDEX "supportCaseEvent_caseId_occurredAt_idx" ON "supportCaseEvent"("caseId", "occurredAt");
CREATE INDEX "supportCaseEvent_eventType_occurredAt_idx" ON "supportCaseEvent"("eventType", "occurredAt");
CREATE INDEX "supportSlaPolicy_customerAccountId_status_priority_channel_idx" ON "supportSlaPolicy"("customerAccountId", "status", "priority", "channel");
CREATE INDEX "supportSlaPolicy_status_priority_channel_idx" ON "supportSlaPolicy"("status", "priority", "channel");
CREATE INDEX "supportTriageProposal_caseId_status_createdAt_idx" ON "supportTriageProposal"("caseId", "status", "createdAt");
CREATE INDEX "supportTriageProposal_status_createdAt_idx" ON "supportTriageProposal"("status", "createdAt");
CREATE INDEX "supportReplyDraft_caseId_status_createdAt_idx" ON "supportReplyDraft"("caseId", "status", "createdAt");
CREATE INDEX "supportReplyDraft_approvalRequestId_status_createdAt_idx" ON "supportReplyDraft"("approvalRequestId", "status", "createdAt");
CREATE INDEX "supportReplyDraft_status_createdAt_idx" ON "supportReplyDraft"("status", "createdAt");
CREATE INDEX "supportKnowledgeDocument_status_updatedAt_idx" ON "supportKnowledgeDocument"("status", "updatedAt");
CREATE INDEX "supportKnowledgeDocument_checksum_idx" ON "supportKnowledgeDocument"("checksum");
CREATE INDEX "supportEscalation_caseId_status_createdAt_idx" ON "supportEscalation"("caseId", "status", "createdAt");
CREATE INDEX "supportEscalation_status_severity_dueAt_idx" ON "supportEscalation"("status", "severity", "dueAt");
CREATE INDEX "supportProductHandoff_status_createdAt_idx" ON "supportProductHandoff"("status", "createdAt");
CREATE INDEX "supportProductHandoff_productArea_status_idx" ON "supportProductHandoff"("productArea", "status");
CREATE INDEX "customerAccount_status_updatedAt_idx" ON "customerAccount"("status", "updatedAt");
CREATE INDEX "customerAccount_ownerId_status_idx" ON "customerAccount"("ownerId", "status");
CREATE INDEX "customerInstance_status_updatedAt_idx" ON "customerInstance"("status", "updatedAt");
CREATE INDEX "customerInstance_accountId_status_idx" ON "customerInstance"("accountId", "status");
CREATE INDEX "providerAccount_instanceId_provider_status_idx" ON "providerAccount"("instanceId", "provider", "status");
CREATE INDEX "providerAccount_provider_status_updatedAt_idx" ON "providerAccount"("provider", "status", "updatedAt");
CREATE INDEX "providerResource_customerAccountId_status_updatedAt_idx" ON "providerResource"("customerAccountId", "status", "updatedAt");
CREATE INDEX "providerResource_instanceId_resourceType_status_idx" ON "providerResource"("instanceId", "resourceType", "status");
CREATE INDEX "providerResource_provider_resourceType_status_idx" ON "providerResource"("provider", "resourceType", "status");
CREATE INDEX "secretReference_customerAccountId_status_idx" ON "secretReference"("customerAccountId", "status");
CREATE INDEX "secretReference_provider_externalAccountId_status_idx" ON "secretReference"("provider", "externalAccountId", "status");
CREATE INDEX "desiredStateRevision_instanceId_status_revision_idx" ON "desiredStateRevision"("instanceId", "status", "revision");
CREATE INDEX "observedState_instanceId_observedAt_idx" ON "observedState"("instanceId", "observedAt");
CREATE INDEX "observedState_instanceId_status_observedAt_idx" ON "observedState"("instanceId", "status", "observedAt");
CREATE INDEX "plan_instanceId_status_createdAt_idx" ON "plan"("instanceId", "status", "createdAt");
CREATE INDEX "plan_approvalRequestId_status_createdAt_idx" ON "plan"("approvalRequestId", "status", "createdAt");
CREATE INDEX "plan_desiredRevisionId_instanceId_idx" ON "plan"("desiredRevisionId", "instanceId");
CREATE INDEX "plan_observedStateId_instanceId_idx" ON "plan"("observedStateId", "instanceId");
CREATE INDEX "planStep_planId_status_position_idx" ON "planStep"("planId", "status", "position");
CREATE INDEX "planStep_resourceType_resourceId_idx" ON "planStep"("resourceType", "resourceId");
CREATE INDEX "controlCommand_instanceId_status_createdAt_idx" ON "controlCommand"("instanceId", "status", "createdAt");
CREATE INDEX "controlCommand_approvalRequestId_idx" ON "controlCommand"("approvalRequestId");
CREATE INDEX "providerOperation_customerAccountId_status_createdAt_idx" ON "providerOperation"("customerAccountId", "status", "createdAt");
CREATE INDEX "providerOperation_instanceId_status_createdAt_idx" ON "providerOperation"("instanceId", "status", "createdAt");
CREATE INDEX "providerOperation_providerAccountId_status_createdAt_idx" ON "providerOperation"("providerAccountId", "status", "createdAt");
CREATE INDEX "providerOperation_planStepId_idx" ON "providerOperation"("planStepId");
CREATE INDEX "providerOperation_controlCommandId_idx" ON "providerOperation"("controlCommandId");
CREATE INDEX "providerOperation_operationKey_idx" ON "providerOperation"("operationKey");
CREATE INDEX "incident_instanceId_status_severity_detectedAt_idx" ON "incident"("instanceId", "status", "severity", "detectedAt");
CREATE INDEX "incident_provider_status_detectedAt_idx" ON "incident"("provider", "status", "detectedAt");
CREATE INDEX "usageSample_instanceId_metric_observedAt_idx" ON "usageSample"("instanceId", "metric", "observedAt");
CREATE INDEX "usageSample_providerAccountId_metric_observedAt_idx" ON "usageSample"("providerAccountId", "metric", "observedAt");
CREATE INDEX "costLineItem_customerAccountId_periodStart_periodEnd_idx" ON "costLineItem"("customerAccountId", "periodStart", "periodEnd");
CREATE INDEX "costLineItem_instanceId_periodStart_periodEnd_idx" ON "costLineItem"("instanceId", "periodStart", "periodEnd");
CREATE INDEX "costLineItem_provider_category_periodStart_idx" ON "costLineItem"("provider", "category", "periodStart");

ALTER TABLE "workItem" ADD CONSTRAINT "workItem_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "approvalRequest" ADD CONSTRAINT "approvalRequest_requestorId_fkey" FOREIGN KEY ("requestorId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "approvalRequest" ADD CONSTRAINT "approvalRequest_approverId_fkey" FOREIGN KEY ("approverId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "agentTask" ADD CONSTRAINT "agentTask_approval_scope_fkey" FOREIGN KEY ("approvalRequestId", "approvalContentDigest") REFERENCES "approvalRequest"("id", "contentDigest") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "agentRun" ADD CONSTRAINT "agentRun_approval_scope_fkey" FOREIGN KEY ("approvalRequestId", "approvalContentDigest") REFERENCES "approvalRequest"("id", "contentDigest") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "agentAction" ADD CONSTRAINT "agentAction_approval_scope_fkey" FOREIGN KEY ("approvalRequestId", "requestHash") REFERENCES "approvalRequest"("id", "contentDigest") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "actionReceipt" ADD CONSTRAINT "actionReceipt_providerAccountId_provider_fkey" FOREIGN KEY ("providerAccountId", "provider") REFERENCES "providerAccount"("id", "provider") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "actionReceipt" ADD CONSTRAINT "actionReceipt_agent_action_scope_fkey" FOREIGN KEY ("agentActionId", "provider", "channel", "requestHash") REFERENCES "agentAction"("id", "provider", "channel", "requestHash") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "actionReceipt" ADD CONSTRAINT "actionReceipt_approvalRequestId_requestHash_fkey" FOREIGN KEY ("approvalRequestId", "requestHash") REFERENCES "approvalRequest"("id", "contentDigest") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "actionReceipt" ADD CONSTRAINT "actionReceipt_provider_operation_scope_fkey" FOREIGN KEY ("providerOperationId", "providerAccountId", "provider") REFERENCES "providerOperation"("id", "providerAccountId", "provider") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "connectorBinding" ADD CONSTRAINT "connectorBinding_secretReferenceId_provider_accountId_fkey" FOREIGN KEY ("secretReferenceId", "provider", "accountId") REFERENCES "secretReference"("id", "provider", "externalAccountId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "connectorHealth" ADD CONSTRAINT "connectorHealth_bindingId_fkey" FOREIGN KEY ("bindingId") REFERENCES "connectorBinding"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "campaign" ADD CONSTRAINT "campaign_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "contentItem" ADD CONSTRAINT "contentItem_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "campaign"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "contentVariant" ADD CONSTRAINT "contentVariant_contentItemId_fkey" FOREIGN KEY ("contentItemId") REFERENCES "contentItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "contentVariant" ADD CONSTRAINT "contentVariant_experimentId_fkey" FOREIGN KEY ("experimentId") REFERENCES "experiment"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "experiment" ADD CONSTRAINT "experiment_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "campaign"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "socialMention" ADD CONSTRAINT "socialMention_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "campaign"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "triageProposal" ADD CONSTRAINT "triageProposal_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "campaign"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "triageProposal" ADD CONSTRAINT "triageProposal_contentItemId_fkey" FOREIGN KEY ("contentItemId") REFERENCES "contentItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "triageProposal" ADD CONSTRAINT "triageProposal_socialMentionId_fkey" FOREIGN KEY ("socialMentionId") REFERENCES "socialMention"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "marketingTouchpoint" ADD CONSTRAINT "marketingTouchpoint_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "campaign"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "marketingTouchpoint" ADD CONSTRAINT "marketingTouchpoint_experimentId_fkey" FOREIGN KEY ("experimentId") REFERENCES "experiment"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "attributionCredit" ADD CONSTRAINT "attributionCredit_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "campaign"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "attributionCredit" ADD CONSTRAINT "attributionCredit_touchpointId_fkey" FOREIGN KEY ("touchpointId") REFERENCES "marketingTouchpoint"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "publication" ADD CONSTRAINT "publication_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "campaign"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "publication" ADD CONSTRAINT "publication_contentItemId_fkey" FOREIGN KEY ("contentItemId") REFERENCES "contentItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "publication" ADD CONSTRAINT "publication_contentVariantId_fkey" FOREIGN KEY ("contentVariantId") REFERENCES "contentVariant"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "publication" ADD CONSTRAINT "publication_connectorBindingId_provider_fkey" FOREIGN KEY ("connectorBindingId", "provider") REFERENCES "connectorBinding"("id", "provider") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "publication" ADD CONSTRAINT "publication_approvalRequestId_contentDigest_fkey" FOREIGN KEY ("approvalRequestId", "contentDigest") REFERENCES "approvalRequest"("id", "contentDigest") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "publication" ADD CONSTRAINT "publication_receipt_scope_fkey" FOREIGN KEY ("actionReceiptId", "approvalRequestId", "contentDigest", "provider", "channel") REFERENCES "actionReceipt"("id", "approvalRequestId", "requestHash", "provider", "channel") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "marketingSourceReceipt" ADD CONSTRAINT "marketingSourceReceipt_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "campaign"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "marketingSourceReceipt" ADD CONSTRAINT "marketingSourceReceipt_contentItemId_fkey" FOREIGN KEY ("contentItemId") REFERENCES "contentItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "supportCase" ADD CONSTRAINT "supportCase_customerAccountId_fkey" FOREIGN KEY ("customerAccountId") REFERENCES "customerAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "supportCase" ADD CONSTRAINT "supportCase_connectorBindingId_provider_fkey" FOREIGN KEY ("connectorBindingId", "provider") REFERENCES "connectorBinding"("id", "provider") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "supportCase" ADD CONSTRAINT "supportCase_matchedById_fkey" FOREIGN KEY ("matchedById") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "supportCase" ADD CONSTRAINT "supportCase_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "supportCase" ADD CONSTRAINT "supportCase_slaPolicyId_fkey" FOREIGN KEY ("slaPolicyId") REFERENCES "supportSlaPolicy"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "supportCaseSource" ADD CONSTRAINT "supportCaseSource_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "supportCase"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "supportCaseSource" ADD CONSTRAINT "supportCaseSource_connectorBindingId_fkey" FOREIGN KEY ("connectorBindingId") REFERENCES "connectorBinding"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "supportCaseEvent" ADD CONSTRAINT "supportCaseEvent_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "supportCase"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "supportSlaPolicy" ADD CONSTRAINT "supportSlaPolicy_customerAccountId_fkey" FOREIGN KEY ("customerAccountId") REFERENCES "customerAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "supportTriageProposal" ADD CONSTRAINT "supportTriageProposal_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "supportCase"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "supportReplyDraft" ADD CONSTRAINT "supportReplyDraft_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "supportCase"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "supportReplyDraft" ADD CONSTRAINT "supportReplyDraft_approvalRequestId_contentDigest_fkey" FOREIGN KEY ("approvalRequestId", "contentDigest") REFERENCES "approvalRequest"("id", "contentDigest") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "supportReplyDraft" ADD CONSTRAINT "supportReplyDraft_receipt_scope_fkey" FOREIGN KEY ("actionReceiptId", "approvalRequestId", "contentDigest", "provider", "channel") REFERENCES "actionReceipt"("id", "approvalRequestId", "requestHash", "provider", "channel") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "supportEscalation" ADD CONSTRAINT "supportEscalation_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "supportCase"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "supportProductHandoff" ADD CONSTRAINT "supportProductHandoff_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "supportCase"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "customerAccount" ADD CONSTRAINT "customerAccount_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "company"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "customerAccount" ADD CONSTRAINT "customerAccount_customerOnboardingId_fkey" FOREIGN KEY ("customerOnboardingId") REFERENCES "customerOnboarding"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "customerAccount" ADD CONSTRAINT "customerAccount_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "customerInstance" ADD CONSTRAINT "customerInstance_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "customerAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "providerAccount" ADD CONSTRAINT "providerAccount_customerAccountId_fkey" FOREIGN KEY ("customerAccountId") REFERENCES "customerAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "providerAccount" ADD CONSTRAINT "providerAccount_instanceId_customerAccountId_fkey" FOREIGN KEY ("instanceId", "customerAccountId") REFERENCES "customerInstance"("id", "accountId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "providerAccount" ADD CONSTRAINT "providerAccount_secretReferenceId_customerAccountId_provid_fkey" FOREIGN KEY ("secretReferenceId", "customerAccountId", "provider", "externalAccountId") REFERENCES "secretReference"("id", "customerAccountId", "provider", "externalAccountId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "providerResource" ADD CONSTRAINT "providerResource_customerAccountId_fkey" FOREIGN KEY ("customerAccountId") REFERENCES "customerAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "providerResource" ADD CONSTRAINT "providerResource_providerAccountId_customerAccountId_provi_fkey" FOREIGN KEY ("providerAccountId", "customerAccountId", "provider") REFERENCES "providerAccount"("id", "customerAccountId", "provider") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "providerResource" ADD CONSTRAINT "providerResource_instanceId_customerAccountId_fkey" FOREIGN KEY ("instanceId", "customerAccountId") REFERENCES "customerInstance"("id", "accountId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "secretReference" ADD CONSTRAINT "secretReference_customerAccountId_fkey" FOREIGN KEY ("customerAccountId") REFERENCES "customerAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "desiredStateRevision" ADD CONSTRAINT "desiredStateRevision_instanceId_fkey" FOREIGN KEY ("instanceId") REFERENCES "customerInstance"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "observedState" ADD CONSTRAINT "observedState_instanceId_fkey" FOREIGN KEY ("instanceId") REFERENCES "customerInstance"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "plan" ADD CONSTRAINT "plan_instanceId_fkey" FOREIGN KEY ("instanceId") REFERENCES "customerInstance"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "plan" ADD CONSTRAINT "plan_desiredRevisionId_instanceId_fkey" FOREIGN KEY ("desiredRevisionId", "instanceId") REFERENCES "desiredStateRevision"("id", "instanceId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "plan" ADD CONSTRAINT "plan_observedStateId_instanceId_fkey" FOREIGN KEY ("observedStateId", "instanceId") REFERENCES "observedState"("id", "instanceId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "plan" ADD CONSTRAINT "plan_approvalRequestId_contentDigest_fkey" FOREIGN KEY ("approvalRequestId", "contentDigest") REFERENCES "approvalRequest"("id", "contentDigest") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "planStep" ADD CONSTRAINT "planStep_planId_instanceId_fkey" FOREIGN KEY ("planId", "instanceId") REFERENCES "plan"("id", "instanceId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "controlCommand" ADD CONSTRAINT "controlCommand_instanceId_fkey" FOREIGN KEY ("instanceId") REFERENCES "customerInstance"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "controlCommand" ADD CONSTRAINT "controlCommand_approvalRequestId_contentDigest_fkey" FOREIGN KEY ("approvalRequestId", "contentDigest") REFERENCES "approvalRequest"("id", "contentDigest") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "providerOperation" ADD CONSTRAINT "providerOperation_customerAccountId_fkey" FOREIGN KEY ("customerAccountId") REFERENCES "customerAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "providerOperation" ADD CONSTRAINT "providerOperation_instanceId_customerAccountId_fkey" FOREIGN KEY ("instanceId", "customerAccountId") REFERENCES "customerInstance"("id", "accountId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "providerOperation" ADD CONSTRAINT "providerOperation_providerAccountId_customerAccountId_prov_fkey" FOREIGN KEY ("providerAccountId", "customerAccountId", "provider") REFERENCES "providerAccount"("id", "customerAccountId", "provider") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "providerOperation" ADD CONSTRAINT "providerOperation_plan_step_scope_fkey" FOREIGN KEY ("planStepId", "instanceId", "provider") REFERENCES "planStep"("id", "instanceId", "provider") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "providerOperation" ADD CONSTRAINT "providerOperation_controlCommandId_instanceId_fkey" FOREIGN KEY ("controlCommandId", "instanceId") REFERENCES "controlCommand"("id", "instanceId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "incident" ADD CONSTRAINT "incident_instanceId_fkey" FOREIGN KEY ("instanceId") REFERENCES "customerInstance"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "usageSample" ADD CONSTRAINT "usageSample_customerAccountId_fkey" FOREIGN KEY ("customerAccountId") REFERENCES "customerAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "usageSample" ADD CONSTRAINT "usageSample_instanceId_customerAccountId_fkey" FOREIGN KEY ("instanceId", "customerAccountId") REFERENCES "customerInstance"("id", "accountId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "usageSample" ADD CONSTRAINT "usageSample_providerAccountId_customerAccountId_provider_fkey" FOREIGN KEY ("providerAccountId", "customerAccountId", "provider") REFERENCES "providerAccount"("id", "customerAccountId", "provider") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "costLineItem" ADD CONSTRAINT "costLineItem_customerAccountId_fkey" FOREIGN KEY ("customerAccountId") REFERENCES "customerAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "costLineItem" ADD CONSTRAINT "costLineItem_instanceId_customerAccountId_fkey" FOREIGN KEY ("instanceId", "customerAccountId") REFERENCES "customerInstance"("id", "accountId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "costLineItem" ADD CONSTRAINT "costLineItem_providerAccountId_customerAccountId_provider_fkey" FOREIGN KEY ("providerAccountId", "customerAccountId", "provider") REFERENCES "providerAccount"("id", "customerAccountId", "provider") ON DELETE RESTRICT ON UPDATE CASCADE;
