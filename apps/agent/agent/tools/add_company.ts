import { defineTool } from "eve/tools";
import { z } from "zod";
import { createCompany } from "../lib/companies";

export default defineTool({
	description:
		"Add a company to the CRM with the source it came from. Use it for a sourcing target or any company a rep asks for that search_crm cannot find. A company that already exists, by domain or by name in the same country, is returned rather than duplicated. The source is written to the company's timeline, a company.created event fires, and the brand and profile enrichment queue up on their own. A LEI, a CIK, a ticker and a SIC code are kept as custom fields. Free.",
	inputSchema: z.object({
		name: z
			.string()
			.trim()
			.min(1)
			.max(200)
			.describe("The legal or trading name."),
		website: z
			.string()
			.trim()
			.optional()
			.describe("Their site or domain when you know it. 'siemens.com'."),
		countryCode: z
			.string()
			.trim()
			.length(2)
			.optional()
			.describe("ISO 3166-1 alpha-2 code. 'JP'."),
		country: z
			.string()
			.trim()
			.optional()
			.describe("Country name, for display."),
		city: z.string().trim().optional(),
		lei: z
			.string()
			.trim()
			.length(20)
			.optional()
			.describe("The Legal Entity Identifier, when it came from GLEIF."),
		cik: z
			.string()
			.trim()
			.regex(/^\d{1,10}$/)
			.optional()
			.describe(
				"The SEC Central Index Key, when it came from EDGAR. '320193'.",
			),
		ticker: z
			.string()
			.trim()
			.min(1)
			.max(6)
			.optional()
			.describe("The stock ticker of a listed company. 'AAPL'."),
		sic: z
			.string()
			.trim()
			.regex(/^\d{4}$/)
			.optional()
			.describe("The four-digit SIC code from the SEC profile. '3571'."),
		stateCode: z
			.string()
			.trim()
			.length(2)
			.optional()
			.describe("US state of the business address. 'CA'."),
		source: z
			.object({
				label: z
					.string()
					.trim()
					.min(1)
					.max(80)
					.describe("Where this came from. 'GLEIF register', 'their website'."),
				url: z
					.string()
					.trim()
					.url()
					.describe("The page a rep can open to check."),
			})
			.describe("Every record the agent creates names its source."),
	}),
	async execute(input) {
		return createCompany(input);
	},
});
