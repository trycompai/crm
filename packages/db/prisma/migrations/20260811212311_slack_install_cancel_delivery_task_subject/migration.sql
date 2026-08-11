-- AlterTable
ALTER TABLE "agentRun" ADD COLUMN     "cancelDeliveredAt" TIMESTAMP(3),
ADD COLUMN     "cancelRequestedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "agentTask" ADD COLUMN     "subject" TEXT;

-- AlterTable
ALTER TABLE "slackChannel" ADD COLUMN     "classifiedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "slackInstallation" (
    "installerId" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "teamName" TEXT,
    "userToken" TEXT,
    "userScopes" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "slackInstallation_pkey" PRIMARY KEY ("installerId")
);

-- CreateIndex
CREATE INDEX "agentTask_kind_subject_idx" ON "agentTask"("kind", "subject") WHERE ("finishedAt" IS NULL);

-- CreateIndex
CREATE INDEX "slackChannel_updatedAt_idx" ON "slackChannel"("updatedAt");
