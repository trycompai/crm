import { defineTool } from "eve/tools";
import { z } from "zod";
import { enabled, unavailable } from "../lib/capabilities";
import { spend } from "../lib/focus";
import {
	identityChecks,
	identityEvidence,
	identityNextStep,
} from "../lib/identity-verdict";
import { getExperience, getProfile } from "../lib/linkdapi";
import { storePortrait } from "../lib/portrait";

export default defineTool({
	description:
		"Read a LinkedIn profile by slug (LinkDAPI enricher) and check whether it is really the person behind an email address. Returns the profile, a code verdict, and priced evidence. Do not invent evidence kinds — use the evidence array as returned.",
	inputSchema: z.object({
		slug: z.string().describe("The linkedin.com/in/<slug> handle."),
		email: z.string().describe("The address we are trying to identify."),
		companyName: z.string(),
		companyDomain: z.string(),
		includeHistory: z
			.boolean()
			.default(false)
			.describe("Also fetch full work history — costs an extra call."),
		contactId: z
			.string()
			.optional()
			.describe(
				"The CRM contact this candidate is for. Supply it and their photo is copied automatically if — and only if — the profile turns out to be them.",
			),
	}),
	async execute({
		slug,
		email,
		companyName,
		companyDomain,
		includeHistory,
		contactId,
	}) {
		if (!(await enabled("RAPIDAPI_KEY"))) {
			return { found: false as const, ...unavailable("RAPIDAPI_KEY") };
		}

		const charge = spend(includeHistory ? 2 : 1);
		if (!charge.ok) return { found: false as const, reason: charge.reason };

		const result = await getProfile(slug);
		if (!result.ok) {
			return result.missing
				? { found: false as const, reason: "No such profile." }
				: { found: false as const, reason: result.reason };
		}

		const profile = result.data;
		const verdict = identityChecks(profile, email, companyName, companyDomain);
		const evidence = identityEvidence(profile, verdict, email, companyName);

		const history =
			includeHistory && profile.urn ? await getExperience(profile.urn) : null;

		const portrait =
			contactId && verdict.isSamePerson
				? await storePortrait({
						contactId,
						sourceUrl: profile.photoUrl,
						verified: true,
					})
				: null;

		return {
			found: true as const,
			profile,
			experience: history?.ok ? history.data : null,
			photo: portrait ?? undefined,
			verdict,
			evidence,
			next: identityNextStep(verdict),
		};
	},
});
