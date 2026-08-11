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

CREATE FUNCTION "validateInboundRedactedMetadata"(metadata JSONB) RETURNS BOOLEAN LANGUAGE plpgsql IMMUTABLE AS $function$
DECLARE
    metadataKey TEXT;
    metadataValue JSONB;
BEGIN
    IF jsonb_typeof(metadata) <> 'object' OR octet_length(metadata::text) > 16384 THEN
        RETURN FALSE;
    END IF;
    FOR metadataKey, metadataValue IN SELECT object_key, object_value FROM jsonb_each(metadata) AS entries(object_key, object_value) LOOP
        IF metadataKey NOT IN ('connector', 'provider', 'accountId', 'sourceObjectType', 'sourceObjectId', 'sourceVersion', 'sourceCreatedAt', 'sourceUpdatedAt', 'capturedAt', 'cursor', 'syncToken', 'historyId', 'etag', 'page', 'pageSize', 'hasMore', 'resourceType', 'resourceId', 'threadId', 'messageId', 'conversationId', 'status', 'httpStatus', 'errorCode', 'errorType', 'retryAfter', 'nextRetryAt', 'attempt', 'latencyMs', 'startedAt', 'completedAt', 'version') THEN
            RETURN FALSE;
        END IF;
        IF jsonb_typeof(metadataValue) NOT IN ('string', 'number', 'boolean', 'null') THEN
            RETURN FALSE;
        END IF;
        IF jsonb_typeof(metadataValue) = 'string' AND octet_length(metadataValue #>> '{}') > 512 THEN
            RETURN FALSE;
        END IF;
        IF metadataKey = 'status' AND (jsonb_typeof(metadataValue) <> 'string' OR metadataValue #>> '{}' NOT IN ('ok', 'success', 'error', 'pending', 'retrying', 'connected', 'disconnected', 'active', 'paused', 'failed')) THEN
            RETURN FALSE;
        END IF;
    END LOOP;
    RETURN TRUE;
END;
$function$;

CREATE FUNCTION "canonicalizeInboundText"(value TEXT) RETURNS TEXT LANGUAGE SQL IMMUTABLE AS $function$
SELECT lower(btrim(normalize(coalesce(value, ''), NFKC)));
$function$;

CREATE FUNCTION "encodeInboundCanonicalComponent"(value TEXT) RETURNS TEXT LANGUAGE SQL IMMUTABLE AS $function$
SELECT char_length(value)::text || ':' || value;
$function$;

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
    CONSTRAINT "inboundSourceReceipt_identity_nonblank_check" CHECK (
        NULLIF(btrim("connector"), '') IS NOT NULL
        AND NULLIF(btrim("provider"), '') IS NOT NULL
        AND NULLIF(btrim("accountId"), '') IS NOT NULL
        AND NULLIF(btrim("sourceObjectType"), '') IS NOT NULL
        AND NULLIF(btrim("sourceObjectId"), '') IS NOT NULL
    ),
    CONSTRAINT "inboundSourceReceipt_sourceDigest_check" CHECK ("sourceDigest" ~ '^[0-9a-f]{64}$'),
    CONSTRAINT "inboundSourceReceipt_sourceUrl_check" CHECK (
        "sourceUrl" IS NULL
        OR (
            octet_length("sourceUrl") <= 2048
            AND "sourceUrl" ~ '^https://[A-Za-z0-9][A-Za-z0-9.-]*[A-Za-z0-9](:[0-9]{1,5})?(/[^?#[:space:]]*)?$'
            AND "sourceUrl" !~ '^https://[^/?#]*@'
        )
    ),
    CONSTRAINT "inboundSourceReceipt_redactedMetadata_check" CHECK ("validateInboundRedactedMetadata"("redactedMetadata"))
);

CREATE TABLE "contactCandidate" (
    "id" TEXT NOT NULL,
    "identityKey" TEXT NOT NULL,
    "canonicalIdentityKey" TEXT NOT NULL DEFAULT '',
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
    CONSTRAINT "contactCandidate_accepted_check" CHECK (
        "status" <> 'ACCEPTED'
        OR ("decisionById" IS NOT NULL AND "decidedAt" IS NOT NULL AND NULLIF(btrim("decisionReason"), '') IS NOT NULL AND "permissionState" <> 'PROHIBITED' AND "proposedContactId" IS NOT NULL)
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
    "observationIdentityKey" TEXT NOT NULL DEFAULT '',
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
    CONSTRAINT "contactCandidateObservation_observationKey_check" CHECK ("observationKey" ~ '^[0-9a-f]{64}$'),
    CONSTRAINT "contactCandidateObservation_evidence_nonblank_check" CHECK (NULLIF(btrim("evidenceClass"), '') IS NOT NULL)
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
    CONSTRAINT "entityFieldProvenance_human_decision_check" CHECK (
        ("decidedById" IS NULL) = ("decidedAt" IS NULL)
        AND ("status" <> 'PROPOSED' OR ("decidedById" IS NULL AND "decidedAt" IS NULL))
        AND ("status" NOT IN ('APPLIED', 'REJECTED', 'SUPERSEDED') OR ("decidedById" IS NOT NULL AND "decidedAt" IS NOT NULL))
    ),
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
    CONSTRAINT "entityLinkProvenance_human_decision_check" CHECK (
        ("decidedById" IS NULL) = ("decidedAt" IS NULL)
        AND ("status" <> 'PROPOSED' OR ("decidedById" IS NULL AND "decidedAt" IS NULL))
        AND ("status" NOT IN ('APPLIED', 'REJECTED', 'SUPERSEDED') OR ("decidedById" IS NOT NULL AND "decidedAt" IS NOT NULL))
    ),
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
    CONSTRAINT "recordQuarantine_reason_nonblank_check" CHECK (NULLIF(btrim("reason"), '') IS NOT NULL),
    CONSTRAINT "recordQuarantine_resolved_evidence_check" CHECK ("status" <> 'RESOLVED' OR ("reviewedById" IS NOT NULL AND "reviewedAt" IS NOT NULL AND "resolvedAt" IS NOT NULL))
);

CREATE FUNCTION "populateContactCandidateCanonicalIdentity"() RETURNS trigger LANGUAGE plpgsql AS $function$
DECLARE
    email TEXT := "canonicalizeInboundText"(NEW."canonicalEmail");
    name TEXT := "canonicalizeInboundText"(NEW."canonicalName");
    businessName TEXT := "canonicalizeInboundText"(NEW."canonicalBusinessName");
    domain TEXT := "canonicalizeInboundText"(NEW."canonicalDomain");
BEGIN
    IF email <> '' THEN
        NEW."canonicalIdentityKey" := 'email|' || "encodeInboundCanonicalComponent"(email);
    ELSIF name <> '' AND domain <> '' THEN
        NEW."canonicalIdentityKey" := 'person|' || "encodeInboundCanonicalComponent"(name) || '|' || "encodeInboundCanonicalComponent"(domain);
    ELSIF businessName <> '' AND domain <> '' THEN
        NEW."canonicalIdentityKey" := 'business|' || "encodeInboundCanonicalComponent"(businessName) || '|' || "encodeInboundCanonicalComponent"(domain);
    ELSE
        NEW."canonicalIdentityKey" := '';
    END IF;
    RETURN NEW;
END;
$function$;

CREATE TRIGGER "contactCandidate_canonicalIdentity_populate"
BEFORE INSERT OR UPDATE ON "contactCandidate"
FOR EACH ROW EXECUTE FUNCTION "populateContactCandidateCanonicalIdentity"();

CREATE FUNCTION "populateContactCandidateObservationIdentity"() RETURNS trigger LANGUAGE plpgsql AS $function$
BEGIN
    NEW."observationIdentityKey" := concat_ws('|',
        "encodeInboundCanonicalComponent"('observation'),
        "encodeInboundCanonicalComponent"(NEW."candidateId"),
        "encodeInboundCanonicalComponent"(NEW."receiptId"),
        "encodeInboundCanonicalComponent"(NEW."sourceDigest"),
        "encodeInboundCanonicalComponent"("canonicalizeInboundText"(NEW."observedEmail")),
        "encodeInboundCanonicalComponent"("canonicalizeInboundText"(NEW."observedName")),
        "encodeInboundCanonicalComponent"("canonicalizeInboundText"(NEW."observedTitle")),
        "encodeInboundCanonicalComponent"("canonicalizeInboundText"(NEW."observedCompany")),
        "encodeInboundCanonicalComponent"("canonicalizeInboundText"(NEW."observedDomain")),
        "encodeInboundCanonicalComponent"("canonicalizeInboundText"(NEW."observedRole")),
        "encodeInboundCanonicalComponent"("canonicalizeInboundText"(NEW."evidenceClass"))
    );
    RETURN NEW;
END;
$function$;

CREATE TRIGGER "contactCandidateObservation_identity_populate"
BEFORE INSERT OR UPDATE ON "contactCandidateObservation"
FOR EACH ROW EXECUTE FUNCTION "populateContactCandidateObservationIdentity"();

CREATE UNIQUE INDEX "inboundSourceReceipt_source_identity_key" ON "inboundSourceReceipt"("connector", "provider", "accountId", "sourceObjectType", "sourceObjectId", "sourceDigest");
CREATE UNIQUE INDEX "inboundSourceReceipt_id_sourceDigest_key" ON "inboundSourceReceipt"("id", "sourceDigest");
CREATE INDEX "inboundSourceReceipt_connector_accountId_capturedAt_idx" ON "inboundSourceReceipt"("connector", "accountId", "capturedAt");
CREATE INDEX "inboundSourceReceipt_provider_accountId_capturedAt_idx" ON "inboundSourceReceipt"("provider", "accountId", "capturedAt");
CREATE INDEX "inboundSourceReceipt_sourceDigest_idx" ON "inboundSourceReceipt"("sourceDigest");

CREATE INDEX "contactCandidate_identityKey_idx" ON "contactCandidate"("identityKey");
CREATE UNIQUE INDEX "contactCandidate_canonicalIdentityKey_key" ON "contactCandidate"("canonicalIdentityKey");
CREATE INDEX "contactCandidate_status_permissionState_updatedAt_idx" ON "contactCandidate"("status", "permissionState", "updatedAt");
CREATE INDEX "contactCandidate_canonicalEmail_idx" ON "contactCandidate"("canonicalEmail");
CREATE INDEX "contactCandidate_canonicalDomain_status_idx" ON "contactCandidate"("canonicalDomain", "status");
CREATE INDEX "contactCandidate_proposedCompanyId_status_idx" ON "contactCandidate"("proposedCompanyId", "status");
CREATE INDEX "contactCandidate_proposedContactId_status_idx" ON "contactCandidate"("proposedContactId", "status");
CREATE INDEX "contactCandidate_decisionById_decidedAt_idx" ON "contactCandidate"("decisionById", "decidedAt");

CREATE INDEX "contactCandidateObservation_observationKey_idx" ON "contactCandidateObservation"("observationKey");
CREATE UNIQUE INDEX "contactCandidateObservation_observationIdentityKey_key" ON "contactCandidateObservation"("observationIdentityKey");
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

CREATE FUNCTION "protectAppliedEntityFieldProvenance"() RETURNS trigger LANGUAGE plpgsql AS $function$
BEGIN
    IF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION 'Field provenance evidence cannot be deleted';
    END IF;
    IF OLD."status" IN ('SUPERSEDED', 'REJECTED') THEN
        RAISE EXCEPTION 'Terminal field provenance is audit-stable';
    END IF;
    IF ROW(NEW."subjectType", NEW."subjectId", NEW."fieldName", NEW."valueDigest", NEW."receiptId", NEW."confidence", NEW."method", NEW."observedAt", NEW."freshUntil") IS DISTINCT FROM ROW(OLD."subjectType", OLD."subjectId", OLD."fieldName", OLD."valueDigest", OLD."receiptId", OLD."confidence", OLD."method", OLD."observedAt", OLD."freshUntil") THEN
        RAISE EXCEPTION 'Field provenance claim payload is immutable';
    END IF;
    IF OLD."status" = 'PROPOSED' AND NEW."status" = 'APPLIED' THEN
        IF NEW."decidedById" IS NULL OR NEW."decidedAt" IS NULL THEN
            RAISE EXCEPTION 'Applied field provenance requires a reviewer and decision time';
        END IF;
    END IF;
    IF OLD."status" = 'APPLIED' THEN
        IF NEW."status" NOT IN ('SUPERSEDED', 'REJECTED') OR NEW."decidedById" IS NULL OR NEW."decidedAt" IS NULL OR (NEW."decidedById" IS NOT DISTINCT FROM OLD."decidedById" AND NEW."decidedAt" IS NOT DISTINCT FROM OLD."decidedAt") THEN
            RAISE EXCEPTION 'Applied field provenance requires a reviewed supersession or rejection';
        END IF;
    END IF;
    RETURN NEW;
END;
$function$;

CREATE TRIGGER "entityFieldProvenance_applied_immutable"
BEFORE UPDATE OR DELETE ON "entityFieldProvenance"
FOR EACH ROW EXECUTE FUNCTION "protectAppliedEntityFieldProvenance"();

CREATE FUNCTION "protectAppliedEntityLinkProvenance"() RETURNS trigger LANGUAGE plpgsql AS $function$
BEGIN
    IF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION 'Link provenance evidence cannot be deleted';
    END IF;
    IF OLD."status" IN ('SUPERSEDED', 'REJECTED') THEN
        RAISE EXCEPTION 'Terminal link provenance is audit-stable';
    END IF;
    IF ROW(NEW."sourceType", NEW."sourceId", NEW."relationship", NEW."targetType", NEW."targetId", NEW."receiptId", NEW."confidence", NEW."method", NEW."observedAt", NEW."freshUntil") IS DISTINCT FROM ROW(OLD."sourceType", OLD."sourceId", OLD."relationship", OLD."targetType", OLD."targetId", OLD."receiptId", OLD."confidence", OLD."method", OLD."observedAt", OLD."freshUntil") THEN
        RAISE EXCEPTION 'Link provenance claim payload is immutable';
    END IF;
    IF OLD."status" = 'PROPOSED' AND NEW."status" = 'APPLIED' THEN
        IF NEW."decidedById" IS NULL OR NEW."decidedAt" IS NULL THEN
            RAISE EXCEPTION 'Applied link provenance requires a reviewer and decision time';
        END IF;
    END IF;
    IF OLD."status" = 'APPLIED' THEN
        IF NEW."status" NOT IN ('SUPERSEDED', 'REJECTED') OR NEW."decidedById" IS NULL OR NEW."decidedAt" IS NULL OR (NEW."decidedById" IS NOT DISTINCT FROM OLD."decidedById" AND NEW."decidedAt" IS NOT DISTINCT FROM OLD."decidedAt") THEN
            RAISE EXCEPTION 'Applied link provenance requires a reviewed supersession or rejection';
        END IF;
    END IF;
    RETURN NEW;
END;
$function$;

CREATE TRIGGER "entityLinkProvenance_applied_immutable"
BEFORE UPDATE OR DELETE ON "entityLinkProvenance"
FOR EACH ROW EXECUTE FUNCTION "protectAppliedEntityLinkProvenance"();

CREATE FUNCTION "protectInboundSourceReceipt"() RETURNS trigger LANGUAGE plpgsql AS $function$
BEGIN
    RAISE EXCEPTION 'Inbound source receipts are immutable';
END;
$function$;

CREATE TRIGGER "inboundSourceReceipt_immutable"
BEFORE UPDATE OR DELETE ON "inboundSourceReceipt"
FOR EACH ROW EXECUTE FUNCTION "protectInboundSourceReceipt"();
