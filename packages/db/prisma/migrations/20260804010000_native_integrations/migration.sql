CREATE TYPE "IntegrationProvider" AS ENUM ('CLAY', 'CLAAP');

ALTER TYPE "RecordSource" ADD VALUE 'CLAY';

CREATE TABLE "integrationEvent" (
    "id" TEXT NOT NULL,
    "provider" "IntegrationProvider" NOT NULL,
    "externalId" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "result" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "integrationEvent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "integrationEvent_provider_externalId_key" ON "integrationEvent"("provider", "externalId");
CREATE INDEX "integrationEvent_createdAt_idx" ON "integrationEvent"("createdAt");
