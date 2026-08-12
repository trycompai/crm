import { defineTool } from "eve/tools";
import { z } from "zod";
import { CONTEXT_DEV, enabled, unavailable } from "../lib/capabilities";
import { spend } from "../lib/focus";
import { findLinkedInCandidates } from "../lib/linkedin-candidates";

export default defineTool({
	description:
		"Find candidate LinkedIn profile slugs for a work email via Context web search (site:linkedin.com/in). Returns CANDIDATES ONLY — never a match. Verify each with get_linkedin_profile. LinkDAPI is not used here; it enriches a known slug only.",
	inputSchema: z.object({
		email: z.string().describe("The contact's work email address."),
		companyName: z.string().describe("The company the CRM has them at."),
	}),
	async execute({ email, companyName }) {
		if (!(await enabled(CONTEXT_DEV))) {
			return { candidateSlugs: [], ...unavailable(CONTEXT_DEV) };
		}

		const charge = spend();
		if (!charge.ok) return { candidateSlugs: [], note: charge.reason };

		const found = await findLinkedInCandidates(email, companyName);

		return {
			searchedFor: found.searchedFor,
			candidateSlugs: found.candidateSlugs,
			note: found.note,
		};
	},
});
