import { defineTool } from "eve/tools";
import { z } from "zod";
import { createContact } from "../lib/contacts";

export default defineTool({
	description:
		"Add a person to the CRM as a contact of an existing company, with the source that named them. Returns the existing contact when the email or the name already exists on that company, so nothing is duplicated. The people pipeline then identifies and researches them on its own. Use it for an executive or a director named in a public document; use record_fact afterwards for each fact with its evidence.",
	inputSchema: z.object({
		firstName: z.string().trim().min(1).describe("'Tim'."),
		lastName: z.string().trim().min(1).optional().describe("'Cook'."),
		title: z
			.string()
			.trim()
			.min(1)
			.optional()
			.describe(
				"Their title as the source states it. 'Chief Executive Officer'.",
			),
		email: z.string().trim().email().optional(),
		companyId: z
			.string()
			.trim()
			.min(1)
			.describe("The CRM id of their company."),
		source: z
			.object({
				label: z.string().trim().min(1).describe("'SEC DEF 14A'."),
				url: z.string().trim().url().describe("The document that names them."),
			})
			.describe("Every record the agent creates names its source."),
	}),
	async execute(input) {
		return createContact(input);
	},
});
