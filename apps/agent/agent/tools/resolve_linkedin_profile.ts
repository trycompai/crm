import { defineTool } from "eve/tools";
import { z } from "zod";
import {
	CONTEXT_DEV_PEOPLE,
	CONTEXT_DEV_SOURCE,
	enabled,
	unavailable,
} from "../lib/capabilities";
import { CONTEXT } from "../lib/context-config";
import { spend } from "../lib/focus";
import { verdictFor } from "../lib/identity";
import { personByClues } from "../lib/people";

export default defineTool({
	description:
		"Find the person behind a work email address when the CRM holds no LinkedIn URL for them. Sends the name and employer as clues, then returns the profile it resolved with a verdict on whether it is really them. Use get_linkedin_profile instead when the record already carries a LinkedIn URL.",
	inputSchema: z.object({
		email: z.string().describe("The contact's work email address."),
		companyName: z.string().describe("The company the CRM has them at."),
		companyDomain: z
			.string()
			.describe("The company's own domain, for checking the employer."),
		firstName: z
			.string()
			.optional()
			.describe("The first name, if the CRM holds one."),
		lastName: z
			.string()
			.optional()
			.describe("The last name, if the CRM holds one."),
	}),
	async execute({ email, companyName, companyDomain, firstName, lastName }) {
		if (!(await enabled(CONTEXT_DEV_PEOPLE))) {
			return { found: false as const, ...unavailable(CONTEXT_DEV_SOURCE) };
		}

		const charge = spend(CONTEXT.people.enrichCost);
		if (!charge.ok) return { found: false as const, reason: charge.reason };

		const result = await personByClues({
			email,
			firstName: firstName ?? null,
			lastName: lastName ?? null,
			companyName,
			companyDomain,
		});

		if (result.outcome !== "found") {
			return { found: false as const, reason: result.reason };
		}

		const person = result.person;
		if (!person.profileUrl) {
			return {
				found: false as const,
				reason:
					"Somebody matched, but no LinkedIn profile came back with them. There is nothing to cite.",
			};
		}

		return {
			found: true as const,
			profile: person,
			sourceUrl: person.profileUrl,
			verdict: verdictFor(person, { email, companyName, companyDomain }),
			note: "One candidate, not proof. Read the verdict before you write anything.",
		};
	},
});
