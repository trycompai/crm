CREATE TABLE "granolaNoteExclusion" (
    "externalId" TEXT NOT NULL,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "granolaNoteExclusion_pkey" PRIMARY KEY ("externalId")
);
