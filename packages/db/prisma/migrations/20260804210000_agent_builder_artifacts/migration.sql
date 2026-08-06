CREATE TYPE "AgentBuilderArtifactStatus" AS ENUM ('WRITING', 'READY');

CREATE TABLE "agentBuilderArtifact" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT,
    "versionId" TEXT,
    "path" TEXT NOT NULL,
    "language" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "previousContent" TEXT,
    "revision" INTEGER NOT NULL,
    "status" "AgentBuilderArtifactStatus" NOT NULL DEFAULT 'WRITING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "agentBuilderArtifact_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "agentBuilderArtifact_conversationId_path_revision_key" ON "agentBuilderArtifact"("conversationId", "path", "revision");
CREATE INDEX "agentBuilderArtifact_conversationId_createdAt_idx" ON "agentBuilderArtifact"("conversationId", "createdAt");
CREATE INDEX "agentBuilderArtifact_versionId_path_idx" ON "agentBuilderArtifact"("versionId", "path");

ALTER TABLE "agentBuilderArtifact" ADD CONSTRAINT "agentBuilderArtifact_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "agentConversation"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "agentBuilderArtifact" ADD CONSTRAINT "agentBuilderArtifact_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "agentVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;
