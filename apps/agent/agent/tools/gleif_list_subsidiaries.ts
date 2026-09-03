import { defineTool } from "eve/tools";
import { z } from "zod";
import { directChildren, resolveCountries } from "../lib/gleif";

export default defineTool({
	description:
		"List the direct subsidiaries a legal entity consolidates, from the public GLEIF relationship register, optionally keeping only those in given countries or regions. Returns each subsidiary with its LEI, legal name, country and city. Free, no key. This is the M&A sourcing step: a parent in one country with subsidiaries in another is a cross-border target.",
	inputSchema: z.object({
		lei: z
			.string()
			.trim()
			.length(20)
			.describe("The parent's LEI, from gleif_search_entities."),
		childCountries: z
			.string()
			.trim()
			.optional()
			.describe(
				"Keep subsidiaries in these places only. A region name ('UE', 'ASIE') or ISO codes separated by commas ('US,CA'). Empty keeps all.",
			),
	}),
	async execute({ lei, childCountries }) {
		const countries = resolveCountries(childCountries);
		const result = await directChildren(lei, { countries });

		if (!result.ok) {
			return {
				parent: lei,
				subsidiaries: [],
				matched: 0,
				reason: result.reason,
			};
		}

		return {
			parent: result.data.parent,
			countries,
			totalDirectChildren: result.data.total,
			matched: result.data.children.length,
			subsidiaries: result.data.children,
			note: result.data.truncated
				? "The parent has more direct subsidiaries than were read. The counts are a floor."
				: result.data.total === 0
					? "GLEIF records no direct subsidiary for this entity. Relationships are self-reported, so a group can exist without any."
					: undefined,
		};
	},
});
