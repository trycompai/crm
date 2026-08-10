ALTER TABLE "agentEvent"
ADD COLUMN "conversationId" TEXT;

UPDATE "agentEvent" AS event
SET "conversationId" = conversation.id
FROM "agentConversation" AS conversation
WHERE event."sessionId" = conversation."sessionId";

ALTER TABLE "agentEvent"
ADD CONSTRAINT "agentEvent_conversationId_fkey"
FOREIGN KEY ("conversationId") REFERENCES "agentConversation"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "agentEvent_conversationId_emittedAt_idx"
ON "agentEvent"("conversationId", "emittedAt");
