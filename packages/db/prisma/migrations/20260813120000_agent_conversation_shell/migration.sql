ALTER TABLE "agentConversation"
ADD COLUMN "shellId" TEXT;

ALTER TABLE "agentConversation"
ADD CONSTRAINT "agentConversation_shellId_fkey"
FOREIGN KEY ("shellId") REFERENCES "marketingPartial"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "agentConversation_shellId_lastMessageAt_idx"
ON "agentConversation"("shellId", "lastMessageAt");
