-- CreateIndex
CREATE INDEX "fieldValue_companyId_idx" ON "fieldValue"("companyId");

-- CreateIndex
CREATE INDEX "fieldValue_contactId_idx" ON "fieldValue"("contactId");

-- CreateIndex
CREATE INDEX "fieldValue_dealId_idx" ON "fieldValue"("dealId");

-- CreateIndex
CREATE INDEX "fieldValue_userId_idx" ON "fieldValue"("userId");

UPDATE "fieldValue" SET "userId" = NULL
WHERE "userId" IS NOT NULL
  AND "userId" NOT IN (SELECT "id" FROM "user");

-- AddForeignKey
ALTER TABLE "fieldValue" ADD CONSTRAINT "fieldValue_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;
