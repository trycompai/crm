import { defineTool } from "eve/tools";
import { z } from "zod";
import { unavailable } from "../lib/capabilities";
import { compareCompensation, edgarEnabled } from "../lib/edgar";
import { EDGAR } from "../lib/edgar-config";

export default defineTool({
	description:
		"Compare CEO pay across several US public companies from their latest proxy statements: one row per company and fiscal year with the CEO's name, total pay, pay actually paid, total shareholder return and net income. Free, through the edgar service. A company with no readable proxy comes back with a reason instead of numbers.",
	inputSchema: z.object({
		tickers: z
			.array(z.string().trim().min(1).max(6))
			.min(1)
			.max(EDGAR.compensation.maxTickers)
			.describe("['AAPL', 'MSFT', 'NVDA']."),
		years: z
			.number()
			.int()
			.min(1)
			.max(EDGAR.compensation.maxYears)
			.default(EDGAR.compensation.years),
	}),
	async execute(input) {
		if (!edgarEnabled()) return unavailable(EDGAR.env.url);

		const result = await compareCompensation(input);
		if (!result.ok) return { found: 0, rows: [], reason: result.reason };

		return { found: result.data.rows.length, rows: result.data.rows };
	},
});
