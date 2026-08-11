import { createHash } from "node:crypto";

export interface InboundSourceIdentity {
	connector: string;
	provider: string;
	accountId: string;
	sourceObjectType: string;
	sourceObjectId: string;
	sourceDigest: string;
}

export interface ContactCandidateIdentity {
	canonicalEmail?: string | null;
	canonicalName?: string | null;
	canonicalBusinessName?: string | null;
	canonicalDomain?: string | null;
}

export function canonicalizeInboundText(
	value: string | null | undefined,
): string {
	return value?.normalize("NFKC").trim().toLocaleLowerCase("en-US") ?? "";
}

function canonicalComponent(value: string): string {
	return `${Array.from(value).length}:${value}`;
}

function digest(parts: readonly string[]): string {
	const payload = parts.map((part) => `${part.length}:${part}`).join("|");
	return createHash("sha256").update(payload, "utf8").digest("hex");
}

const inboundDigestPattern = /^[0-9a-f]{64}$/;
const allowedMetadataKeys = new Set([
	"connector",
	"provider",
	"accountId",
	"sourceObjectType",
	"sourceObjectId",
	"sourceVersion",
	"sourceCreatedAt",
	"sourceUpdatedAt",
	"capturedAt",
	"cursor",
	"syncToken",
	"historyId",
	"etag",
	"page",
	"pageSize",
	"hasMore",
	"resourceType",
	"resourceId",
	"threadId",
	"messageId",
	"conversationId",
	"status",
	"httpStatus",
	"errorCode",
	"errorType",
	"retryAfter",
	"nextRetryAt",
	"attempt",
	"latencyMs",
	"startedAt",
	"completedAt",
	"version",
]);
const allowedMetadataStatuses = new Set([
	"ok",
	"success",
	"error",
	"pending",
	"retrying",
	"connected",
	"disconnected",
	"active",
	"paused",
	"failed",
]);
export const INBOUND_REDACTED_METADATA_MAX_BYTES = 16_384;

export function normalizeInboundSourceIdentity(
	identity: InboundSourceIdentity,
): InboundSourceIdentity {
	const normalizedIdentity = {
		connector: canonicalizeInboundText(identity.connector),
		provider: canonicalizeInboundText(identity.provider),
		accountId: identity.accountId.trim(),
		sourceObjectType: canonicalizeInboundText(identity.sourceObjectType),
		sourceObjectId: identity.sourceObjectId.trim(),
		sourceDigest: identity.sourceDigest.trim().toLowerCase(),
	};

	if (Object.values(normalizedIdentity).some((value) => value.length === 0)) {
		throw new Error("Inbound source identity fields are required");
	}
	if (!inboundDigestPattern.test(normalizedIdentity.sourceDigest)) {
		throw new Error(
			"Inbound source digest must be a lowercase SHA-256 hex digest",
		);
	}

	return normalizedIdentity;
}

export function inboundSourceReceiptVersionKey(
	identity: InboundSourceIdentity,
): string {
	const normalizedIdentity = normalizeInboundSourceIdentity(identity);
	return digest([
		normalizedIdentity.connector,
		normalizedIdentity.provider,
		normalizedIdentity.accountId,
		normalizedIdentity.sourceObjectType,
		normalizedIdentity.sourceObjectId,
		normalizedIdentity.sourceDigest,
	]);
}

export function inboundSourceIdentityKey(
	identity: InboundSourceIdentity,
): string {
	return inboundSourceReceiptVersionKey(identity);
}

export function contactCandidateIdentityKey(
	identity: ContactCandidateIdentity,
): string {
	const email = canonicalizeInboundText(identity.canonicalEmail);
	if (email) return digest(["email", email]);

	const name = canonicalizeInboundText(identity.canonicalName);
	const domain = canonicalizeInboundText(identity.canonicalDomain);
	if (name && domain) return digest(["person", name, domain]);

	const businessName = canonicalizeInboundText(identity.canonicalBusinessName);
	if (!businessName || !domain) {
		throw new Error(
			"A contact candidate requires a canonical email or canonical name and domain",
		);
	}

	return digest(["business", businessName, domain]);
}

export function previewInboundCanonicalIdentityKey(
	identity: ContactCandidateIdentity,
): string {
	const email = canonicalizeInboundText(identity.canonicalEmail);
	if (email) return `email|${canonicalComponent(email)}`;

	const name = canonicalizeInboundText(identity.canonicalName);
	const domain = canonicalizeInboundText(identity.canonicalDomain);
	if (name && domain) {
		return `person|${canonicalComponent(name)}|${canonicalComponent(domain)}`;
	}

	const businessName = canonicalizeInboundText(identity.canonicalBusinessName);
	if (!businessName || !domain) {
		throw new Error(
			"A contact candidate requires a canonical email or canonical name and domain",
		);
	}

	return `business|${canonicalComponent(businessName)}|${canonicalComponent(domain)}`;
}

export function previewInboundObservationIdentityKey(input: {
	candidateId: string;
	receiptId: string;
	sourceDigest: string;
	observedEmail?: string | null;
	observedName?: string | null;
	observedTitle?: string | null;
	observedCompany?: string | null;
	observedDomain?: string | null;
	observedRole?: string | null;
	evidenceClass: string;
}): string {
	return [
		"observation",
		input.candidateId,
		input.receiptId,
		input.sourceDigest,
		canonicalizeInboundText(input.observedEmail),
		canonicalizeInboundText(input.observedName),
		canonicalizeInboundText(input.observedTitle),
		canonicalizeInboundText(input.observedCompany),
		canonicalizeInboundText(input.observedDomain),
		canonicalizeInboundText(input.observedRole),
		canonicalizeInboundText(input.evidenceClass),
	]
		.map(canonicalComponent)
		.join("|");
}

export function contactCandidateObservationKey(input: {
	candidateIdentity: ContactCandidateIdentity;
	source: InboundSourceIdentity;
	observedEmail?: string | null;
	observedName?: string | null;
	observedTitle?: string | null;
	observedCompany?: string | null;
	observedDomain?: string | null;
	observedRole?: string | null;
	evidenceClass: string;
}): string {
	return digest([
		contactCandidateIdentityKey(input.candidateIdentity),
		inboundSourceIdentityKey(input.source),
		canonicalizeInboundText(input.observedEmail),
		canonicalizeInboundText(input.observedName),
		canonicalizeInboundText(input.observedTitle),
		canonicalizeInboundText(input.observedCompany),
		canonicalizeInboundText(input.observedDomain),
		canonicalizeInboundText(input.observedRole),
		canonicalizeInboundText(input.evidenceClass),
	]);
}

export function provenanceValueDigest(value: string): string {
	return digest([value]);
}

function metadataStringBytes(value: string): number {
	return new TextEncoder().encode(value).byteLength;
}

export function sanitizeInboundRedactedMetadata(
	value: unknown,
): Record<string, unknown> {
	if (typeof value !== "object" || value === null || Array.isArray(value)) {
		throw new Error("Inbound redacted metadata must be a JSON object");
	}
	const prototype = Object.getPrototypeOf(value);
	if (prototype !== Object.prototype && prototype !== null) {
		throw new Error("Inbound redacted metadata must be a plain JSON object");
	}
	for (const [key, child] of Object.entries(value)) {
		if (!allowedMetadataKeys.has(key)) {
			throw new Error(
				`Inbound metadata key is not an operational fact: $.${key}`,
			);
		}
		if (
			child !== null &&
			typeof child !== "string" &&
			typeof child !== "boolean" &&
			typeof child !== "number"
		) {
			throw new Error(`Inbound metadata value must be scalar: $.${key}`);
		}
		if (typeof child === "number" && !Number.isFinite(child)) {
			throw new Error(
				`Inbound metadata contains a non-finite number at $.${key}`,
			);
		}
		if (typeof child === "string" && metadataStringBytes(child) > 512) {
			throw new Error(
				`Inbound metadata string exceeds the size limit: $.${key}`,
			);
		}
		if (
			key === "status" &&
			(typeof child !== "string" || !allowedMetadataStatuses.has(child))
		) {
			throw new Error(`Inbound metadata status is not operational: $.${key}`);
		}
	}
	const serialized = JSON.stringify(value);
	if (serialized === undefined) {
		throw new Error("Inbound redacted metadata must be JSON serializable");
	}
	if (
		new TextEncoder().encode(serialized).byteLength >
		INBOUND_REDACTED_METADATA_MAX_BYTES
	) {
		throw new Error("Inbound redacted metadata exceeds the size limit");
	}
	return JSON.parse(serialized) as Record<string, unknown>;
}
