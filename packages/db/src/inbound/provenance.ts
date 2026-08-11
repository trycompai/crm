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

function normalized(value: string | null | undefined): string {
	return value?.normalize("NFKC").trim().toLocaleLowerCase("en-US") ?? "";
}

function digest(parts: readonly string[]): string {
	const payload = parts.map((part) => `${part.length}:${part}`).join("|");
	return createHash("sha256").update(payload, "utf8").digest("hex");
}

const inboundDigestPattern = /^[0-9a-f]{64}$/;
const forbiddenMetadataKeys = new Set([
	"body",
	"text",
	"content",
	"html",
	"raw",
	"token",
	"secret",
	"password",
	"authorization",
	"cookie",
]);
export const INBOUND_REDACTED_METADATA_MAX_BYTES = 16_384;

export function normalizeInboundSourceIdentity(
	identity: InboundSourceIdentity,
): InboundSourceIdentity {
	const normalizedIdentity = {
		connector: normalized(identity.connector),
		provider: normalized(identity.provider),
		accountId: identity.accountId.trim(),
		sourceObjectType: normalized(identity.sourceObjectType),
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
	const email = normalized(identity.canonicalEmail);
	if (email) return digest(["email", email]);

	const name = normalized(identity.canonicalName);
	const domain = normalized(identity.canonicalDomain);
	if (name && domain) return digest(["person", name, domain]);

	const businessName = normalized(identity.canonicalBusinessName);
	if (!businessName || !domain) {
		throw new Error(
			"A contact candidate requires a canonical email or canonical name and domain",
		);
	}

	return digest(["business", businessName, domain]);
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
		normalized(input.observedEmail),
		normalized(input.observedName),
		normalized(input.observedTitle),
		normalized(input.observedCompany),
		normalized(input.observedDomain),
		normalized(input.observedRole),
		normalized(input.evidenceClass),
	]);
}

export function provenanceValueDigest(value: string): string {
	return digest([value]);
}

function validateMetadataNode(value: unknown, path: string): void {
	if (
		value === null ||
		typeof value === "string" ||
		typeof value === "boolean"
	) {
		return;
	}
	if (typeof value === "number") {
		if (Number.isFinite(value)) return;
		throw new Error(`Inbound metadata contains a non-finite number at ${path}`);
	}
	if (Array.isArray(value)) {
		for (const [index, item] of value.entries()) {
			validateMetadataNode(item, `${path}[${index}]`);
		}
		return;
	}
	if (typeof value !== "object" || value === null) {
		throw new Error(`Inbound metadata contains a non-JSON value at ${path}`);
	}
	const prototype = Object.getPrototypeOf(value);
	if (prototype !== Object.prototype && prototype !== null) {
		throw new Error(`Inbound metadata contains a non-plain object at ${path}`);
	}
	for (const [key, child] of Object.entries(value)) {
		if (forbiddenMetadataKeys.has(key.toLowerCase())) {
			throw new Error(`Inbound metadata key is not permitted: ${path}.${key}`);
		}
		validateMetadataNode(child, `${path}.${key}`);
	}
}

export function sanitizeInboundRedactedMetadata(
	value: unknown,
): Record<string, unknown> {
	if (typeof value !== "object" || value === null || Array.isArray(value)) {
		throw new Error("Inbound redacted metadata must be a JSON object");
	}
	validateMetadataNode(value, "$");
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
