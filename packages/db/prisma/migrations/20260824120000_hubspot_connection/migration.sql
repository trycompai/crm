-- CreateEnum
CREATE TYPE "HubspotOutcome" AS ENUM ('OPEN', 'WON', 'LOST');

-- CreateTable
CREATE TABLE "hubspotInstall" (
    "installerId" TEXT NOT NULL,
    "portalId" TEXT NOT NULL,
    "portalDomain" TEXT,
    "installerEmail" TEXT,
    "refreshToken" TEXT NOT NULL,
    "scopes" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "hubspotInstall_pkey" PRIMARY KEY ("installerId")
);

-- CreateTable
CREATE TABLE "hubspotConnection" (
    "id" TEXT NOT NULL,
    "portalId" TEXT NOT NULL,
    "portalDomain" TEXT,
    "refreshToken" TEXT NOT NULL,
    "accessToken" TEXT,
    "accessTokenExpiresAt" TIMESTAMP(3),
    "scopes" TEXT NOT NULL,
    "installerEmail" TEXT,
    "lastReadAt" TIMESTAMP(3),
    "lastErrorAt" TIMESTAMP(3),
    "lastError" TEXT,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "hubspotConnection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hubspotPipeline" (
    "id" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "archived" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "hubspotPipeline_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hubspotStage" (
    "id" TEXT NOT NULL,
    "pipelineId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "isClosed" BOOLEAN NOT NULL DEFAULT false,
    "probability" DECIMAL(4,3) NOT NULL,
    "outcome" "HubspotOutcome" NOT NULL DEFAULT 'OPEN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "hubspotStage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "hubspotConnection_portalId_key" ON "hubspotConnection"("portalId");

-- CreateIndex
CREATE INDEX "hubspotStage_pipelineId_idx" ON "hubspotStage"("pipelineId");

-- CreateIndex
CREATE INDEX "hubspotStage_outcome_idx" ON "hubspotStage"("outcome");

-- AddForeignKey
ALTER TABLE "hubspotStage" ADD CONSTRAINT "hubspotStage_pipelineId_fkey" FOREIGN KEY ("pipelineId") REFERENCES "hubspotPipeline"("id") ON DELETE CASCADE ON UPDATE CASCADE;
