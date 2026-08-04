-- AlterTable
ALTER TABLE "organization" ADD COLUMN     "onboardedAt" TIMESTAMP(3);

-- An install that already told us its website has been onboarded; asking again
-- would be a form it has already filled in.
UPDATE "organization" SET "onboardedAt" = "createdAt" WHERE "website" IS NOT NULL;

-- CreateTable
CREATE TABLE "workspaceProfile" (
    "id" TEXT NOT NULL,
    "website" TEXT NOT NULL,
    "narrative" TEXT NOT NULL,
    "sections" JSONB NOT NULL,
    "sourceUrl" TEXT,
    "sessionId" TEXT,
    "refreshedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "workspaceProfile_pkey" PRIMARY KEY ("id")
);
