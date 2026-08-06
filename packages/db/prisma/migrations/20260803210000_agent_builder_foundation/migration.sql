CREATE TYPE "AgentConversationKind" AS ENUM ('RECORD', 'BUILDER');
CREATE TYPE "AgentDefinitionStatus" AS ENUM ('DRAFT', 'DEPLOYING', 'LIVE', 'PAUSED', 'ARCHIVED', 'DELETED');
CREATE TYPE "AgentVersionStatus" AS ENUM ('DRAFT', 'VALIDATING', 'READY', 'DEPLOYED', 'REJECTED');
CREATE TYPE "AgentTriggerType" AS ENUM ('MANUAL', 'SCHEDULE', 'EVENT', 'WEBHOOK');
CREATE TYPE "AgentRunStatus" AS ENUM ('QUEUED', 'RUNNING', 'WAITING_FOR_APPROVAL', 'SUCCEEDED', 'FAILED', 'CANCELLED');
CREATE TYPE "AgentActionStatus" AS ENUM ('PLANNED', 'RUNNING', 'SUCCEEDED', 'FAILED', 'CANCELLED');
CREATE TYPE "AgentConversationShareScope" AS ENUM ('WORKSPACE_LINK');
CREATE TYPE "AgentConversationSubmissionStatus" AS ENUM ('PENDING', 'SENDING', 'ACCEPTED', 'FAILED', 'CANCELLED');

CREATE TYPE "AgentResponseRating" AS ENUM ('UP', 'DOWN');

ALTER TABLE "agentConversation"
ADD COLUMN "kind" "AgentConversationKind" NOT NULL DEFAULT 'RECORD',
ADD COLUMN "agentId" TEXT,
ADD COLUMN "updatedAt" TIMESTAMP(3),
ADD COLUMN "lastAssistantAt" TIMESTAMP(3),
ADD COLUMN "lastReadAt" TIMESTAMP(3);

ALTER TABLE "agentConversation"
ALTER COLUMN "sessionId" DROP NOT NULL;

UPDATE "agentConversation"
SET "updatedAt" = "lastMessageAt";

ALTER TABLE "agentConversation"
ALTER COLUMN "updatedAt" SET NOT NULL;

CREATE TABLE "agentDefinition" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "status" "AgentDefinitionStatus" NOT NULL DEFAULT 'DRAFT',
    "createdById" TEXT NOT NULL,
    "currentVersionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "archivedAt" TIMESTAMP(3),
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "agentDefinition_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "agentVersion" (
    "id" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "status" "AgentVersionStatus" NOT NULL DEFAULT 'DRAFT',
    "instructions" TEXT NOT NULL,
    "manifest" JSONB NOT NULL,
    "modelId" TEXT NOT NULL,
    "sandboxPolicy" JSONB NOT NULL,
    "validation" JSONB,
    "sourceConversationId" TEXT,
    "createdById" TEXT NOT NULL,
    "deploymentId" TEXT,
    "approvedAt" TIMESTAMP(3),
    "deployedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "agentVersion_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "agentTrigger" (
    "id" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "versionId" TEXT NOT NULL,
    "type" "AgentTriggerType" NOT NULL,
    "name" TEXT NOT NULL,
    "config" JSONB NOT NULL,
    "createdById" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "nextRunAt" TIMESTAMP(3),
    "lastRunAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "agentTrigger_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "agentRun" (
    "id" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "versionId" TEXT NOT NULL,
    "triggerId" TEXT,
    "initiatedById" TEXT,
    "triggerType" "AgentTriggerType" NOT NULL,
    "status" "AgentRunStatus" NOT NULL DEFAULT 'QUEUED',
    "principalId" TEXT,
    "sessionId" TEXT,
    "idempotencyKey" TEXT NOT NULL,
    "correlationId" TEXT NOT NULL,
    "input" JSONB,
    "result" JSONB,
    "summary" TEXT,
    "modelId" TEXT,
    "inputTokens" INTEGER,
    "outputTokens" INTEGER,
    "costUsd" DECIMAL(12,6),
    "errorCode" TEXT,
    "errorMessage" TEXT,
    "nextEventSequence" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "agentRun_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "agentRunEvent" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "emittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "agentRunEvent_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "agentAction" (
    "id" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "targetType" TEXT,
    "targetId" TEXT,
    "targetLabel" TEXT,
    "summary" TEXT NOT NULL,
    "metadata" JSONB,
    "status" "AgentActionStatus" NOT NULL DEFAULT 'PLANNED',
    "idempotencyKey" TEXT NOT NULL,
    "requestHash" TEXT,
    "externalId" TEXT,
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "errorCode" TEXT,
    "errorMessage" TEXT,
    "plannedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "agentAction_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "agentAuditEvent" (
    "id" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "versionId" TEXT,
    "actorUserId" TEXT,
    "type" TEXT NOT NULL,
    "actorType" TEXT NOT NULL,
    "actorId" TEXT,
    "summary" TEXT NOT NULL,
    "before" JSONB,
    "after" JSONB,
    "requestId" TEXT,
    "emittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "agentAuditEvent_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "agentConversationShare" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "scope" "AgentConversationShareScope" NOT NULL DEFAULT 'WORKSPACE_LINK',
    "tokenHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "agentConversationShare_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "agentConversationSubmission" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "submittedById" TEXT NOT NULL,
    "clientRequestId" TEXT NOT NULL,
    "message" JSONB NOT NULL,
    "status" "AgentConversationSubmissionStatus" NOT NULL DEFAULT 'PENDING',
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "errorCode" TEXT,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sentAt" TIMESTAMP(3),
    "acceptedAt" TIMESTAMP(3),

    CONSTRAINT "agentConversationSubmission_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "agentConversationFeedback" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "rating" "AgentResponseRating" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "agentConversationFeedback_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "agentDefinition_currentVersionId_key" ON "agentDefinition"("currentVersionId");
CREATE INDEX "agentDefinition_status_updatedAt_idx" ON "agentDefinition"("status", "updatedAt");
CREATE INDEX "agentDefinition_createdById_createdAt_idx" ON "agentDefinition"("createdById", "createdAt");

CREATE UNIQUE INDEX "agentVersion_agentId_number_key" ON "agentVersion"("agentId", "number");
CREATE INDEX "agentVersion_agentId_createdAt_idx" ON "agentVersion"("agentId", "createdAt");
CREATE INDEX "agentVersion_status_createdAt_idx" ON "agentVersion"("status", "createdAt");

CREATE INDEX "agentTrigger_agentId_enabled_idx" ON "agentTrigger"("agentId", "enabled");
CREATE INDEX "agentTrigger_enabled_nextRunAt_idx" ON "agentTrigger"("enabled", "nextRunAt");
CREATE INDEX "agentTrigger_versionId_idx" ON "agentTrigger"("versionId");

CREATE UNIQUE INDEX "agentRun_sessionId_key" ON "agentRun"("sessionId");
CREATE UNIQUE INDEX "agentRun_idempotencyKey_key" ON "agentRun"("idempotencyKey");
CREATE UNIQUE INDEX "agentRun_correlationId_key" ON "agentRun"("correlationId");
CREATE INDEX "agentRun_agentId_createdAt_idx" ON "agentRun"("agentId", "createdAt");
CREATE INDEX "agentRun_versionId_createdAt_idx" ON "agentRun"("versionId", "createdAt");
CREATE INDEX "agentRun_status_createdAt_idx" ON "agentRun"("status", "createdAt");
CREATE INDEX "agentRun_triggerId_createdAt_idx" ON "agentRun"("triggerId", "createdAt");

CREATE UNIQUE INDEX "agentRunEvent_runId_sequence_key" ON "agentRunEvent"("runId", "sequence");
CREATE INDEX "agentRunEvent_runId_emittedAt_idx" ON "agentRunEvent"("runId", "emittedAt");

CREATE UNIQUE INDEX "agentAction_idempotencyKey_key" ON "agentAction"("idempotencyKey");
CREATE INDEX "agentAction_agentId_plannedAt_idx" ON "agentAction"("agentId", "plannedAt");
CREATE INDEX "agentAction_runId_plannedAt_idx" ON "agentAction"("runId", "plannedAt");
CREATE INDEX "agentAction_provider_externalId_idx" ON "agentAction"("provider", "externalId");
CREATE INDEX "agentAction_status_plannedAt_idx" ON "agentAction"("status", "plannedAt");

CREATE INDEX "agentAuditEvent_agentId_emittedAt_idx" ON "agentAuditEvent"("agentId", "emittedAt");
CREATE INDEX "agentAuditEvent_versionId_emittedAt_idx" ON "agentAuditEvent"("versionId", "emittedAt");
CREATE INDEX "agentAuditEvent_actorUserId_emittedAt_idx" ON "agentAuditEvent"("actorUserId", "emittedAt");
CREATE INDEX "agentAuditEvent_type_emittedAt_idx" ON "agentAuditEvent"("type", "emittedAt");

CREATE UNIQUE INDEX "agentAuditEvent_agentId_type_requestId_key" ON "agentAuditEvent"("agentId", "type", "requestId");

CREATE UNIQUE INDEX "agentConversationShare_tokenHash_key" ON "agentConversationShare"("tokenHash");
CREATE INDEX "agentConversationShare_conversationId_revokedAt_idx" ON "agentConversationShare"("conversationId", "revokedAt");

CREATE UNIQUE INDEX "agentConversationSubmission_clientRequestId_key" ON "agentConversationSubmission"("clientRequestId");
CREATE INDEX "agentConversationSubmission_conversationId_createdAt_idx" ON "agentConversationSubmission"("conversationId", "createdAt");
CREATE INDEX "agentConversationSubmission_status_createdAt_idx" ON "agentConversationSubmission"("status", "createdAt");

CREATE UNIQUE INDEX "agentConversationFeedback_conversationId_userId_messageId_key" ON "agentConversationFeedback"("conversationId", "userId", "messageId");

CREATE INDEX "agentConversationFeedback_conversationId_createdAt_idx" ON "agentConversationFeedback"("conversationId", "createdAt");

CREATE INDEX "agentConversation_userId_kind_lastMessageAt_idx" ON "agentConversation"("userId", "kind", "lastMessageAt");
CREATE INDEX "agentConversation_agentId_lastMessageAt_idx" ON "agentConversation"("agentId", "lastMessageAt");

ALTER TABLE "agentDefinition" ADD CONSTRAINT "agentDefinition_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "agentDefinition" ADD CONSTRAINT "agentDefinition_currentVersionId_fkey" FOREIGN KEY ("currentVersionId") REFERENCES "agentVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "agentVersion" ADD CONSTRAINT "agentVersion_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "agentDefinition"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "agentVersion" ADD CONSTRAINT "agentVersion_sourceConversationId_fkey" FOREIGN KEY ("sourceConversationId") REFERENCES "agentConversation"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "agentVersion" ADD CONSTRAINT "agentVersion_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "agentConversation" ADD CONSTRAINT "agentConversation_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "agentDefinition"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "agentTrigger" ADD CONSTRAINT "agentTrigger_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "agentDefinition"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "agentTrigger" ADD CONSTRAINT "agentTrigger_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "agentVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "agentTrigger" ADD CONSTRAINT "agentTrigger_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "agentRun" ADD CONSTRAINT "agentRun_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "agentDefinition"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "agentRun" ADD CONSTRAINT "agentRun_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "agentVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "agentRun" ADD CONSTRAINT "agentRun_triggerId_fkey" FOREIGN KEY ("triggerId") REFERENCES "agentTrigger"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "agentRun" ADD CONSTRAINT "agentRun_initiatedById_fkey" FOREIGN KEY ("initiatedById") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "agentRunEvent" ADD CONSTRAINT "agentRunEvent_runId_fkey" FOREIGN KEY ("runId") REFERENCES "agentRun"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "agentAction" ADD CONSTRAINT "agentAction_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "agentDefinition"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "agentAction" ADD CONSTRAINT "agentAction_runId_fkey" FOREIGN KEY ("runId") REFERENCES "agentRun"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "agentAuditEvent" ADD CONSTRAINT "agentAuditEvent_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "agentDefinition"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "agentAuditEvent" ADD CONSTRAINT "agentAuditEvent_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "agentVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "agentAuditEvent" ADD CONSTRAINT "agentAuditEvent_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "agentConversationShare" ADD CONSTRAINT "agentConversationShare_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "agentConversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "agentConversationShare" ADD CONSTRAINT "agentConversationShare_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "agentConversationSubmission" ADD CONSTRAINT "agentConversationSubmission_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "agentConversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "agentConversationSubmission" ADD CONSTRAINT "agentConversationSubmission_submittedById_fkey" FOREIGN KEY ("submittedById") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "agentConversationFeedback" ADD CONSTRAINT "agentConversationFeedback_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "agentConversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "agentConversationFeedback" ADD CONSTRAINT "agentConversationFeedback_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
