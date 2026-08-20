-- CreateTable
CREATE TABLE "savedView" (
    "id" TEXT NOT NULL,
    "entity" "FieldEntity" NOT NULL,
    "name" TEXT NOT NULL,
    "shared" BOOLEAN NOT NULL DEFAULT false,
    "filters" JSONB NOT NULL,
    "ownerId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "savedView_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "savedView_entity_shared_idx" ON "savedView"("entity", "shared");

-- CreateIndex
CREATE UNIQUE INDEX "savedView_entity_ownerId_name_key" ON "savedView"("entity", "ownerId", "name");

-- AddForeignKey
ALTER TABLE "savedView" ADD CONSTRAINT "savedView_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
