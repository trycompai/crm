import { defineTool } from "eve/tools";
import { z } from "zod";
import { runBrand } from "../lib/brand";
import { spend } from "../lib/focus";
import { assertResearchPurpose } from "../lib/session-purpose";

export default defineTool({
	description:
		"Look up a company's brand, industry, location and social links by domain, and fill in the blanks on its record. Fills empty fields only — never overwrites what a person typed.",
	inputSchema: z.object({
		companyId: z.string(),
		fresh: z
			.boolean()
			.default(false)
			.describe(
				"Bypass the vendor's ~90-day cache. Only when a rep has asked for a fresh look.",
			),
	}),
	async execute({ companyId, fresh }, ctx) {
		assertResearchPurpose(ctx);
		const result = await runBrand({ companyId, fresh, spend });

		if (!result.enriched) {
			return {
				enriched: false as const,
				reason: result.reason,
				...(result.retryable === undefined
					? {}
					: { retryable: result.retryable }),
			};
		}

		const filled = result.filled ?? [];

		return {
			enriched: true as const,
			filled,
			mirrored: result.mirrored ?? [],
			note:
				filled.length === 0
					? "Everything it returned was already on the record."
					: undefined,
		};
	},
});
