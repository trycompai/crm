import { defineTool } from "eve/tools";
import { z } from "zod";
import { unavailable } from "../lib/capabilities";
import { companyUrl, edgarEnabled, getCompany } from "../lib/edgar";
import { EDGAR } from "../lib/edgar-config";

export default defineTool({
	description:
		"Read a US public company's SEC profile by CIK or ticker: legal name, tickers and exchanges, SIC code and industry, state of incorporation, fiscal year end, filer category, business address, former names. Free, through the edgar service. The EDGAR page URL it returns is the source to cite when you add the company.",
	inputSchema: z
		.object({
			cik: z
				.string()
				.trim()
				.regex(/^\d{1,10}$/)
				.optional()
				.describe("'320193'."),
			ticker: z
				.string()
				.trim()
				.min(1)
				.max(6)
				.optional()
				.describe("'AAPL'. Used when no CIK is given."),
		})
		.refine((input) => input.cik || input.ticker, {
			message: "Give a CIK or a ticker.",
		}),
	async execute(input) {
		if (!edgarEnabled()) return unavailable(EDGAR.env.url);

		const result = await getCompany(input);
		if (!result.ok) return { found: false, reason: result.reason };

		return {
			found: true,
			company: result.data,
			sourceUrl: companyUrl(result.data.cik),
		};
	},
});
