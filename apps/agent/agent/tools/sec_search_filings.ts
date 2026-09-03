import { defineTool } from "eve/tools";
import { z } from "zod";
import { unavailable } from "../lib/capabilities";
import { edgarEnabled, searchFilings } from "../lib/edgar";
import { EDGAR } from "../lib/edgar-config";

const day = z
	.string()
	.trim()
	.regex(/^\d{4}-\d{2}-\d{2}$/);

export default defineTool({
	description:
		"Full-text search across SEC filings of every company, with an optional form type and date range. Each hit names the filing company with its CIK. Free, through the edgar service. Use it to find which companies mention a product, a customer, a competitor or an event, or to find every DEF 14A in a period.",
	inputSchema: z.object({
		query: z
			.string()
			.trim()
			.min(2)
			.describe(
				"Words or a quoted phrase. '\"data center\" cooling', 'Ozempic supply'.",
			),
		form: z
			.string()
			.trim()
			.min(1)
			.optional()
			.describe("One form type. '10-K', '8-K', 'DEF 14A'."),
		from: day.optional().describe("Earliest filing date. '2025-01-01'."),
		to: day.optional().describe("Latest filing date. '2025-12-31'."),
		limit: z
			.number()
			.int()
			.min(1)
			.max(EDGAR.filings.maxLimit)
			.default(EDGAR.filings.defaultLimit),
	}),
	async execute(input) {
		if (!edgarEnabled()) return unavailable(EDGAR.env.url);

		const result = await searchFilings(input);
		if (!result.ok) return { found: 0, filings: [], reason: result.reason };

		return {
			found: result.data.total,
			filings: result.data.filings,
			note:
				result.data.total > result.data.filings.length
					? `Showing ${result.data.filings.length} of ${result.data.total}. Add a form type or narrow the dates.`
					: undefined,
		};
	},
});
