-- AlterTable
ALTER TABLE "appSetting" ADD COLUMN "trackingPaused" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "trackingCounter" (
    "key" TEXT NOT NULL,
    "value" INTEGER NOT NULL DEFAULT 0,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "trackingCounter_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE INDEX "trackingCounter_expiresAt_idx" ON "trackingCounter"("expiresAt");

-- CreateTable
CREATE TABLE "trackedPageDaily" (
    "day" TIMESTAMP(3) NOT NULL,
    "host" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "views" INTEGER NOT NULL DEFAULT 0,
    "visitors" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "trackedPageDaily_pkey" PRIMARY KEY ("day","host","path")
);

-- CreateIndex
CREATE INDEX "trackedPageDaily_host_day_idx" ON "trackedPageDaily"("host", "day");
