ALTER TABLE "appSetting" ALTER COLUMN "trackingPaused" SET DEFAULT true;

UPDATE "appSetting" SET "trackingPaused" = true WHERE "trackingPaused" = false;

ALTER TABLE "formSubmission" ADD COLUMN "candidateId" TEXT;
ALTER TABLE "formSubmission" ADD COLUMN "receiptId" TEXT;
ALTER TABLE "formSubmission" ADD COLUMN "consentEvidence" JSONB;
ALTER TABLE "formSubmission" ADD COLUMN "reviewQueuedAt" TIMESTAMP(3);

CREATE UNIQUE INDEX "formSubmission_receiptId_key" ON "formSubmission"("receiptId");
CREATE INDEX "formSubmission_candidateId_idx" ON "formSubmission"("candidateId");
CREATE INDEX "formSubmission_reviewQueuedAt_idx" ON "formSubmission"("reviewQueuedAt");

ALTER TABLE "formSubmission" ADD CONSTRAINT "formSubmission_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "contactCandidate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "formSubmission" ADD CONSTRAINT "formSubmission_receiptId_fkey" FOREIGN KEY ("receiptId") REFERENCES "inboundSourceReceipt"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
