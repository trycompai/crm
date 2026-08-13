-- CreateTable
CREATE TABLE "marketingResendAuthAttempt" (
    "state" TEXT NOT NULL,
    "verifier" TEXT NOT NULL,
    "returnTo" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "marketingResendAuthAttempt_pkey" PRIMARY KEY ("state")
);

-- AlterTable
ALTER TABLE "appSetting" DROP COLUMN "marketingResendAuthState",
DROP COLUMN "marketingResendAuthVerifier";
