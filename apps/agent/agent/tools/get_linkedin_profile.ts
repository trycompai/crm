import { defineTool } from "eve/tools";
import { z } from "zod";
import {
	CONTEXT_DEV_PEOPLE,
	CONTEXT_DEV_SOURCE,
	enabled,
	unavailable,
} from "../lib/capabilities";
import { spend } from "../lib/focus";
import { verdictFor } from "../lib/identity";
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

		const requestedUrl = `https://www.linkedin.com/in/${slug}`;
		const result = await personByProfileUrl(requestedUrl);

		if (result.outcome !== "found") {
			return { found: false as const, reason: result.reason };
		}

		const person = result.person;
		const verdict = verdictFor(person, { email, companyName, companyDomain });

		const portrait =
			contactId && verdict.isSamePerson
				? await storePortrait({
						contactId,
						sourceUrl: person.photoUrl,
						verified: true,
					})
				: null;

		return {
			found: true as const,
			profile: person,
			sourceUrl: person.profileUrl ?? requestedUrl,
			photo: portrait ?? undefined,
			verdict,
		};
	},
});
