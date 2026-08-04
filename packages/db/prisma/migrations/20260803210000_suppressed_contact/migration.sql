-- CreateTable
CREATE TABLE "suppressedContact" (
    "email" TEXT NOT NULL,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "suppressedContact_pkey" PRIMARY KEY ("email")
);
