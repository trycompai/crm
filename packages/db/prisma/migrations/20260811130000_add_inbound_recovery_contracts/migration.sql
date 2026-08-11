ALTER TYPE "SubjectType" ADD VALUE 'CONTACT_CANDIDATE';

CREATE TYPE "ContactCandidateStatus" AS ENUM ('PENDING', 'MATCH_PROPOSED', 'ACCEPTED', 'REJECTED', 'EXCLUDED', 'QUARANTINED');

CREATE TYPE "ContactCandidatePermissionState" AS ENUM ('REVIEW_REQUIRED', 'PROHIBITED');

CREATE TYPE "ProvenanceStatus" AS ENUM ('PROPOSED', 'APPLIED', 'REJECTED', 'SUPERSEDED');

CREATE TYPE "RecordQuarantineStatus" AS ENUM ('ACTIVE', 'RESOLVED');

ALTER TABLE "granolaNoteExclusion"
ADD COLUMN "sourceDigest" TEXT,
ADD COLUMN "evidence" JSONB,
ADD COLUMN "reviewedById" TEXT,
ADD COLUMN "reviewedAt" TIMESTAMP(3);

CREATE TABLE "inboundSourceReceipt" (
    "id" TEXT NOT NULL,
    "connector" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "sourceObjectType" TEXT NOT NULL,
    "sourceObjectId" TEXT NOT NULL,
    "sourceDigest" TEXT NOT NULL,
    "sourceCreatedAt" TIMESTAMP(3),
    "sourceUpdatedAt" TIMESTAMP(3),
    "capturedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sourceUrl" TEXT,
    "redactedMetadata" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "inboundSourceReceipt_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "inboundSourceReceipt_sourceDigest_check" CHECK ("sourceDigest" ~ '^[0-9a-f]{64}$'),
    CONSTRAINT "inboundSourceReceipt_redactedMetadata_check" CHECK (
        jsonb_typeof("redactedMetadata") = 'object'
        AND pg_column_size("redactedMetadata") <= 16384
        AND NOT jsonb_path_exists("redactedMetadata", '$.** ? (@.type() == "object").keyvalue() ? (@.key like_regex "(?i)^(body|text|content|html|raw|token|secret|password|authorization|cookie)$")')
    )
);

CREATE TABLE "contactCandidate" (
    "id" TEXT NOT NULL,
    "identityKey" TEXT NOT NULL,
    "rawEmail" TEXT,
    "canonicalEmail" TEXT,
    "rawName" TEXT,
    "canonicalName" TEXT,
    "rawBusinessName" TEXT,
    "canonicalBusinessName" TEXT,
    "rawDomain" TEXT,
    "canonicalDomain" TEXT,
    "status" "ContactCandidateStatus" NOT NULL DEFAULT 'PENDING',
    "permissionState" "ContactCandidatePermissionState" NOT NULL DEFAULT 'REVIEW_REQUIRED',
    "proposedCompanyId" TEXT,
    "proposedContactId" TEXT,
    "decisionById" TEXT,
    "decisionReason" TEXT,
    "decidedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "contactCandidate_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "contactCandidate_identityKey_check" CHECK ("identityKey" ~ '^[0-9a-f]{64}$'),
    CONSTRAINT "contactCandidate_canonical_identity_check" CHECK (
        NULLIF(btrim("canonicalEmail"), '') IS NOT NULL
        OR (NULLIF(btrim("canonicalName"), '') IS NOT NULL AND NULLIF(btrim("canonicalDomain"), '') IS NOT NULL)
        OR (NULLIF(btrim("canonicalBusinessName"), '') IS NOT NULL AND NULLIF(btrim("canonicalDomain"), '') IS NOT NULL)
    ),
    CONSTRAINT "contactCandidate_decision_check" CHECK (
        "status" NOT IN ('ACCEPTED', 'REJECTED', 'EXCLUDED')
        OR ("decisionById" IS NOT NULL AND "decidedAt" IS NOT NULL AND NULLIF(btrim("decisionReason"), '') IS NOT NULL)
    ),
    CONSTRAINT "contactCandidate_prohibited_status_check" CHECK (
        "status" NOT IN ('REJECTED', 'EXCLUDED', 'QUARANTINED') OR "permissionState" = 'PROHIBITED'
    )
);

CREATE TABLE "contactCandidateObservation" (
    "id" TEXT NOT NULL,
    "candidateId" TEXT NOT NULL,
    "receiptId" TEXT NOT NULL,
    "sourceDigest" TEXT NOT NULL,
    "observationKey" TEXT NOT NULL,
    "observedEmail" TEXT,
    "observedName" TEXT,
    "observedTitle" TEXT,
    "observedCompany" TEXT,
    "observedDomain" TEXT,
    "observedRole" TEXT,
    "evidenceClass" TEXT NOT NULL,
    "observedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "contactCandidateObservation_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "contactCandidateObservation_sourceDigest_check" CHECK ("sourceDigest" ~ '^[0-9a-f]{64}$'),
    CONSTRAINT "contactCandidateObservation_observationKey_check" CHECK ("observationKey" ~ '^[0-9a-f]{64}$')
);

CREATE TABLE "entityFieldProvenance" (
    "id" TEXT NOT NULL,
    "subjectType" "SubjectType" NOT NULL,
    "subjectId" TEXT NOT NULL,
    "fieldName" TEXT NOT NULL,
    "valueDigest" TEXT NOT NULL,
    "receiptId" TEXT NOT NULL,
    "confidence" DOUBLE PRECISION,
    "method" TEXT NOT NULL,
    "status" "ProvenanceStatus" NOT NULL DEFAULT 'PROPOSED',
    "observedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "freshUntil" TIMESTAMP(3),
    "decidedById" TEXT,
    "decidedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "entityFieldProvenance_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "entityFieldProvenance_human_decision_check" CHECK ("status" NOT IN ('REJECTED', 'SUPERSEDED') OR ("decidedById" IS NOT NULL AND "decidedAt" IS NOT NULL)),
    CONSTRAINT "entityFieldProvenance_shape_check" CHECK (
        NULLIF(btrim("subjectId"), '') IS NOT NULL
        AND NULLIF(btrim("fieldName"), '') IS NOT NULL
        AND NULLIF(btrim("method"), '') IS NOT NULL
        AND "valueDigest" ~ '^[0-9a-f]{64}$'
        AND ("confidence" IS NULL OR "confidence" BETWEEN 0 AND 1)
        AND ("freshUntil" IS NULL OR "freshUntil" >= "observedAt")
    )
);

CREATE TABLE "entityLinkProvenance" (
    "id" TEXT NOT NULL,
    "sourceType" "SubjectType" NOT NULL,
    "sourceId" TEXT NOT NULL,
    "relationship" TEXT NOT NULL,
    "targetType" "SubjectType" NOT NULL,
    "targetId" TEXT NOT NULL,
    "receiptId" TEXT NOT NULL,
    "confidence" DOUBLE PRECISION,
    "method" TEXT NOT NULL,
    "status" "ProvenanceStatus" NOT NULL DEFAULT 'PROPOSED',
    "observedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "freshUntil" TIMESTAMP(3),
    "decidedById" TEXT,
    "decidedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "entityLinkProvenance_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "entityLinkProvenance_human_decision_check" CHECK ("status" NOT IN ('REJECTED', 'SUPERSEDED') OR ("decidedById" IS NOT NULL AND "decidedAt" IS NOT NULL)),
    CONSTRAINT "entityLinkProvenance_shape_check" CHECK (
        NULLIF(btrim("sourceId"), '') IS NOT NULL
        AND NULLIF(btrim("targetId"), '') IS NOT NULL
        AND NULLIF(btrim("relationship"), '') IS NOT NULL
        AND NULLIF(btrim("method"), '') IS NOT NULL
        AND ("confidence" IS NULL OR "confidence" BETWEEN 0 AND 1)
        AND ("freshUntil" IS NULL OR "freshUntil" >= "observedAt")
    )
);

CREATE TABLE "recordQuarantine" (
    "id" TEXT NOT NULL,
    "subjectType" "SubjectType" NOT NULL,
    "subjectId" TEXT NOT NULL,
    "sourceBatch" TEXT,
    "receiptId" TEXT,
    "reason" TEXT NOT NULL,
    "evidence" JSONB,
    "status" "RecordQuarantineStatus" NOT NULL DEFAULT 'ACTIVE',
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "recordQuarantine_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "recordQuarantine_resolved_evidence_check" CHECK ("status" <> 'RESOLVED' OR ("reviewedById" IS NOT NULL AND "reviewedAt" IS NOT NULL AND "resolvedAt" IS NOT NULL))
);

CREATE UNIQUE INDEX "inboundSourceReceipt_source_identity_key" ON "inboundSourceReceipt"("connector", "provider", "accountId", "sourceObjectType", "sourceObjectId", "sourceDigest");
CREATE UNIQUE INDEX "inboundSourceReceipt_id_sourceDigest_key" ON "inboundSourceReceipt"("id", "sourceDigest");
CREATE INDEX "inboundSourceReceipt_connector_accountId_capturedAt_idx" ON "inboundSourceReceipt"("connector", "accountId", "capturedAt");
CREATE INDEX "inboundSourceReceipt_provider_accountId_capturedAt_idx" ON "inboundSourceReceipt"("provider", "accountId", "capturedAt");
CREATE INDEX "inboundSourceReceipt_sourceDigest_idx" ON "inboundSourceReceipt"("sourceDigest");

CREATE UNIQUE INDEX "contactCandidate_identityKey_key" ON "contactCandidate"("identityKey");
CREATE INDEX "contactCandidate_status_permissionState_updatedAt_idx" ON "contactCandidate"("status", "permissionState", "updatedAt");
CREATE INDEX "contactCandidate_canonicalEmail_idx" ON "contactCandidate"("canonicalEmail");
CREATE INDEX "contactCandidate_canonicalDomain_status_idx" ON "contactCandidate"("canonicalDomain", "status");
CREATE INDEX "contactCandidate_proposedCompanyId_status_idx" ON "contactCandidate"("proposedCompanyId", "status");
CREATE INDEX "contactCandidate_proposedContactId_status_idx" ON "contactCandidate"("proposedContactId", "status");
CREATE INDEX "contactCandidate_decisionById_decidedAt_idx" ON "contactCandidate"("decisionById", "decidedAt");

CREATE UNIQUE INDEX "contactCandidateObservation_observationKey_key" ON "contactCandidateObservation"("observationKey");
CREATE INDEX "contactCandidateObservation_candidateId_observedAt_idx" ON "contactCandidateObservation"("candidateId", "observedAt");
CREATE INDEX "contactCandidateObservation_receiptId_sourceDigest_idx" ON "contactCandidateObservation"("receiptId", "sourceDigest");
CREATE INDEX "contactCandidateObservation_evidenceClass_observedAt_idx" ON "contactCandidateObservation"("evidenceClass", "observedAt");

CREATE UNIQUE INDEX "entityFieldProvenance_identity_key" ON "entityFieldProvenance"("subjectType", "subjectId", "fieldName", "valueDigest", "receiptId");
CREATE UNIQUE INDEX "entityFieldProvenance_applied_subject_field_key" ON "entityFieldProvenance"("subjectType", "subjectId", "fieldName") WHERE "status" = 'APPLIED';
CREATE INDEX "entityFieldProvenance_subject_scope_idx" ON "entityFieldProvenance"("subjectType", "subjectId", "fieldName", "status");
CREATE INDEX "entityFieldProvenance_status_freshUntil_idx" ON "entityFieldProvenance"("status", "freshUntil");
CREATE INDEX "entityFieldProvenance_receiptId_idx" ON "entityFieldProvenance"("receiptId");
CREATE INDEX "entityFieldProvenance_decidedById_decidedAt_idx" ON "entityFieldProvenance"("decidedById", "decidedAt");

CREATE UNIQUE INDEX "entityLinkProvenance_identity_key" ON "entityLinkProvenance"("sourceType", "sourceId", "relationship", "targetType", "targetId", "receiptId");
CREATE UNIQUE INDEX "entityLinkProvenance_applied_source_relationship_key" ON "entityLinkProvenance"("sourceType", "sourceId", "relationship") WHERE "status" = 'APPLIED';
CREATE INDEX "entityLinkProvenance_source_scope_idx" ON "entityLinkProvenance"("sourceType", "sourceId", "relationship", "status");
CREATE INDEX "entityLinkProvenance_target_scope_idx" ON "entityLinkProvenance"("targetType", "targetId", "relationship", "status");
CREATE INDEX "entityLinkProvenance_status_freshUntil_idx" ON "entityLinkProvenance"("status", "freshUntil");
CREATE INDEX "entityLinkProvenance_receiptId_idx" ON "entityLinkProvenance"("receiptId");
CREATE INDEX "entityLinkProvenance_decidedById_decidedAt_idx" ON "entityLinkProvenance"("decidedById", "decidedAt");

CREATE UNIQUE INDEX "recordQuarantine_active_subject_reason_key" ON "recordQuarantine"("subjectType", "subjectId", "reason") WHERE "status" = 'ACTIVE';
CREATE INDEX "recordQuarantine_subjectType_subjectId_status_idx" ON "recordQuarantine"("subjectType", "subjectId", "status");
CREATE INDEX "recordQuarantine_sourceBatch_status_idx" ON "recordQuarantine"("sourceBatch", "status");
CREATE INDEX "recordQuarantine_receiptId_idx" ON "recordQuarantine"("receiptId");
CREATE INDEX "recordQuarantine_reviewedById_reviewedAt_idx" ON "recordQuarantine"("reviewedById", "reviewedAt");
CREATE INDEX "granolaNoteExclusion_reviewedById_reviewedAt_idx" ON "granolaNoteExclusion"("reviewedById", "reviewedAt");

ALTER TABLE "granolaNoteExclusion" ADD CONSTRAINT "granolaNoteExclusion_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "contactCandidate" ADD CONSTRAINT "contactCandidate_proposedCompanyId_fkey" FOREIGN KEY ("proposedCompanyId") REFERENCES "company"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "contactCandidate" ADD CONSTRAINT "contactCandidate_proposedContactId_fkey" FOREIGN KEY ("proposedContactId") REFERENCES "contact"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "contactCandidate" ADD CONSTRAINT "contactCandidate_decisionById_fkey" FOREIGN KEY ("decisionById") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "contactCandidateObservation" ADD CONSTRAINT "contactCandidateObservation_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "contactCandidate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "contactCandidateObservation" ADD CONSTRAINT "contactCandidateObservation_receiptId_sourceDigest_fkey" FOREIGN KEY ("receiptId", "sourceDigest") REFERENCES "inboundSourceReceipt"("id", "sourceDigest") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "entityFieldProvenance" ADD CONSTRAINT "entityFieldProvenance_receiptId_fkey" FOREIGN KEY ("receiptId") REFERENCES "inboundSourceReceipt"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "entityFieldProvenance" ADD CONSTRAINT "entityFieldProvenance_decidedById_fkey" FOREIGN KEY ("decidedById") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "entityLinkProvenance" ADD CONSTRAINT "entityLinkProvenance_receiptId_fkey" FOREIGN KEY ("receiptId") REFERENCES "inboundSourceReceipt"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "entityLinkProvenance" ADD CONSTRAINT "entityLinkProvenance_decidedById_fkey" FOREIGN KEY ("decidedById") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "recordQuarantine" ADD CONSTRAINT "recordQuarantine_receiptId_fkey" FOREIGN KEY ("receiptId") REFERENCES "inboundSourceReceipt"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "recordQuarantine" ADD CONSTRAINT "recordQuarantine_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE FUNCTION "protectInboundSourceReceipt"() RETURNS trigger LANGUAGE plpgsql AS $function$
BEGIN
    RAISE EXCEPTION 'Inbound source receipts are immutable';
END;
$function$;

CREATE TRIGGER "inboundSourceReceipt_immutable"
BEFORE UPDATE OR DELETE ON "inboundSourceReceipt"
FOR EACH ROW EXECUTE FUNCTION "protectInboundSourceReceipt"();
