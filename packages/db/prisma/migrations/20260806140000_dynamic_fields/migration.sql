-- CreateEnum
CREATE TYPE "FieldEntity" AS ENUM ('COMPANY', 'CONTACT', 'DEAL');

-- CreateEnum
CREATE TYPE "FieldType" AS ENUM ('TEXT', 'LONG_TEXT', 'NUMBER', 'DATE', 'CHECKBOX', 'SELECT', 'URL', 'EMAIL', 'PHONE', 'USER');

-- CreateTable
CREATE TABLE "fieldDefinition" (
    "id" TEXT NOT NULL,
    "entity" "FieldEntity" NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "type" "FieldType" NOT NULL,
    "agentFilled" BOOLEAN NOT NULL DEFAULT true,
    "agentBrief" TEXT,
    "required" BOOLEAN NOT NULL DEFAULT false,
    "showOnSheet" BOOLEAN NOT NULL DEFAULT true,
    "showOnTable" BOOLEAN NOT NULL DEFAULT false,
    "position" INTEGER NOT NULL,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "fieldDefinition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fieldOption" (
    "id" TEXT NOT NULL,
    "fieldId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "archivedAt" TIMESTAMP(3),

    CONSTRAINT "fieldOption_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fieldValue" (
    "id" TEXT NOT NULL,
    "fieldId" TEXT NOT NULL,
    "companyId" TEXT,
    "contactId" TEXT,
    "dealId" TEXT,
    "text" TEXT,
    "number" DECIMAL(24,4),
    "date" TIMESTAMP(3),
    "bool" BOOLEAN,
    "optionId" TEXT,
    "userId" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "fieldValue_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "fieldDefinition_entity_position_idx" ON "fieldDefinition"("entity", "position");

-- CreateIndex
CREATE UNIQUE INDEX "fieldDefinition_entity_key_key" ON "fieldDefinition"("entity", "key");

-- CreateIndex
CREATE INDEX "fieldOption_fieldId_position_idx" ON "fieldOption"("fieldId", "position");

-- CreateIndex
CREATE INDEX "fieldValue_fieldId_text_idx" ON "fieldValue"("fieldId", "text");

-- CreateIndex
CREATE INDEX "fieldValue_fieldId_number_idx" ON "fieldValue"("fieldId", "number");

-- CreateIndex
CREATE INDEX "fieldValue_fieldId_date_idx" ON "fieldValue"("fieldId", "date");

-- CreateIndex
CREATE INDEX "fieldValue_optionId_idx" ON "fieldValue"("optionId");

-- CreateIndex
CREATE UNIQUE INDEX "fieldValue_fieldId_companyId_key" ON "fieldValue"("fieldId", "companyId");

-- CreateIndex
CREATE UNIQUE INDEX "fieldValue_fieldId_contactId_key" ON "fieldValue"("fieldId", "contactId");

-- CreateIndex
CREATE UNIQUE INDEX "fieldValue_fieldId_dealId_key" ON "fieldValue"("fieldId", "dealId");

-- AddForeignKey
ALTER TABLE "fieldOption" ADD CONSTRAINT "fieldOption_fieldId_fkey" FOREIGN KEY ("fieldId") REFERENCES "fieldDefinition"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fieldValue" ADD CONSTRAINT "fieldValue_fieldId_fkey" FOREIGN KEY ("fieldId") REFERENCES "fieldDefinition"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fieldValue" ADD CONSTRAINT "fieldValue_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fieldValue" ADD CONSTRAINT "fieldValue_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "contact"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fieldValue" ADD CONSTRAINT "fieldValue_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "deal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fieldValue" ADD CONSTRAINT "fieldValue_optionId_fkey" FOREIGN KEY ("optionId") REFERENCES "fieldOption"("id") ON DELETE SET NULL ON UPDATE CASCADE;
