-- Procurement pricing and supplier/customer request tracking
-- Source of truth approved 2026-09-24.

CREATE TYPE "ProcurementRequestStatus" AS ENUM ('NEW', 'SOURCING', 'QUOTED', 'WON', 'LOST', 'CLOSED');
CREATE TYPE "ProcurementQuoteStatus" AS ENUM ('NOT_QUOTED', 'DRAFT', 'SENT', 'ACCEPTED', 'DECLINED');
CREATE TYPE "ProcurementAvailabilityStatus" AS ENUM ('LIVE', 'RFQ', 'UNAVAILABLE');

CREATE TABLE "procurementPricingPolicy" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "markupRate" DECIMAL(8,6) NOT NULL DEFAULT 0.30,
  "freshnessHours" INTEGER NOT NULL DEFAULT 48,
  "isDefault" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "procurementPricingPolicy_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "procurementProduct" (
  "id" TEXT NOT NULL,
  "category" TEXT NOT NULL,
  "manufacturer" TEXT,
  "productName" TEXT NOT NULL,
  "model" TEXT,
  "manufacturerSku" TEXT,
  "normalizedSpecs" JSONB NOT NULL DEFAULT '{}',
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "procurementProduct_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "procurementSupplier" (
  "id" TEXT NOT NULL,
  "supplierName" TEXT NOT NULL,
  "accountNumber" TEXT,
  "contactName" TEXT,
  "contactEmail" TEXT,
  "contactPhone" TEXT,
  "paymentTerms" TEXT,
  "reliabilityScore" DECIMAL(5,2),
  "notes" TEXT,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "procurementSupplier_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "procurementSupplierQuote" (
  "id" TEXT NOT NULL,
  "supplierId" TEXT NOT NULL,
  "productId" TEXT,
  "supplierSku" TEXT,
  "supplierDescription" TEXT,
  "currency" TEXT NOT NULL DEFAULT 'USD',
  "unitCost" DECIMAL(14,2) NOT NULL,
  "quoteQuantity" DECIMAL(14,3) NOT NULL DEFAULT 1,
  "shippingTotal" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "feesPerUnit" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "otherDirectCostPerUnit" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "markupRate" DECIMAL(8,6) NOT NULL DEFAULT 0.30,
  "availableQty" DECIMAL(14,3),
  "moq" DECIMAL(14,3),
  "leadTimeDays" INTEGER,
  "availabilityStatus" "ProcurementAvailabilityStatus" NOT NULL DEFAULT 'RFQ',
  "quotedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt" TIMESTAMP(3),
  "availabilityCheckedAt" TIMESTAMP(3),
  "warranty" TEXT,
  "paymentTerms" TEXT,
  "sourceRef" TEXT,
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "procurementSupplierQuote_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "procurementCustomerRequest" (
  "id" TEXT NOT NULL,
  "crmAccountId" TEXT,
  "crmContactId" TEXT,
  "sourceQuoteReference" TEXT,
  "customerName" TEXT,
  "contactName" TEXT,
  "contactEmail" TEXT,
  "contactPhone" TEXT,
  "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "status" "ProcurementRequestStatus" NOT NULL DEFAULT 'SOURCING',
  "quoteStatus" "ProcurementQuoteStatus" NOT NULL DEFAULT 'NOT_QUOTED',
  "targetBudget" DECIMAL(16,2),
  "currency" TEXT NOT NULL DEFAULT 'USD',
  "requiredBy" TIMESTAMP(3),
  "destination" TEXT,
  "originalRequest" TEXT,
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "procurementCustomerRequest_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "procurementCustomerRequestItem" (
  "id" TEXT NOT NULL,
  "requestId" TEXT NOT NULL,
  "productId" TEXT,
  "productType" TEXT NOT NULL,
  "manufacturer" TEXT,
  "model" TEXT,
  "manufacturerSku" TEXT,
  "quantity" DECIMAL(14,3) NOT NULL DEFAULT 1,
  "gpuModel" TEXT,
  "gpuCount" INTEGER,
  "cpu" TEXT,
  "ramGb" INTEGER,
  "storageTb" DECIMAL(12,3),
  "network" TEXT,
  "formFactor" TEXT,
  "preferredManufacturer" TEXT,
  "normalizedSpecs" JSONB NOT NULL DEFAULT '{}',
  "customerTargetUnitPrice" DECIMAL(14,2),
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "procurementCustomerRequestItem_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "procurementPricingPolicy_name_key" ON "procurementPricingPolicy"("name");
CREATE INDEX "procurementProduct_category_idx" ON "procurementProduct"("category");
CREATE INDEX "procurementProduct_manufacturer_manufacturerSku_idx" ON "procurementProduct"("manufacturer", "manufacturerSku");
CREATE UNIQUE INDEX "procurementSupplier_supplierName_key" ON "procurementSupplier"("supplierName");
CREATE INDEX "procurementSupplierQuote_productId_quotedAt_idx" ON "procurementSupplierQuote"("productId", "quotedAt");
CREATE INDEX "procurementSupplierQuote_supplierId_quotedAt_idx" ON "procurementSupplierQuote"("supplierId", "quotedAt");
CREATE INDEX "procurementSupplierQuote_availabilityStatus_availabilityCheckedAt_idx" ON "procurementSupplierQuote"("availabilityStatus", "availabilityCheckedAt");
CREATE INDEX "procurementCustomerRequest_status_requestedAt_idx" ON "procurementCustomerRequest"("status", "requestedAt");
CREATE INDEX "procurementCustomerRequest_crmAccountId_idx" ON "procurementCustomerRequest"("crmAccountId");
CREATE INDEX "procurementCustomerRequestItem_requestId_idx" ON "procurementCustomerRequestItem"("requestId");
CREATE INDEX "procurementCustomerRequestItem_productId_idx" ON "procurementCustomerRequestItem"("productId");

ALTER TABLE "procurementSupplierQuote"
  ADD CONSTRAINT "procurementSupplierQuote_supplierId_fkey"
  FOREIGN KEY ("supplierId") REFERENCES "procurementSupplier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "procurementSupplierQuote"
  ADD CONSTRAINT "procurementSupplierQuote_productId_fkey"
  FOREIGN KEY ("productId") REFERENCES "procurementProduct"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "procurementCustomerRequestItem"
  ADD CONSTRAINT "procurementCustomerRequestItem_requestId_fkey"
  FOREIGN KEY ("requestId") REFERENCES "procurementCustomerRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "procurementCustomerRequestItem"
  ADD CONSTRAINT "procurementCustomerRequestItem_productId_fkey"
  FOREIGN KEY ("productId") REFERENCES "procurementProduct"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE UNIQUE INDEX "procurementPricingPolicy_one_default"
  ON "procurementPricingPolicy" ("isDefault")
  WHERE "isDefault" = true;

INSERT INTO "procurementPricingPolicy"
  ("id","name","markupRate","freshnessHours","isDefault","createdAt","updatedAt")
VALUES
  ('procurement-default','DataGear default',0.30,48,true,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)
ON CONFLICT ("name") DO NOTHING;

CREATE OR REPLACE VIEW "procurementSupplierBuySellMatrix" AS
SELECT
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
  ORDER BY "updatedAt" DESC
  LIMIT 1
) pol ON true;

CREATE OR REPLACE VIEW "procurementCustomerDemandSummary" AS
SELECT
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
GROUP BY i."productId", i."productType", i."manufacturer", i."model", i."manufacturerSku", i."gpuModel";

CREATE OR REPLACE VIEW "procurementRequestSupplierMatch" AS
SELECT
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
LEFT JOIN "procurementSupplierBuySellMatrix" m
  ON m."productId" = i."productId";
