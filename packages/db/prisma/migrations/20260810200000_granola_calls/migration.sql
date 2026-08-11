ALTER TYPE "RecordSource" ADD VALUE 'GRANOLA';

CREATE TABLE "granolaNote" (
    "id" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "sourceUrl" TEXT,
    "ownerName" TEXT,
    "ownerEmail" TEXT,
    "summary" TEXT,
    "transcript" JSONB,
    "attendees" JSONB NOT NULL,
    "folders" JSONB NOT NULL,
    "calendarEventExternalId" TEXT,
    "startedAt" TIMESTAMP(3),
    "endedAt" TIMESTAMP(3),
    "sourceCreatedAt" TIMESTAMP(3) NOT NULL,
    "sourceUpdatedAt" TIMESTAMP(3) NOT NULL,
    "importedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "companyId" TEXT,
    "contactId" TEXT,
    "dealId" TEXT,
    "activityId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "granolaNote_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "granolaNote_externalId_key" ON "granolaNote"("externalId");
CREATE INDEX "granolaNote_companyId_startedAt_idx" ON "granolaNote"("companyId", "startedAt");
CREATE INDEX "granolaNote_contactId_startedAt_idx" ON "granolaNote"("contactId", "startedAt");
CREATE INDEX "granolaNote_dealId_startedAt_idx" ON "granolaNote"("dealId", "startedAt");
CREATE INDEX "granolaNote_activityId_idx" ON "granolaNote"("activityId");
CREATE INDEX "granolaNote_calendarEventExternalId_idx" ON "granolaNote"("calendarEventExternalId");
CREATE INDEX "granolaNote_sourceUpdatedAt_idx" ON "granolaNote"("sourceUpdatedAt");

ALTER TABLE "granolaNote" ADD CONSTRAINT "granolaNote_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "company"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "granolaNote" ADD CONSTRAINT "granolaNote_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "contact"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "granolaNote" ADD CONSTRAINT "granolaNote_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "deal"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "granolaNote" ADD CONSTRAINT "granolaNote_activityId_fkey" FOREIGN KEY ("activityId") REFERENCES "activity"("id") ON DELETE SET NULL ON UPDATE CASCADE;
