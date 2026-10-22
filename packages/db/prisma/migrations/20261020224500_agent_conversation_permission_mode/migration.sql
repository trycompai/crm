CREATE TYPE "AgentConversationPermissionMode" AS ENUM ('MANUAL', 'AUTO', 'BYPASS');

ALTER TABLE "agentConversation"
ADD COLUMN "permissionMode" "AgentConversationPermissionMode" NOT NULL DEFAULT 'MANUAL';
