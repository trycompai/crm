import { FactBand } from "@crm/db";
import {
	type Evidence,
	type EvidenceKind,
	scoreEvidence,
} from "./evidence";
import { isDerivedName } from "./names";

export const IDENTITY_PROOF_KINDS = [
	"profile.email-match",
	"linkedin.employer-and-name",
	"crm.thread-reply",
	"crm.signature-block",
	"github.account-identity",
] as const satisfies readonly EvidenceKind[];

const identityKinds = new Set<string>(IDENTITY_PROOF_KINDS);

export type ContactIdentitySnapshot = {
	email: string | null;
	firstName: string;
	lastName: string | null;
	linkedinUrl: string | null;
	hasAppliedName: boolean;
};

export function evidenceProvesIdentity(evidence: Evidence[]): boolean {
	return evidence.some((item) => identityKinds.has(item.kind));
}

export function contactIdentityIsTrustworthy(
	contact: ContactIdentitySnapshot,
): boolean {
	if (contact.linkedinUrl) return true;
	if (contact.hasAppliedName) return true;
	if (
		contact.lastName &&
		!isDerivedName(contact.email, contact.firstName, contact.lastName)
	) {
		return true;
	}
	return false;
}

export function refuseBriefReason(input: {
	contact: ContactIdentitySnapshot;
	evidence: Evidence[];
}): string | null {
	const identityOk =
		contactIdentityIsTrustworthy(input.contact) ||
		evidenceProvesIdentity(input.evidence);

	if (!identityOk) {
		return "Identity is not trustworthy yet. Identify them first, then write the brief.";
	}

	const scored = scoreEvidence(input.evidence);

	if (
		scored.band === null ||
		scored.band === FactBand.POSSIBLE
	) {
		return "Nothing here is sourced well enough to put on the record.";
	}

	return null;
}
