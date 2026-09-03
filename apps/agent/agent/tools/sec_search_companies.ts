import { defineTool } from "eve/tools";
import { z } from "zod";
import { unavailable } from "../lib/capabilities";
import { edgarEnabled, searchCompanies } from "../lib/edgar";
import { EDGAR } from "../lib/edgar-config";

export default defineTool({
	description:
		"Find US public companies in SEC EDGAR by name, ticker or CIK. Returns each match with its CIK, name, ticker and exchange. Free, through the edgar service. Use it to identify a company before sec_get_company, sec_list_filings, sec_list_owners or sec_get_proxy.",
	inputSchema: z.object({
		query: z
			.string()
			.trim()
			.min(1)
			.describe(
				"A company name, a ticker or a CIK. 'Apple', 'AAPL', '320193'.",
			),
		limit: z
			.number()
			.int()
			.min(1)
			.max(EDGAR.search.maxLimit)
			.default(EDGAR.search.defaultLimit),
	}),
	async execute(input) {
		if (!edgarEnabled()) return unavailable(EDGAR.env.url);

		const result = await searchCompanies(input);
		if (!result.ok) return { found: 0, companies: [], reason: result.reason };

		return {
			found: result.data.companies.length,
			companies: result.data.companies,
			note:
				result.data.companies.length === 0
					? "Nothing in EDGAR matches. Only companies that file with the SEC are listed; try the ticker or a shorter name."
					: undefined,
		};
	},
});
