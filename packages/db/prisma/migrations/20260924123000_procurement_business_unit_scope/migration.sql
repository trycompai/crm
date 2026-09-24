-- Scope procurement records by CRM business unit.

ALTER TABLE "procurementPricingPolicy" ADD COLUMN "businessUnitId" TEXT;
ALTER TABLE "procurementProduct" ADD COLUMN "businessUnitId" TEXT;
ALTER TABLE "procurementSupplier" ADD COLUMN "businessUnitId" TEXT;
ALTER TABLE "procurementCustomerRequest" ADD COLUMN "businessUnitId" TEXT;

DROP INDEX IF EXISTS "procurementPricingPolicy_name_key";
DROP INDEX IF EXISTS "procurementProduct_category_idx";
DROP INDEX IF EXISTS "procurementProduct_manufacturer_manufacturerSku_idx";
DROP INDEX IF EXISTS "procurementSupplier_supplierName_key";
DROP INDEX IF EXISTS "procurementCustomerRequest_status_requestedAt_idx";
DROP INDEX IF EXISTS "procurementCustomerRequest_crmAccountId_idx";
DROP INDEX IF EXISTS "procurementPricingPolicy_one_default";

CREATE UNIQUE INDEX "procurementPricingPolicy_businessUnitId_name_key"
  ON "procurementPricingPolicy"("businessUnitId", "name");
CREATE INDEX "procurementPricingPolicy_businessUnitId_isDefault_idx"
  ON "procurementPricingPolicy"("businessUnitId", "isDefault");

CREATE INDEX "procurementProduct_businessUnitId_category_idx"
  ON "procurementProduct"("businessUnitId", "category");
CREATE INDEX "procurementProduct_businessUnitId_manufacturer_manufacturerSku_idx"
  ON "procurementProduct"("businessUnitId", "manufacturer", "manufacturerSku");

CREATE UNIQUE INDEX "procurementSupplier_businessUnitId_supplierName_key"
  ON "procurementSupplier"("businessUnitId", "supplierName");
CREATE INDEX "procurementSupplier_businessUnitId_active_idx"
  ON "procurementSupplier"("businessUnitId", "active");

CREATE INDEX "procurementCustomerRequest_businessUnitId_status_requestedAt_idx"
  ON "procurementCustomerRequest"("businessUnitId", "status", "requestedAt");
CREATE INDEX "procurementCustomerRequest_businessUnitId_crmAccountId_idx"
  ON "procurementCustomerRequest"("businessUnitId", "crmAccountId");

ALTER TABLE "procurementPricingPolicy"
  ADD CONSTRAINT "procurementPricingPolicy_businessUnitId_fkey"
  FOREIGN KEY ("businessUnitId") REFERENCES "business_unit"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "procurementProduct"
  ADD CONSTRAINT "procurementProduct_businessUnitId_fkey"
  FOREIGN KEY ("businessUnitId") REFERENCES "business_unit"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "procurementSupplier"
  ADD CONSTRAINT "procurementSupplier_businessUnitId_fkey"
  FOREIGN KEY ("businessUnitId") REFERENCES "business_unit"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "procurementCustomerRequest"
  ADD CONSTRAINT "procurementCustomerRequest_businessUnitId_fkey"
  FOREIGN KEY ("businessUnitId") REFERENCES "business_unit"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE UNIQUE INDEX "procurementPricingPolicy_one_default"
  ON "procurementPricingPolicy" ("businessUnitId")
  WHERE "isDefault" = true;

DROP VIEW IF EXISTS "procurementRequestSupplierMatch";
DROP VIEW IF EXISTS "procurementCustomerDemandSummary";
DROP VIEW IF EXISTS "procurementSupplierBuySellMatrix";

CREATE VIEW "procurementSupplierBuySellMatrix" AS
SELECT
  COALESCE(p."businessUnitId", s."businessUnitId") AS "businessUnitId",
  q."id" AS "supplierQuoteId",
  q."productId",
  p."category",
  p."manufacturer",
  p."productName",
  p."model",
  p."manufacturerSku",
  q."supplierId",
  s."supplierName",
  q."supplierSku",
  q."currency",
  q."unitCost",
  q."quoteQuantity",
  q."shippingTotal",
  ROUND(q."shippingTotal" / NULLIF(q."quoteQuantity",0),2) AS "shippingPerUnit",
  q."feesPerUnit",
  q."otherDirectCostPerUnit",
  ROUND(q."unitCost" + (q."shippingTotal" / NULLIF(q."quoteQuantity",0)) + q."feesPerUnit" + q."otherDirectCostPerUnit",2) AS "landedCost",
  q."markupRate",
  ROUND((q."unitCost" + (q."shippingTotal" / NULLIF(q."quoteQuantity",0)) + q."feesPerUnit" + q."otherDirectCostPerUnit") * (1 + q."markupRate"),2) AS "targetSellPrice",
  ROUND((q."unitCost" + (q."shippingTotal" / NULLIF(q."quoteQuantity",0)) + q."feesPerUnit" + q."otherDirectCostPerUnit") * q."markupRate",2) AS "grossProfitPerUnit",
  ROUND((q."markupRate" / (1 + q."markupRate")) * 100,2) AS "grossMarginPct",
  q."availableQty",
  q."moq",
  q."leadTimeDays",
  CASE
    WHEN q."availabilityStatus" = 'UNAVAILABLE' THEN 'UNAVAILABLE'
    WHEN q."availabilityStatus" = 'RFQ' THEN 'RFQ'
    WHEN q."expiresAt" IS NOT NULL AND q."expiresAt" < CURRENT_TIMESTAMP THEN 'STALE'
    WHEN q."availabilityCheckedAt" IS NULL THEN 'STALE'
    WHEN q."availabilityCheckedAt" < CURRENT_TIMESTAMP - make_interval(hours => COALESCE(pol."freshnessHours",48)) THEN 'STALE'
    ELSE 'LIVE'
  END AS "pricingStatus",
  q."quotedAt",
  q."expiresAt",
  q."availabilityCheckedAt",
  q."paymentTerms",
  q."warranty",
  q."sourceRef",
  q."notes"
FROM "procurementSupplierQuote" q
JOIN "procurementSupplier" s ON s."id" = q."supplierId"
LEFT JOIN "procurementProduct" p ON p."id" = q."productId"
LEFT JOIN LATERAL (
  SELECT "freshnessHours"
  FROM "procurementPricingPolicy"
  WHERE "isDefault" = true
    AND ("businessUnitId" = COALESCE(p."businessUnitId", s."businessUnitId") OR "businessUnitId" IS NULL)
  ORDER BY ("businessUnitId" IS NULL), "updatedAt" DESC
  LIMIT 1
) pol ON true;

CREATE VIEW "procurementCustomerDemandSummary" AS
SELECT
  r."businessUnitId",
  i."productId",
  i."productType",
  i."manufacturer",
  i."model",
  i."manufacturerSku",
  i."gpuModel",
  SUM(i."quantity") AS "openQuantity",
  COUNT(DISTINCT i."requestId") AS "openRequests",
  MIN(r."requiredBy") AS "earliestRequiredBy",
  SUM(COALESCE(i."customerTargetUnitPrice",0) * i."quantity") AS "statedTargetValue"
FROM "procurementCustomerRequestItem" i
JOIN "procurementCustomerRequest" r ON r."id" = i."requestId"
WHERE r."status" IN ('NEW','SOURCING','QUOTED')
GROUP BY r."businessUnitId", i."productId", i."productType", i."manufacturer", i."model", i."manufacturerSku", i."gpuModel";

CREATE VIEW "procurementRequestSupplierMatch" AS
SELECT
  r."businessUnitId",
  i."requestId",
  i."id" AS "requestItemId",
  i."productId",
  i."productType",
  i."manufacturer" AS "requestedManufacturer",
  i."model" AS "requestedModel",
  i."manufacturerSku" AS "requestedSku",
  i."quantity" AS "requestedQty",
  i."customerTargetUnitPrice",
  m."supplierQuoteId",
  m."supplierId",
  m."supplierName",
  m."unitCost",
  m."landedCost",
  m."targetSellPrice",
  m."grossProfitPerUnit",
  m."grossMarginPct",
  m."availableQty",
  m."leadTimeDays",
  m."pricingStatus",
  CASE
    WHEN m."availableQty" IS NULL THEN NULL
    WHEN m."availableQty" >= i."quantity" THEN true
    ELSE false
  END AS "canFulfill",
  CASE
    WHEN i."customerTargetUnitPrice" IS NULL OR m."targetSellPrice" IS NULL THEN NULL
    ELSE ROUND(i."customerTargetUnitPrice" - m."targetSellPrice",2)
  END AS "headroomVsCustomerTarget"
FROM "procurementCustomerRequestItem" i
JOIN "procurementCustomerRequest" r ON r."id" = i."requestId"
LEFT JOIN "procurementSupplierBuySellMatrix" m
  ON m."productId" = i."productId"
 AND m."businessUnitId" IS NOT DISTINCT FROM r."businessUnitId";
