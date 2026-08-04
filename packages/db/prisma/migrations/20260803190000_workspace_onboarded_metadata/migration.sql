-- Onboarding state moves into the organization plugin's own `metadata` blob.
-- A workspace that has a website has answered the form, whether or not the
-- column beside it ever recorded that it had.
UPDATE "organization"
SET "metadata" = (
        COALESCE(NULLIF("metadata", '')::jsonb, '{}'::jsonb)
        || jsonb_build_object(
            'onboardedAt',
            to_char(
                COALESCE("onboardedAt", "createdAt") AT TIME ZONE 'UTC',
                'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'
            )
        )
    )::text
WHERE "website" IS NOT NULL
  AND COALESCE(NULLIF("metadata", '')::jsonb, '{}'::jsonb) -> 'onboardedAt' IS NULL;

-- AlterTable
ALTER TABLE "organization" DROP COLUMN "onboardedAt";
