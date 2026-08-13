ALTER TABLE "agentConversation"
DROP CONSTRAINT "agentConversation_campaignNodeId_fkey";

ALTER TABLE "agentConversation"
ADD CONSTRAINT "agentConversation_campaignNodeId_fkey"
FOREIGN KEY ("campaignNodeId") REFERENCES "marketingCampaignNode"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
