CREATE TYPE "MailboxBackfillStatus" AS ENUM ('RUNNING', 'COMPLETE', 'FAILED');

ALTER TABLE "mailboxSync"
ADD COLUMN "backfillStatus" "MailboxBackfillStatus",
ADD COLUMN "backfillFrom" TIMESTAMP(3),
ADD COLUMN "backfillCursor" TIMESTAMP(3),
ADD COLUMN "backfillUntil" TIMESTAMP(3),
ADD COLUMN "backfillStartedAt" TIMESTAMP(3),
ADD COLUMN "backfillCompletedAt" TIMESTAMP(3),
ADD COLUMN "backfillMessagesSeen" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "backfillMessagesWritten" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "backfillLastError" TEXT;
