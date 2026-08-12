UPDATE "agentConversation"
SET "continuationToken" = 'builder:' || id
WHERE kind = 'BUILDER'
  AND "continuationToken" IS NOT NULL
  AND "continuationToken" LIKE '%builder:' || id;
