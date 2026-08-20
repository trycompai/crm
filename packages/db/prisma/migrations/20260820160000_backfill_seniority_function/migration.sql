-- DataMigration
-- Copies the already-APPLIED seniority/function contactFact values onto the
-- contact columns added in 20260820150700_list_building_fields. Those facts
-- were recorded before the columns existed, so recordFact's own write path
-- never touched them.
UPDATE "contact" c
SET "seniority" = f."value"
FROM "contactFact" f
WHERE f."contactId" = c."id"
  AND f."field" = 'seniority'
  AND f."status" = 'APPLIED'
  AND c."seniority" IS NULL;

UPDATE "contact" c
SET "function" = f."value"
FROM "contactFact" f
WHERE f."contactId" = c."id"
  AND f."field" = 'function'
  AND f."status" = 'APPLIED'
  AND c."function" IS NULL;
