CREATE TABLE "slackMemberMatch" (
    "id" TEXT NOT NULL,
    "crmUserId" TEXT NOT NULL,
    "slackUserId" TEXT,
    "slackHandle" TEXT,
    "slackEmail" TEXT,
    "explicitlyUnmatched" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "slackMemberMatch_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "slackMemberMatch_crmUserId_key" ON "slackMemberMatch"("crmUserId");
CREATE INDEX "slackMemberMatch_slackUserId_idx" ON "slackMemberMatch"("slackUserId");

ALTER TABLE "slackMemberMatch" ADD CONSTRAINT "slackMemberMatch_crmUserId_fkey" FOREIGN KEY ("crmUserId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "slackChannel" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "memberCount" INTEGER,
    "available" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "slackChannel_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "slackChannel_available_name_idx" ON "slackChannel"("available", "name");
