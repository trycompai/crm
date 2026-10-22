ALTER TABLE "agentEvent"
ADD COLUMN "streamIndex" INTEGER,
ADD COLUMN "deliveryIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

CREATE UNIQUE INDEX "agentEvent_sessionId_streamIndex_key"
ON "agentEvent"("sessionId", "streamIndex");
