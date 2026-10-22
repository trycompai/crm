CREATE TYPE "McpConnectionStatus" AS ENUM ('CONNECTING', 'CONNECTED', 'ERROR', 'DISCONNECTED');

CREATE TYPE "McpAccessMode" AS ENUM ('READ_ONLY', 'READ_WRITE');

CREATE TYPE "McpToolReviewState" AS ENUM ('PENDING', 'REVIEWED', 'CHANGED', 'REMOVED');

CREATE TABLE "mcpConnection" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "platformSlug" TEXT NOT NULL,
    "status" "McpConnectionStatus" NOT NULL DEFAULT 'CONNECTING',
    "accessMode" "McpAccessMode" NOT NULL,
    "grantedScopes" TEXT[],
    "encryptedAccessToken" TEXT,
    "encryptedRefreshToken" TEXT,
    "tokenExpiresAt" TIMESTAMP(3),
    "connectedById" TEXT NOT NULL,
    "connectedAt" TIMESTAMP(3),
    "lastSuccessfulCallAt" TIMESTAMP(3),
    "lastErrorCode" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "mcpConnection_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "mcpClientRegistration" (
    "id" TEXT NOT NULL,
    "platformSlug" TEXT NOT NULL,
    "metadataFingerprint" TEXT NOT NULL,
    "issuer" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "encryptedClientSecret" TEXT,
    "encryptedRegistrationAccessToken" TEXT,
    "clientIdIssuedAt" TIMESTAMP(3),
    "clientSecretExpiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "mcpClientRegistration_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "mcpToolSnapshot" (
    "id" TEXT NOT NULL,
    "connectionId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "inputSchema" JSONB NOT NULL,
    "annotations" JSONB,
    "fingerprint" TEXT NOT NULL,
    "callKind" TEXT NOT NULL,
    "reviewState" "McpToolReviewState" NOT NULL DEFAULT 'PENDING',
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mcpToolSnapshot_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "mcpOauthState" (
    "id" TEXT NOT NULL,
    "stateHash" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "platformSlug" TEXT NOT NULL,
    "accessMode" "McpAccessMode" NOT NULL,
    "returnPath" TEXT NOT NULL,
    "encryptedCodeVerifier" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mcpOauthState_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "mcpConnection_status_updatedAt_idx" ON "mcpConnection"("status", "updatedAt");

CREATE UNIQUE INDEX "mcpConnection_organizationId_platformSlug_key" ON "mcpConnection"("organizationId", "platformSlug");

CREATE INDEX "mcpClientRegistration_clientSecretExpiresAt_idx" ON "mcpClientRegistration"("clientSecretExpiresAt");

CREATE UNIQUE INDEX "mcpClientRegistration_platformSlug_metadataFingerprint_key" ON "mcpClientRegistration"("platformSlug", "metadataFingerprint");

CREATE INDEX "mcpToolSnapshot_connectionId_name_lastSeenAt_idx" ON "mcpToolSnapshot"("connectionId", "name", "lastSeenAt");

CREATE INDEX "mcpToolSnapshot_reviewState_lastSeenAt_idx" ON "mcpToolSnapshot"("reviewState", "lastSeenAt");

CREATE UNIQUE INDEX "mcpToolSnapshot_connectionId_name_fingerprint_key" ON "mcpToolSnapshot"("connectionId", "name", "fingerprint");

CREATE UNIQUE INDEX "mcpOauthState_stateHash_key" ON "mcpOauthState"("stateHash");

CREATE INDEX "mcpOauthState_expiresAt_consumedAt_idx" ON "mcpOauthState"("expiresAt", "consumedAt");

ALTER TABLE "mcpConnection" ADD CONSTRAINT "mcpConnection_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "mcpConnection" ADD CONSTRAINT "mcpConnection_connectedById_fkey" FOREIGN KEY ("connectedById") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "mcpToolSnapshot" ADD CONSTRAINT "mcpToolSnapshot_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "mcpConnection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "mcpOauthState" ADD CONSTRAINT "mcpOauthState_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "mcpOauthState" ADD CONSTRAINT "mcpOauthState_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
