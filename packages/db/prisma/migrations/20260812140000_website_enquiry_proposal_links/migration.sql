ALTER TABLE "websiteEnquiry" ADD COLUMN "candidateId" TEXT;
ALTER TABLE "websiteEnquiry" ADD COLUMN "receiptId" TEXT;

CREATE UNIQUE INDEX "websiteEnquiry_receiptId_key" ON "websiteEnquiry"("receiptId");
CREATE INDEX "websiteEnquiry_candidateId_idx" ON "websiteEnquiry"("candidateId");

ALTER TABLE "websiteEnquiry" ADD CONSTRAINT "websiteEnquiry_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "contactCandidate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "websiteEnquiry" ADD CONSTRAINT "websiteEnquiry_receiptId_fkey" FOREIGN KEY ("receiptId") REFERENCES "inboundSourceReceipt"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
