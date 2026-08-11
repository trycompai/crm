UPDATE "prospect"
SET "status" = 'CANDIDATE',
    "enrichmentStatus" = 'PENDING',
    "enrichedAt" = NULL,
    "enrichmentError" = NULL
WHERE "status" IN ('QUALIFIED', 'REVIEW')
  AND (
    "painStrength" IS NULL OR
    "productFit" IS NULL OR
    "timing" IS NULL OR
    "reachability" IS NULL OR
    "evidenceQuality" IS NULL
  );
