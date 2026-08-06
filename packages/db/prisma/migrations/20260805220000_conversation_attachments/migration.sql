CREATE TABLE "agentConversationAttachment" (
    "id" TEXT NOT NULL,
    "submissionId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "mediaType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "content" BYTEA NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "agentConversationAttachment_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "agentConversationAttachment_submissionId_createdAt_idx"
ON "agentConversationAttachment"("submissionId", "createdAt");

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
    "content"
)
SELECT
    id,
    "submissionId",
    left(COALESCE(NULLIF(value ->> 'name', ''), 'attachment'), 180),
    left(COALESCE(NULLIF(value ->> 'type', ''), 'application/octet-stream'), 120),
    octet_length(decode(value ->> 'contentBase64', 'base64')),
    decode(value ->> 'contentBase64', 'base64')
FROM legacy_attachments;

WITH attachment_metadata AS (
    SELECT
        attachment."submissionId",
        jsonb_agg(
            jsonb_build_object(
                'id', attachment.id,
                'name', attachment.name,
                'type', attachment."mediaType",
                'size', attachment.size
            )
            ORDER BY attachment."createdAt", attachment.id
        ) AS attachments
    FROM "agentConversationAttachment" AS attachment
    GROUP BY attachment."submissionId"
)
UPDATE "agentConversationSubmission" AS submission
SET message = jsonb_set(submission.message, '{attachments}', metadata.attachments)
FROM attachment_metadata AS metadata
WHERE submission.id = metadata."submissionId";

UPDATE "agentConversationSubmission" AS submission
SET message = jsonb_set(
    submission.message,
    '{attachments}',
    (
        SELECT COALESCE(jsonb_agg(attachment.value - 'contentBase64' ORDER BY attachment.ordinality), '[]'::jsonb)
        FROM jsonb_array_elements(submission.message -> 'attachments')
        WITH ORDINALITY AS attachment(value, ordinality)
    )
)
WHERE jsonb_typeof(submission.message -> 'attachments') = 'array';
