CREATE TABLE IF NOT EXISTS opportunity_review_event (
  id text PRIMARY KEY,
  "opportunityId" text,
  "sourceRecordId" text NOT NULL,
  "businessUnitId" text NOT NULL,
  "eventType" text NOT NULL,
  state text NOT NULL,
  recommendation text,
  score integer,
  "scoreBreakdown" jsonb,
  rationale text,
  "reviewerUserId" text,
  "decidedAt" timestamp without time zone,
  "immutableHash" text NOT NULL,
  "createdAt" timestamp without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT opportunity_review_event_opportunity_fkey FOREIGN KEY ("opportunityId") REFERENCES canonical_opportunity(id) ON UPDATE CASCADE ON DELETE CASCADE,
  CONSTRAINT opportunity_review_event_source_record_fkey FOREIGN KEY ("sourceRecordId") REFERENCES source_record(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT opportunity_review_event_business_unit_fkey FOREIGN KEY ("businessUnitId") REFERENCES business_unit(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT opportunity_review_event_reviewer_fkey FOREIGN KEY ("reviewerUserId") REFERENCES "user"(id) ON UPDATE CASCADE ON DELETE SET NULL,
  CONSTRAINT opportunity_review_event_type_check CHECK ("eventType" IN ('evaluation','decision','promotion')),
  CONSTRAINT opportunity_review_event_state_check CHECK (state IN ('pending','approved','rejected','watch','promoted')),
  CONSTRAINT opportunity_review_event_recommendation_check CHECK (recommendation IS NULL OR recommendation IN ('pursue','qualify','watch','pass')),
  CONSTRAINT opportunity_review_event_score_check CHECK (score IS NULL OR (score >= 0 AND score <= 100)),
  CONSTRAINT opportunity_review_event_decision_check CHECK (("eventType" = 'evaluation') OR ("eventType" IN ('decision','promotion') AND "decidedAt" IS NOT NULL)),
  CONSTRAINT opportunity_review_event_promotion_link_check CHECK ("eventType" <> 'promotion' OR "opportunityId" IS NOT NULL)
);

ALTER TABLE opportunity_review_event ALTER COLUMN "opportunityId" DROP NOT NULL;
ALTER TABLE opportunity_review_event ALTER COLUMN "sourceRecordId" SET NOT NULL;

ALTER TABLE opportunity_review_event DROP CONSTRAINT IF EXISTS opportunity_review_event_source_record_fkey;
ALTER TABLE opportunity_review_event ADD CONSTRAINT opportunity_review_event_source_record_fkey FOREIGN KEY ("sourceRecordId") REFERENCES source_record(id) ON UPDATE CASCADE ON DELETE RESTRICT;
ALTER TABLE opportunity_review_event DROP CONSTRAINT IF EXISTS opportunity_review_event_recommendation_check;
ALTER TABLE opportunity_review_event ADD CONSTRAINT opportunity_review_event_recommendation_check CHECK (recommendation IS NULL OR recommendation IN ('pursue','qualify','watch','pass'));
ALTER TABLE opportunity_review_event DROP CONSTRAINT IF EXISTS opportunity_review_event_promotion_link_check;
ALTER TABLE opportunity_review_event ADD CONSTRAINT opportunity_review_event_promotion_link_check CHECK ("eventType" <> 'promotion' OR "opportunityId" IS NOT NULL);

CREATE UNIQUE INDEX IF NOT EXISTS opportunity_review_event_immutable_hash_key ON opportunity_review_event ("immutableHash");
CREATE INDEX IF NOT EXISTS opportunity_review_event_opportunity_created_idx ON opportunity_review_event ("opportunityId", "createdAt" DESC);
CREATE INDEX IF NOT EXISTS opportunity_review_event_business_unit_state_idx ON opportunity_review_event ("businessUnitId", state, "createdAt" DESC);
CREATE INDEX IF NOT EXISTS opportunity_review_event_source_record_idx ON opportunity_review_event ("sourceRecordId");
CREATE INDEX IF NOT EXISTS opportunity_review_event_source_created_idx ON opportunity_review_event ("sourceRecordId", "createdAt" DESC);

DROP VIEW IF EXISTS opportunity_ops_review_queue;

CREATE VIEW opportunity_ops_review_queue AS
SELECT
  sr.id AS "sourceRecordId",
  sr."businessUnitId",
  bu.key AS "businessUnitKey",
  bu.name AS "businessUnitName",
  sr."sourceSystem",
  sr."sourceType",
  sr."sourceId",
  sr."sourceUrl",
  sr."observedAt",
  sr.payload AS "sourcePayload",
  ccm."canonicalId" AS "canonicalCompanyId",
  cc.name AS "companyName",
  cc.domain AS "companyDomain",
  opm."canonicalId" AS "opportunityId",
  co.name AS "opportunityName",
  co.stage AS "canonicalStage",
  co.amount,
  co.fields AS "opportunityFields",
  COALESCE(re.state, 'pending') AS "reviewState",
  re.recommendation,
  re.score,
  re."scoreBreakdown",
  re.rationale,
  re."reviewerUserId",
  re."decidedAt",
  re."createdAt" AS "reviewedAt",
  opm."applicationId" AS "visibleDealId"
FROM source_record sr
JOIN business_unit bu ON bu.id = sr."businessUnitId"
LEFT JOIN record_mapping ccm
  ON ccm."sourceSystem" = sr."sourceSystem"
 AND ccm."sourceType" = sr."sourceType"
 AND ccm."sourceId" = sr."sourceId"
 AND ccm."canonicalType" = 'company'
 AND ccm.status = 'active'
LEFT JOIN canonical_company cc ON cc.id = ccm."canonicalId"
LEFT JOIN record_mapping opm
  ON opm."sourceSystem" = sr."sourceSystem"
 AND opm."sourceType" = sr."sourceType"
 AND opm."sourceId" = sr."sourceId"
 AND opm."canonicalType" = 'opportunity'
 AND opm.status = 'active'
LEFT JOIN canonical_opportunity co ON co.id = opm."canonicalId"
LEFT JOIN LATERAL (
  SELECT r.*
  FROM opportunity_review_event r
  WHERE r."sourceRecordId" = sr.id
  ORDER BY r."createdAt" DESC, r.id DESC
  LIMIT 1
) re ON true
WHERE sr.payload->>'workflow' = 'opportunity-ops'
   OR sr.payload->>'pipeline' = 'opportunity-ops'
   OR re.id IS NOT NULL;
