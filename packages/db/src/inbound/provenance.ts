import { createHash } from "node:crypto";

export interface InboundSourceIdentity {
	connector: string;
	provider: string;
	accountId: string;
	sourceObjectType: string;
	sourceObjectId: string;
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

export function normalizeInboundSourceIdentity(
	identity: InboundSourceIdentity,
): InboundSourceIdentity {
	const normalizedIdentity = {
		connector: normalized(identity.connector),
		provider: normalized(identity.provider),
		accountId: identity.accountId.trim(),
		sourceObjectType: normalized(identity.sourceObjectType),
		sourceObjectId: identity.sourceObjectId.trim(),
	};

	if (Object.values(normalizedIdentity).some((value) => value.length === 0)) {
		throw new Error("Inbound source identity fields are required");
	}

	return normalizedIdentity;
}

export function inboundSourceIdentityKey(
	identity: InboundSourceIdentity,
): string {
	const normalizedIdentity = normalizeInboundSourceIdentity(identity);
	return digest([
		normalizedIdentity.connector,
		normalizedIdentity.provider,
		normalizedIdentity.accountId,
		normalizedIdentity.sourceObjectType,
		normalizedIdentity.sourceObjectId,
	]);
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
