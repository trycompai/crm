ALTER TABLE "prospect"
ADD COLUMN "draftSubject" TEXT,
ADD COLUMN "draftBody" TEXT,
ADD COLUMN "nextResearchAt" TIMESTAMP(3),
ADD COLUMN "promotedAt" TIMESTAMP(3),
ADD COLUMN "researchVersion" INTEGER NOT NULL DEFAULT 1;

UPDATE "prospect"
SET "draftBody" = "opener"
WHERE "opener" IS NOT NULL AND "draftBody" IS NULL;

ALTER TABLE "prospect"
ADD CONSTRAINT "prospect_fitScore_range" CHECK ("fitScore" IS NULL OR "fitScore" BETWEEN 0 AND 100);

CREATE INDEX "prospect_nextResearchAt_status_idx" ON "prospect"("nextResearchAt", "status");
