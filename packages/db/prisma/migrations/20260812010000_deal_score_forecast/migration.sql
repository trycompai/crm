-- AlterTable
ALTER TABLE "deal" ADD COLUMN     "dealScore" INTEGER,
ADD COLUMN     "dealScoreSummary" TEXT,
ADD COLUMN     "dealScoredAt" TIMESTAMP(3),
ADD COLUMN     "forecastContext" TEXT,
ADD COLUMN     "forecastContextManual" TEXT;

-- CreateIndex
CREATE INDEX "deal_dealScoredAt_idx" ON "deal"("dealScoredAt");
