/*
  Warnings:

  - A unique constraint covering the columns `[channelId,messageTs]` on the table `slackEventInbox` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "slackEventInbox" ADD COLUMN     "messageTs" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "slackEventInbox_channelId_messageTs_key" ON "slackEventInbox"("channelId", "messageTs");
