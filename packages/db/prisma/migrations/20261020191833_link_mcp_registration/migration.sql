ALTER TABLE "mcpConnection" ADD COLUMN     "registrationId" TEXT NOT NULL;

ALTER TABLE "mcpOauthState" ADD COLUMN     "registrationId" TEXT NOT NULL;

ALTER TABLE "mcpConnection" ADD CONSTRAINT "mcpConnection_registrationId_fkey" FOREIGN KEY ("registrationId") REFERENCES "mcpClientRegistration"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "mcpOauthState" ADD CONSTRAINT "mcpOauthState_registrationId_fkey" FOREIGN KEY ("registrationId") REFERENCES "mcpClientRegistration"("id") ON DELETE CASCADE ON UPDATE CASCADE;
