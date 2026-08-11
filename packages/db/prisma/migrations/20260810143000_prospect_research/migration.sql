ALTER TABLE "prospect"
ADD COLUMN "painStrength" INTEGER,
ADD COLUMN "productFit" INTEGER,
ADD COLUMN "timing" INTEGER,
ADD COLUMN "reachability" INTEGER,
ADD COLUMN "evidenceQuality" INTEGER,
ADD COLUMN "enrichmentStatus" "EnrichmentStatus" NOT NULL DEFAULT 'PENDING',
ADD COLUMN "enrichedAt" TIMESTAMP(3),
ADD COLUMN "enrichmentError" TEXT,
ADD COLUMN "painSignal" TEXT,
ADD COLUMN "whyFit" TEXT,
ADD COLUMN "whyNow" TEXT,
ADD COLUMN "suggestedChannel" TEXT,
ADD COLUMN "caution" TEXT,
ADD COLUMN "opener" TEXT;

ALTER TABLE "agentTask" ADD COLUMN "prospectId" TEXT;

CREATE INDEX "agentTask_prospectId_idx" ON "agentTask"("prospectId");
