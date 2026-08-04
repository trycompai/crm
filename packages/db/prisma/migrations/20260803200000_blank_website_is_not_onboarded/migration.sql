-- The two backfills before this one keyed onboarding on `website IS NOT NULL`,
-- which an empty or whitespace string satisfies. A workspace with a blank
-- website has plainly not answered the form, and marking it onboarded is how it
-- would never be asked — so undo the flag, and make the value itself honest.
UPDATE "organization"
SET "metadata" = (
        (COALESCE(NULLIF("metadata", '')::jsonb, '{}'::jsonb)) - 'onboardedAt'
    )::text
WHERE btrim(COALESCE("website", '')) = ''
  AND COALESCE(NULLIF("metadata", '')::jsonb, '{}'::jsonb) -> 'onboardedAt' IS NOT NULL;

UPDATE "organization" SET "website" = NULL WHERE btrim(COALESCE("website", '')) = '';
