-- DataMigration
-- Copies the already-APPLIED seniority/function contactFact values onto the
-- contact columns added in 20260820150700_list_building_fields. Those facts
-- were recorded before the columns existed, so recordFact's own write path
-- never touched them. A contact can have more than one APPLIED fact for the
-- same field (re-applied over time); DISTINCT ON picks the most recently
-- observed one deterministically, breaking ties by id.
UPDATE "contact" c
SET "seniority" = f."value"
FROM (
  SELECT DISTINCT ON (f."contactId") f."contactId", f."value"
  FROM "contactFact" f
  WHERE f."field" = 'seniority'
    AND f."status" = 'APPLIED'
  ORDER BY f."contactId", f."observedAt" DESC, f."id" DESC
) f
WHERE f."contactId" = c."id"
  AND c."seniority" IS NULL;

UPDATE "contact" c
SET "function" = f."value"
FROM (
  SELECT DISTINCT ON (f."contactId") f."contactId", f."value"
  FROM "contactFact" f
  WHERE f."field" = 'function'
    AND f."status" = 'APPLIED'
  ORDER BY f."contactId", f."observedAt" DESC, f."id" DESC
) f
WHERE f."contactId" = c."id"
  AND c."function" IS NULL;
