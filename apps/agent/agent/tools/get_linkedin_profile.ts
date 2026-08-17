import { defineTool } from "eve/tools";
import { z } from "zod";
import {
	CONTEXT_DEV_PEOPLE,
	CONTEXT_DEV_SOURCE,
	enabled,
	unavailable,
} from "../lib/capabilities";
import { spend } from "../lib/focus";
import {
	looksLikeSameCompany,
	nameMatchesLocalPart,
	normalise,
} from "../lib/names";
import { personByProfileUrl } from "../lib/people";
import { storePortrait } from "../lib/portrait";

export default defineTool({
	description:
		"Read a LinkedIn profile by slug and check whether it is really the person behind an email address. Returns the profile, their full work history, and an explicit verdict.",
	inputSchema: z.object({
		slug: z.string().describe("The linkedin.com/in/<slug> handle."),
		email: z.string().describe("The address we are trying to identify."),
		companyName: z.string(),
		companyDomain: z.string(),
		contactId: z
			.string()
			.optional()
			.describe(
				"The CRM contact this candidate is for. Supply it and their photo is copied automatically if — and only if — the profile turns out to be them.",
			),
	}),
	async execute({ slug, email, companyName, companyDomain, contactId }) {
		if (!(await enabled(CONTEXT_DEV_PEOPLE))) {
			return { found: false as const, ...unavailable(CONTEXT_DEV_SOURCE) };
		}

		const charge = spend(2);
		if (!charge.ok) return { found: false as const, reason: charge.reason };

		const result = await personByProfileUrl(
			`https://www.linkedin.com/in/${slug}`,
		);

		if (result.outcome !== "found") {
			return { found: false as const, reason: result.reason };
		}

		const person = result.person;
		const local = email.split("@")[0] ?? "";

		const employerMatches = person.currentRoles.some(
			(role) =>
				sameDomain(role.organisation.domain, companyDomain) ||
				looksLikeSameCompany(
					role.organisation.name ?? "",
					companyName,
					companyDomain,
				),
		);
		const nameMatches = nameMatchesLocalPart(person, local);
		const emailMatches = sameEmail(person.email, email);
		const isSamePerson = emailMatches || (employerMatches && nameMatches);

		const portrait =
			contactId && isSamePerson
				? await storePortrait({
						contactId,
						sourceUrl: person.photoUrl,
						verified: true,
					})
				: null;

		return {
			found: true as const,
			profile: person,
			sourceUrl: person.sourceUrl,
			photo: portrait ?? undefined,
			verdict: {
				emailMatches,
				employerMatches,
				nameMatches,
				isSamePerson,
				confidence:
					emailMatches || (employerMatches && nameMatches)
						? ("high" as const)
						: employerMatches || nameMatches
							? ("medium" as const)
							: ("low" as const),
			},
		};
	},
});

function sameEmail(left: string | null, right: string): boolean {
	if (!left) return false;
	return left.trim().toLowerCase() === right.trim().toLowerCase();
}

function sameDomain(left: string | null, right: string): boolean {
	if (!left) return false;
	const a = normalise(left);
	const b = normalise(right);
	return a !== "" && a === b;
}
