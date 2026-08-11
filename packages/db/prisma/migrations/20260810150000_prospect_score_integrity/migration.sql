ALTER TABLE "prospect"
ADD CONSTRAINT "prospect_painStrength_range" CHECK ("painStrength" IS NULL OR "painStrength" BETWEEN 0 AND 5),
ADD CONSTRAINT "prospect_productFit_range" CHECK ("productFit" IS NULL OR "productFit" BETWEEN 0 AND 5),
ADD CONSTRAINT "prospect_timing_range" CHECK ("timing" IS NULL OR "timing" BETWEEN 0 AND 5),
ADD CONSTRAINT "prospect_reachability_range" CHECK ("reachability" IS NULL OR "reachability" BETWEEN 0 AND 5),
ADD CONSTRAINT "prospect_evidenceQuality_range" CHECK ("evidenceQuality" IS NULL OR "evidenceQuality" BETWEEN 0 AND 5),
ADD CONSTRAINT "prospect_score_dimensions_complete" CHECK (
  (
    "painStrength" IS NULL AND
    "productFit" IS NULL AND
    "timing" IS NULL AND
    "reachability" IS NULL AND
    "evidenceQuality" IS NULL
  ) OR (
    "painStrength" IS NOT NULL AND
    "productFit" IS NOT NULL AND
    "timing" IS NOT NULL AND
    "reachability" IS NOT NULL AND
    "evidenceQuality" IS NOT NULL
  )
);
