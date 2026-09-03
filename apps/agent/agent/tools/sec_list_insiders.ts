import { defineTool } from "eve/tools";
import { z } from "zod";
import { unavailable } from "../lib/capabilities";
import { edgarEnabled, listInsiders } from "../lib/edgar";
import { EDGAR } from "../lib/edgar-config";

export default defineTool({
	description:
		"List a US public company's recent insider transactions from Forms 3, 4 and 5: the insider, their title, the form, the filing date, the transaction kind, shares and price. Officers and directors are named here with their titles, which makes it a source for who runs the company. Free, through the edgar service. Each row carries the filing URL to cite.",
	inputSchema: z.object({
		cik: z
			.string()
			.trim()
			.regex(/^\d{1,10}$/)
			.describe("'320193'."),
		limit: z
			.number()
			.int()
			.min(1)
			.max(EDGAR.insiders.maxLimit)
			.default(EDGAR.insiders.defaultLimit),
	}),
	async execute(input) {
		if (!edgarEnabled()) return unavailable(EDGAR.env.url);

		const result = await listInsiders(input);
		if (!result.ok)
			return { found: 0, transactions: [], reason: result.reason };

		return {
			found: result.data.transactions.length,
			transactions: result.data.transactions,
			note:
				result.data.transactions.length === 0
					? "No insider filing in the period read."
					: undefined,
		};
	},
});
