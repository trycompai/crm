import { defineTool } from "eve/tools";
import { z } from "zod";
import { ENTITY_CATEGORIES, searchEntities } from "../lib/gleif";
import { GLEIF } from "../lib/gleif-config";

export default defineTool({
	description:
		"Find legal entities in the public GLEIF register by name, optionally within one country. Returns each match with its LEI, legal name, country, city and status. Free, no key. Use it to identify a group parent before listing its subsidiaries with gleif_list_subsidiaries, or to check a company's legal identity.",
	inputSchema: z.object({
		name: z
			.string()
			.trim()
			.min(2)
			.describe("Part of the legal name. 'Renault', 'Siemens Energy'."),
		country: z
			.string()
			.trim()
			.length(2)
			.optional()
			.describe("ISO 3166-1 alpha-2 code of the legal address. 'FR', 'US'."),
		category: z
			.enum([...ENTITY_CATEGORIES, "ANY"])
			.default("GENERAL")
			.describe(
				"GLEIF entity category. GENERAL is an operating company or holding; FUND, BRANCH and the others are rarely M&A targets. ANY removes the filter.",
			),
		activeOnly: z
			.boolean()
			.default(true)
			.describe("Only entities whose GLEIF status is ACTIVE."),
		limit: z
			.number()
			.int()
			.min(1)
			.max(GLEIF.search.maxLimit)
			.default(GLEIF.search.defaultLimit),
	}),
	async execute(input) {
		const result = await searchEntities(input);

		if (!result.ok) return { found: 0, entities: [], reason: result.reason };

		return {
			found: result.data.total,
			entities: result.data.entities,
			note:
				result.data.total === 0
					? "Nothing in GLEIF matches. Only entities that hold an LEI are listed; try a shorter name or drop the country."
					: result.data.total > result.data.entities.length
						? `Showing ${result.data.entities.length} of ${result.data.total}. Narrow the name or add a country.`
						: undefined,
		};
	},
});
