CREATE TABLE "prospectSourceReceipt" (
    "id" TEXT NOT NULL,
    "prospectId" TEXT NOT NULL,
    "requestedUrl" TEXT NOT NULL,
    "finalUrl" TEXT NOT NULL,
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "statusCode" INTEGER NOT NULL,
    "contentType" TEXT,
    "contentHash" TEXT NOT NULL,
    "contentText" TEXT NOT NULL,

    CONSTRAINT "prospectSourceReceipt_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "prospectEvidence" ADD COLUMN "receiptId" TEXT;

CREATE UNIQUE INDEX "prospectEvidence_receiptId_key" ON "prospectEvidence"("receiptId");
CREATE INDEX "prospectSourceReceipt_prospectId_fetchedAt_idx" ON "prospectSourceReceipt"("prospectId", "fetchedAt");
CREATE INDEX "prospectSourceReceipt_contentHash_idx" ON "prospectSourceReceipt"("contentHash");

ALTER TABLE "prospectSourceReceipt" ADD CONSTRAINT "prospectSourceReceipt_prospectId_fkey" FOREIGN KEY ("prospectId") REFERENCES "prospect"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "prospectEvidence" ADD CONSTRAINT "prospectEvidence_receiptId_fkey" FOREIGN KEY ("receiptId") REFERENCES "prospectSourceReceipt"("id") ON DELETE SET NULL ON UPDATE CASCADE;

UPDATE "prospect"
SET "nextResearchAt" = CURRENT_TIMESTAMP
WHERE "status" NOT IN ('PROMOTED', 'DISQUALIFIED')
  AND "nextResearchAt" IS NULL;
