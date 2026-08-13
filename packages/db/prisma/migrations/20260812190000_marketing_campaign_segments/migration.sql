-- CreateTable
CREATE TABLE "marketingCampaignSegment" (
    "campaignId" TEXT NOT NULL,
    "segmentId" TEXT NOT NULL,
    "mode" "MarketingMemberMode" NOT NULL DEFAULT 'INCLUDE',
    "addedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "marketingCampaignSegment_pkey" PRIMARY KEY ("campaignId","segmentId")
);

-- CreateIndex
CREATE INDEX "marketingCampaignSegment_segmentId_idx" ON "marketingCampaignSegment"("segmentId");

-- CreateIndex
CREATE INDEX "marketingCampaignSegment_campaignId_mode_idx" ON "marketingCampaignSegment"("campaignId", "mode");

-- AddForeignKey
ALTER TABLE "marketingCampaignSegment" ADD CONSTRAINT "marketingCampaignSegment_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "marketingCampaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "marketingCampaignSegment" ADD CONSTRAINT "marketingCampaignSegment_segmentId_fkey" FOREIGN KEY ("segmentId") REFERENCES "marketingSegment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Carry every campaign's single segment over as an included one.
INSERT INTO "marketingCampaignSegment" ("campaignId", "segmentId", "mode")
SELECT "id", "segmentId", 'INCLUDE'
FROM "marketingCampaign"
WHERE "segmentId" IS NOT NULL;

-- DropForeignKey
ALTER TABLE "marketingCampaign" DROP CONSTRAINT "marketingCampaign_segmentId_fkey";

-- AlterTable
ALTER TABLE "marketingCampaign" DROP COLUMN "segmentId";
