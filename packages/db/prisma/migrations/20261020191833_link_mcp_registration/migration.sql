/*
  Warnings:

  - Added the required column `registrationId` to the `mcpConnection` table without a default value. This is not possible if the table is not empty.
  - Added the required column `registrationId` to the `mcpOauthState` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "mcpConnection" ADD COLUMN     "registrationId" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "mcpOauthState" ADD COLUMN     "registrationId" TEXT NOT NULL;

-- AddForeignKey
ALTER TABLE "mcpConnection" ADD CONSTRAINT "mcpConnection_registrationId_fkey" FOREIGN KEY ("registrationId") REFERENCES "mcpClientRegistration"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mcpOauthState" ADD CONSTRAINT "mcpOauthState_registrationId_fkey" FOREIGN KEY ("registrationId") REFERENCES "mcpClientRegistration"("id") ON DELETE CASCADE ON UPDATE CASCADE;
