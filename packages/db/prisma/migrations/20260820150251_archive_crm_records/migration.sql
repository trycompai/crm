-- AlterTable
ALTER TABLE "appSetting" ADD COLUMN     "archiveRetentionDays" INTEGER NOT NULL DEFAULT 180;

-- AlterTable
ALTER TABLE "company" ADD COLUMN     "archivedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "contact" ADD COLUMN     "archivedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "deal" ADD COLUMN     "archivedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "company_archivedAt_idx" ON "company"("archivedAt");

-- CreateIndex
CREATE INDEX "contact_archivedAt_idx" ON "contact"("archivedAt");

-- CreateIndex
CREATE INDEX "deal_archivedAt_idx" ON "deal"("archivedAt");
