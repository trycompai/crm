ALTER TABLE "websiteEnquiry" ADD COLUMN "updatedAtSource" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

CREATE INDEX "websiteEnquiry_updatedAtSource_externalId_idx" ON "websiteEnquiry"("updatedAtSource", "externalId");
