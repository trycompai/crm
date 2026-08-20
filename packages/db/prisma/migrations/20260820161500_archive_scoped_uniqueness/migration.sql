-- DropIndex
DROP INDEX "company_domain_key";

-- DropIndex
DROP INDEX "contact_email_key";

-- CreateIndex
CREATE UNIQUE INDEX "company_domain_active_key" ON "company"("domain") WHERE ("archivedAt" IS NULL);

-- CreateIndex
CREATE UNIQUE INDEX "contact_email_active_key" ON "contact"("email") WHERE ("archivedAt" IS NULL);
