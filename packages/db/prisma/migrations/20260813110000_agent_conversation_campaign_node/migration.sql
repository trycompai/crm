ALTER TABLE "agentConversation"
ADD COLUMN "campaignNodeId" TEXT;

ALTER TABLE "agentConversation"
ADD CONSTRAINT "agentConversation_campaignNodeId_fkey"
FOREIGN KEY ("campaignNodeId") REFERENCES "marketingCampaignNode"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "agentConversation_campaignNodeId_lastMessageAt_idx"
ON "agentConversation"("campaignNodeId", "lastMessageAt");
