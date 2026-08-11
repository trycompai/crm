-- AlterEnum
ALTER TYPE "RecordSource" ADD VALUE 'TRACKING';

-- CreateEnum
CREATE TYPE "DomainScope" AS ENUM ('SITE_AND_SUBDOMAINS', 'EXACT_HOST');

-- AlterTable
ALTER TABLE "appSetting" ADD COLUMN "trackingSiteId" TEXT;
ALTER TABLE "appSetting" ADD COLUMN "trackingCrossDomain" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "appSetting" ADD COLUMN "trackingLimitToDomains" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "appSetting" ADD COLUMN "trackingCookieSubdomains" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "appSetting" ADD COLUMN "trackingSecureCookies" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "appSetting" ADD COLUMN "trackingHonourDnt" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "appSetting" ADD COLUMN "trackingCookieDays" INTEGER NOT NULL DEFAULT 395;
ALTER TABLE "appSetting" ADD COLUMN "trackingConfigHash" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "appSetting_trackingSiteId_key" ON "appSetting"("trackingSiteId");

-- CreateTable
CREATE TABLE "trackedDomain" (
    "id" TEXT NOT NULL,
    "host" TEXT NOT NULL,
    "scope" "DomainScope" NOT NULL DEFAULT 'EXACT_HOST',
    "pageViews" INTEGER NOT NULL DEFAULT 0,
    "lastSeenAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "trackedDomain_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "trackedDomain_host_key" ON "trackedDomain"("host");

-- CreateTable
CREATE TABLE "trackedVisitor" (
    "id" TEXT NOT NULL,
    "contactId" TEXT,
    "firstSeen" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeen" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "trackedVisitor_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "trackedVisitor_contactId_idx" ON "trackedVisitor"("contactId");

-- AddForeignKey
ALTER TABLE "trackedVisitor" ADD CONSTRAINT "trackedVisitor_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "contact"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateTable
CREATE TABLE "trackedEvent" (
    "id" TEXT NOT NULL,
    "visitorId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "host" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "referrer" TEXT,
    "label" TEXT,
    "occurredAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "trackedEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "trackedEvent_visitorId_occurredAt_idx" ON "trackedEvent"("visitorId", "occurredAt");
CREATE INDEX "trackedEvent_occurredAt_idx" ON "trackedEvent"("occurredAt");
CREATE INDEX "trackedEvent_host_occurredAt_idx" ON "trackedEvent"("host", "occurredAt");

-- CreateTable
CREATE TABLE "formSubmission" (
    "id" TEXT NOT NULL,
    "visitorId" TEXT,
    "contactId" TEXT,
    "host" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "email" TEXT,
    "fields" JSONB NOT NULL,
    "dedupeKey" TEXT NOT NULL,
    "filedAt" TIMESTAMP(3),
    "skipReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "formSubmission_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "formSubmission_dedupeKey_key" ON "formSubmission"("dedupeKey");
CREATE INDEX "formSubmission_contactId_idx" ON "formSubmission"("contactId");
CREATE INDEX "formSubmission_createdAt_idx" ON "formSubmission"("createdAt");

-- AddForeignKey
ALTER TABLE "formSubmission" ADD CONSTRAINT "formSubmission_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "contact"("id") ON DELETE SET NULL ON UPDATE CASCADE;
