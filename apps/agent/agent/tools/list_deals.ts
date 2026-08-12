import { defineTool } from "eve/tools";
import { z } from "zod";
import { listDeals } from "../lib/lookup";

export default defineTool({
	description:
		"List deals across the CRM with pipeline status and inactivity filters. Use this for broad requests such as all open deals, stale deals, deals untouched for a number of days, or a pipeline sweep. Results are oldest-touch first and paginated; continue with nextCursor while hasMore is true. Free.",
	inputSchema: z.object({
		status: z.enum(["open", "won", "lost", "all"]).default("open"),
		inactiveForDays: z
			.number()
			.int()
			.min(0)
			.max(3650)
			.optional()
			.describe(
				"Return deals whose last activity was at least this many days ago. Deals with no activity qualify once they are this old.",
			),
		companyId: z.string().optional(),
		ownerId: z.string().optional(),
		limit: z.number().int().min(1).max(100).default(50),
		cursor: z.string().optional(),
	}),
	async execute(input) {
		return listDeals(input);
	},
	toModelOutput(output) {
		return {
			type: "json",
			value: {
				...output,
				deals: output.deals.map((deal) => ({
					...deal,
					company: { id: deal.company.id, name: deal.company.name },
					owner: deal.owner
						? {
								id: deal.owner.id,
								name: deal.owner.name,
								email: deal.owner.email,
							}
						: null,
				})),
			},
		};
	},
});
