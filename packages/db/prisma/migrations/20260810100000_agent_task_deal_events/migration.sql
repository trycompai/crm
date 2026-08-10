ALTER TABLE "agentTask"
ADD COLUMN "dealId" TEXT,
ADD COLUMN "payload" JSONB;

CREATE INDEX "agentTask_dealId_idx" ON "agentTask"("dealId");
