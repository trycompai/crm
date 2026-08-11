CREATE TYPE "ProspectStatus" AS ENUM ('CANDIDATE', 'RESEARCHING', 'QUALIFIED', 'REVIEW', 'PROMOTED', 'DISQUALIFIED');

CREATE TYPE "ProspectRouteStatus" AS ENUM ('NONE', 'NAMED_PERSON_NEEDED', 'GENERIC_INBOX_BLOCKED', 'DIRECT_ROUTE_REVIEW', 'SEND_READY_REVIEW');

CREATE TABLE "prospect" (
    "id" TEXT NOT NULL,
    "dedupeKey" TEXT NOT NULL,
    "region" TEXT NOT NULL,
    "country" TEXT NOT NULL,
    "countryCode" TEXT NOT NULL,
    "companyName" TEXT NOT NULL,
    "website" TEXT,
    "location" TEXT,
    "fitScore" INTEGER,
    "status" "ProspectStatus" NOT NULL DEFAULT 'CANDIDATE',
    "routeStatus" "ProspectRouteStatus" NOT NULL DEFAULT 'NONE',
    "namedPerson" TEXT,
    "role" TEXT,
    "routeEmail" TEXT,
    "routeType" TEXT,
    "emailAllowed" BOOLEAN NOT NULL DEFAULT false,
    "companyProof" TEXT,
    "personSourceUrl" TEXT,
    "personalHook" TEXT,
    "jobDayProblem" TEXT,
    "nextAction" TEXT,
    "blockReason" TEXT,
    "sourceBatch" TEXT NOT NULL,
    "sourceUrl" TEXT,
    "lastResearchedAt" TIMESTAMP(3),
    "suppressionCheckedAt" TIMESTAMP(3),
    "companyId" TEXT,
    "contactId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "prospect_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "prospectEvidence" (
    "id" TEXT NOT NULL,
    "prospectId" TEXT NOT NULL,
    "sourceType" TEXT NOT NULL,
    "title" TEXT,
    "url" TEXT NOT NULL,
    "signalDate" TIMESTAMP(3),
    "summary" TEXT NOT NULL,
    "observed" TEXT,
    "inference" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "prospectEvidence_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "prospect_dedupeKey_key" ON "prospect"("dedupeKey");
CREATE INDEX "prospect_countryCode_status_fitScore_idx" ON "prospect"("countryCode", "status", "fitScore");
CREATE INDEX "prospect_status_createdAt_idx" ON "prospect"("status", "createdAt");
CREATE INDEX "prospect_routeStatus_idx" ON "prospect"("routeStatus");
CREATE INDEX "prospect_companyId_idx" ON "prospect"("companyId");
CREATE INDEX "prospect_contactId_idx" ON "prospect"("contactId");
CREATE INDEX "prospectEvidence_prospectId_idx" ON "prospectEvidence"("prospectId");
CREATE UNIQUE INDEX "prospectEvidence_prospectId_url_key" ON "prospectEvidence"("prospectId", "url");

ALTER TABLE "prospect" ADD CONSTRAINT "prospect_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "company"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "prospect" ADD CONSTRAINT "prospect_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "contact"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "prospectEvidence" ADD CONSTRAINT "prospectEvidence_prospectId_fkey" FOREIGN KEY ("prospectId") REFERENCES "prospect"("id") ON DELETE CASCADE ON UPDATE CASCADE;
