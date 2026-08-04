import { defineTool } from "eve/tools";
import { z } from "zod";
import { enabled, unavailable } from "../lib/capabilities";
import { contactProfileSlug } from "../lib/crm";
import { getExperience, getProfile } from "../lib/linkdapi";

export default defineTool({
	description:
		"Read the LinkedIn profile already on a CRM contact — headline, current roles and full work history. For writing a summary of somebody already identified. Cannot be used to identify anyone: use resolve_linkedin_profile and get_linkedin_profile for that.",
	inputSchema: z.object({
		contactId: z.string(),
	}),
	async execute({ contactId }) {
		if (!(await enabled("RAPIDAPI_KEY"))) {
			return { found: false as const, ...unavailable("RAPIDAPI_KEY") };
		}

		const profileRef = await contactProfileSlug(contactId);
		if (!profileRef) {
			return {
				found: false as const,
				reason: "This contact has no LinkedIn URL on file.",
			};
		}

		const result = await getProfile(profileRef.slug);
		if (!result.ok) {
			return {
				found: false as const,
				reason: result.missing ? "No such profile." : result.reason,
			};
		}

		const profile = result.data;
		const history = profile.urn ? await getExperience(profile.urn) : null;

		return {
			found: true as const,
			profile,
			experience: history?.ok ? history.data : null,
			sourceUrl: profileRef.profileUrl,
			note: "Everything here is self-reported by the person. Write only what it says.",
		};
	},
});
