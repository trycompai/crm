import { defineTool } from "eve/tools";
import { z } from "zod";
import { unavailable } from "../lib/capabilities";
import { edgarEnabled, listFilings } from "../lib/edgar";
import { EDGAR } from "../lib/edgar-config";

const day = z
	.string()
	.trim()
	.regex(/^\d{4}-\d{2}-\d{2}$/);

export default defineTool({
	description:
		"List a US public company's SEC filings, newest first, with an optional form type and date range. Each filing has its accession number, form, filing date, report date, description and EDGAR URL. Free, through the edgar service. Form types worth knowing: 10-K annual report, 10-Q quarterly, 8-K current event, DEF 14A proxy statement, SC 13D and SCHEDULE 13G shareholder disclosures, 4 insider transaction.",
	inputSchema: z.object({
		cik: z
			.string()
			.trim()
			.regex(/^\d{1,10}$/)
			.describe("'320193'."),
		form: z
			.string()
			.trim()
			.min(1)
			.optional()
			.describe("One form type. '10-K', '8-K', 'DEF 14A'."),
		from: day.optional().describe("Earliest filing date. '2024-01-01'."),
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

		const result = await listFilings(input);
		if (!result.ok) return { found: 0, filings: [], reason: result.reason };

		return {
			found: result.data.filings.length,
			filings: result.data.filings,
			note: result.data.truncated
				? `Showing the newest ${result.data.filings.length}. Narrow the form or the dates for older ones.`
				: undefined,
		};
	},
});
