ALTER TABLE "agentConversation"
RENAME COLUMN "pendingInputRequest" TO "pendingInputRequests";

UPDATE "agentConversation"
SET "pendingInputRequests" = jsonb_build_array("pendingInputRequests")
WHERE "pendingInputRequests" IS NOT NULL
  AND jsonb_typeof("pendingInputRequests") <> 'array';
