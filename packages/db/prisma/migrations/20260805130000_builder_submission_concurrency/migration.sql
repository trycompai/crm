ALTER TABLE "agentConversationSubmission"
ADD COLUMN "inputRequestId" TEXT;

CREATE UNIQUE INDEX "agentConversationSubmission_conversationId_inputRequestId_key"
ON "agentConversationSubmission"("conversationId", "inputRequestId");
