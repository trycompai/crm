WITH ranked_shares AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY "conversationId"
      ORDER BY "createdAt" DESC, id DESC
    ) AS position
  FROM "agentConversationShare"
  WHERE "revokedAt" IS NULL
)
UPDATE "agentConversationShare" AS share
SET "revokedAt" = NOW()
FROM ranked_shares
WHERE share.id = ranked_shares.id
  AND ranked_shares.position > 1;

CREATE UNIQUE INDEX "agentConversationShare_one_active_per_conversation"
ON "agentConversationShare"("conversationId")
WHERE "revokedAt" IS NULL;
