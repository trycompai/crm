CREATE TYPE "AgentConversationCommandType" AS ENUM ('CHAT', 'CREATE_AGENT');

ALTER TABLE "agentConversationSubmission"
ADD COLUMN "commandType" "AgentConversationCommandType" NOT NULL DEFAULT 'CHAT';

UPDATE "agentConversationSubmission"
SET "commandType" = 'CREATE_AGENT'
WHERE "message"->>'text' ~* '^\s*/create\s+agent(?:\s|$)';
