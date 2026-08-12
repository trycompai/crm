import type { Evidence } from "./evidence";
import type { Profile } from "./linkdapi";
import { looksLikeSameCompany, nameMatchesLocalPart } from "./names";

export type IdentityChecks = {
	employerMatches: boolean;
	nameMatches: boolean;
	isSamePerson: boolean;
};

export function identityChecks(
	profile: Pick<Profile, "firstName" | "lastName" | "positions">,
	email: string,
	companyName: string,
	companyDomain: string,
): IdentityChecks {
	const local = email.split("@")[0] ?? "";
	const employerMatches = profile.positions.some((position) =>
		looksLikeSameCompany(position.name, companyName, companyDomain),
	);
	const nameMatches = nameMatchesLocalPart(profile, local);

	return {
		employerMatches,
		nameMatches,
		isSamePerson: employerMatches && nameMatches,
	};
}

export function identityEvidence(
	profile: Pick<
		Profile,
		"firstName" | "lastName" | "fullName" | "profileUrl" | "positions"
	>,
	checks: IdentityChecks,
	email: string,
	companyName: string,
): Evidence[] {
	const joined = [profile.firstName, profile.lastName]
		.filter(Boolean)
		.join(" ");
	const name = profile.fullName ?? (joined || "unnamed profile");
	const employers = profile.positions.map((p) => p.name).filter(Boolean);
	const employerList =
		employers.length > 0 ? employers.join(", ") : "no current employer listed";

	if (checks.isSamePerson) {
		return [
			{
				kind: "linkedin.employer-and-name",
				detail: `${name} at ${employerList}; name is consistent with ${email}`,
				sourceUrl: profile.profileUrl,
			},
		];
	}

	if (checks.employerMatches) {
		return [
			{
				kind: "employer-only",
				detail: `${name} lists ${companyName}, but the name is not consistent with ${email}`,
				sourceUrl: profile.profileUrl,
			},
		];
	}

	return [];
}

export function identityNextStep(checks: IdentityChecks): string {
	if (checks.isSamePerson) {
		return "Same person. Call identify_contact with the evidence array from this result.";
	}

	return "Not them. Stop. A miss stays a miss — do not call identify_contact for this slug.";
}
