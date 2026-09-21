CREATE TABLE "quickBooksConnection" (
    "id" TEXT NOT NULL,
    "realmId" TEXT NOT NULL,
    "environment" TEXT NOT NULL,
    "encryptedTokens" TEXT NOT NULL,
    "enrolledBy" TEXT NOT NULL,
    "verifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "quickBooksConnection_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "quickBooksConnection_singleton" CHECK ("id" = 'workspace'),
    CONSTRAINT "quickBooksConnection_environment" CHECK ("environment" IN ('sandbox', 'production'))
);
