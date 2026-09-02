-- AlterTable
ALTER TABLE "agentRun" ADD COLUMN     "slackChannelId" TEXT;

-- CreateTable
CREATE TABLE "slackEventInbox" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "teamId" TEXT,
    "channelId" TEXT,
    "type" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "runId" TEXT,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),
    "outcome" TEXT,

    CONSTRAINT "slackEventInbox_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "slackEventInbox_eventId_key" ON "slackEventInbox"("eventId");

-- CreateIndex
CREATE INDEX "slackEventInbox_processedAt_receivedAt_idx" ON "slackEventInbox"("processedAt", "receivedAt");

-- CreateIndex
CREATE INDEX "slackEventInbox_channelId_idx" ON "slackEventInbox"("channelId");

-- CreateIndex
CREATE INDEX "agentRun_slackChannelId_status_idx" ON "agentRun"("slackChannelId", "status");
