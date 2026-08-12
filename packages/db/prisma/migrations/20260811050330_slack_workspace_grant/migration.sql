-- AlterTable
ALTER TABLE "slackChannel" ADD COLUMN     "inviteRequestedAt" TIMESTAMP(3),
ADD COLUMN     "isMember" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "isPrivate" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "slackWorkspaceGrant" (
    "id" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "teamName" TEXT,
    "userToken" TEXT NOT NULL,
    "userScopes" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "slackWorkspaceGrant_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "slackWorkspaceGrant_teamId_key" ON "slackWorkspaceGrant"("teamId");
