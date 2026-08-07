CREATE TABLE "agentConversationAttachment" (
    "id" TEXT NOT NULL,
    "submissionId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "mediaType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "content" BYTEA NOT NULL,
    "position" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "agentConversationAttachment_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "agentConversationAttachment_submissionId_position_idx"
ON "agentConversationAttachment"("submissionId", "position");

ALTER TABLE "agentConversationAttachment"
ADD CONSTRAINT "agentConversationAttachment_submissionId_fkey"
FOREIGN KEY ("submissionId") REFERENCES "agentConversationSubmission"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

WITH legacy_attachments AS (
    SELECT
        submission.id AS "submissionId",
        attachment.value,
        attachment.ordinality,
        'legacy_' || md5(submission.id || ':' || attachment.ordinality::text) AS id
    FROM "agentConversationSubmission" AS submission
    CROSS JOIN LATERAL jsonb_array_elements(
        CASE
            WHEN jsonb_typeof(submission.message -> 'attachments') = 'array'
                THEN submission.message -> 'attachments'
            ELSE '[]'::jsonb
        END
    ) WITH ORDINALITY AS attachment(value, ordinality)
    WHERE attachment.value ? 'contentBase64'
      AND attachment.value ->> 'contentBase64' <> ''
      AND attachment.value ->> 'contentBase64' ~ '^([A-Za-z0-9+/]{4})*([A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$'
)
INSERT INTO "agentConversationAttachment" (
    "id",
    "submissionId",
    "name",
    "mediaType",
    "size",
    "content",
    "position"
)
SELECT
    id,
    "submissionId",
    left(COALESCE(NULLIF(value ->> 'name', ''), 'attachment'), 180),
    left(COALESCE(NULLIF(value ->> 'type', ''), 'application/octet-stream'), 120),
    octet_length(decode(value ->> 'contentBase64', 'base64')),
    decode(value ->> 'contentBase64', 'base64'),
    ordinality - 1
FROM legacy_attachments;

UPDATE "agentConversationSubmission" AS submission
SET message = jsonb_set(
    submission.message,
    '{attachments}',
    (
        SELECT COALESCE(
            jsonb_agg(
                CASE
                    WHEN stored.id IS NOT NULL THEN jsonb_build_object(
                        'id', stored.id,
                        'name', stored.name,
                        'type', stored."mediaType",
                        'size', stored.size
                    )
                    ELSE attachment.value
                END
                ORDER BY attachment.ordinality
            ),
            '[]'::jsonb
        )
        FROM jsonb_array_elements(submission.message -> 'attachments')
        WITH ORDINALITY AS attachment(value, ordinality)
        LEFT JOIN "agentConversationAttachment" AS stored
            ON stored.id = 'legacy_' || md5(submission.id || ':' || attachment.ordinality::text)
    )
)
WHERE jsonb_typeof(submission.message -> 'attachments') = 'array';
