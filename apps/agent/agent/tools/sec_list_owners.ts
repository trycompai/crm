import { defineTool } from "eve/tools";
import { z } from "zod";
import { unavailable } from "../lib/capabilities";
import { edgarEnabled, listOwners } from "../lib/edgar";
import { EDGAR } from "../lib/edgar-config";

export default defineTool({
	description:
		"List a US public company's beneficial owners of 5% or more from their Schedule 13D and 13G filings: the filer, the form, the filing date, shares held, percent of class, voting power and, on a 13D, the stated purpose. 13D is an active holder with intent to influence; 13G is a passive holder. Free, through the edgar service. Each row carries the filing URL to cite.",
	inputSchema: z.object({
		cik: z
			.string()
			.trim()
			.regex(/^\d{1,10}$/)
			.describe("'320193'."),
		minPercent: z
			.number()
			.min(0)
			.max(100)
			.default(EDGAR.owners.minPercent)
			.describe("Lowest percent of class to keep."),
		form: z
			.enum(["13D", "13G", "all"])
			.default("all")
			.describe("13D for activists, 13G for passive holders, all for both."),
		limit: z
			.number()
			.int()
			.min(1)
			.max(EDGAR.owners.maxLimit)
			.default(EDGAR.owners.defaultLimit),
	}),
	async execute(input) {
		if (!edgarEnabled()) return unavailable(EDGAR.env.url);

		const result = await listOwners(input);
		if (!result.ok) return { found: 0, owners: [], reason: result.reason };

		return {
			found: result.data.owners.length,
			owners: result.data.owners,
			filingsRead: result.data.filingsRead,
			note:
				result.data.owners.length === 0
					? "No 13D or 13G above the threshold in the filings read. Holders below 5% never file one."
					: "Holdings are as of each filing date; a holder who sold since may not have filed yet.",
		};
	},
});
