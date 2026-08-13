-- AlterTable
ALTER TABLE "appSetting" ADD COLUMN     "marketingBrandColor" TEXT;

-- AlterTable
ALTER TABLE "marketingSegment" ADD COLUMN     "isDefault" BOOLEAN NOT NULL DEFAULT false;
