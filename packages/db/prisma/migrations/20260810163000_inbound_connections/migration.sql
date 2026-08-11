ALTER TYPE "RecordSource" ADD VALUE IF NOT EXISTS 'WEBSITE';

ALTER TABLE "emailInbox"
ADD COLUMN "lastSyncedAt" TIMESTAMP(3),
ADD COLUMN "lastError" TEXT;

CREATE TABLE "websiteEnquiry" (
    "id" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "createdAtSource" TIMESTAMP(3) NOT NULL,
    "name" TEXT,
    "email" TEXT NOT NULL,
    "company" TEXT,
    "country" TEXT,
    "biggestPain" TEXT,
    "source" TEXT NOT NULL,
    "sourcePath" TEXT,
    "utm" JSONB NOT NULL,
    "qaTag" TEXT,
    "notes" TEXT,
    "test" BOOLEAN NOT NULL DEFAULT false,
    "importedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "companyId" TEXT,
    "contactId" TEXT,

    CONSTRAINT "websiteEnquiry_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "websiteEnquiry_externalId_key" ON "websiteEnquiry"("externalId");
CREATE INDEX "websiteEnquiry_email_idx" ON "websiteEnquiry"("email");
CREATE INDEX "websiteEnquiry_createdAtSource_idx" ON "websiteEnquiry"("createdAtSource");
CREATE INDEX "websiteEnquiry_test_idx" ON "websiteEnquiry"("test");

ALTER TABLE "websiteEnquiry" ADD CONSTRAINT "websiteEnquiry_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "company"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "websiteEnquiry" ADD CONSTRAINT "websiteEnquiry_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "contact"("id") ON DELETE SET NULL ON UPDATE CASCADE;
