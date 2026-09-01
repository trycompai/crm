import { defineTool } from "eve/tools";
import { z } from "zod";
import { unavailable } from "../lib/capabilities";
import { HUBSPOT_CAPABILITY, HUBSPOT_READS } from "../lib/hubspot-config";
import { hubspotConnected } from "../lib/hubspot-connection";
import { listHubspotDeals } from "../lib/hubspot-deals";

export default defineTool({
	description:
		"List deals from the connected HubSpot account by outcome. HubSpot itself decides the outcome: won and lost come from the deal's own closed-won and closed-lost flags, not from the stage name, so a custom pipeline reads correctly. Returns the stage label, amount, close date and the reason a rep typed when they closed it. Results are newest-modified first and paginated; continue with nextCursor while hasMore is true. Free.",
	inputSchema: z.object({
		status: z
			.enum(["open", "won", "lost", "all"])
			.default("all")
			.describe("Filter by what HubSpot records as the deal's outcome."),
		pipelineId: z
			.string()
			.optional()
			.describe(
				"Restrict to one HubSpot pipeline. Omit to read every pipeline in the account.",
			),
		modifiedSince: z
			.string()
			.optional()
			.describe(
				"ISO 8601 timestamp. Return only deals changed at or after this moment.",
			),
		limit: z
			.number()
			.int()
			.min(1)
			.max(HUBSPOT_READS.deals.maxPageSize)
			.default(HUBSPOT_READS.deals.pageSize),
		cursor: z.string().optional(),
	}),
	async execute(input) {
		if (!(await hubspotConnected())) {
			return unavailable(HUBSPOT_CAPABILITY);
		}

		const page = await listHubspotDeals(input);
		if (!page.ok) {
			return { ok: false as const, configured: true, reason: page.reason };
		}

		return { ok: true as const, ...page.body };
	},
});
