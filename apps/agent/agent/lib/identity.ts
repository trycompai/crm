import {
	looksLikeSameCompany,
	nameMatchesLocalPart,
	sameDomain,
} from "./names";
import type { Person } from "./people";

export type IdentityClaim = {
	email: string;
	companyName: string;
	companyDomain: string;
};

export type IdentityVerdict = {
	emailMatches: boolean;
	employerMatches: boolean;
	nameMatches: boolean;
	isSamePerson: boolean;
	confidence: "high" | "medium" | "low";
};

export function verdictFor(
	person: Person,
	claim: IdentityClaim,
): IdentityVerdict {
	const local = claim.email.split("@")[0] ?? "";

	const emailMatches = sameEmail(person.email, claim.email);
	const employerMatches = person.currentRoles.some(
		(role) =>
			sameDomain(role.organisation.domain, claim.companyDomain) ||
			looksLikeSameCompany(
				role.organisation.name ?? "",
				claim.companyName,
				claim.companyDomain,
			),
	);
	const nameMatches = nameMatchesLocalPart(person, local);
	const isSamePerson = emailMatches || (employerMatches && nameMatches);

	return {
		emailMatches,
		employerMatches,
		nameMatches,
		isSamePerson,
		confidence: isSamePerson
			? "high"
			: employerMatches || nameMatches
				? "medium"
				: "low",
	};
}

function sameEmail(left: string | null, right: string): boolean {
	if (!left) return false;

	return left.trim().toLowerCase() === right.trim().toLowerCase();
}
