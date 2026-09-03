import { defineTool } from "eve/tools";
import { z } from "zod";
import { unavailable } from "../lib/capabilities";
import { edgarEnabled, getProxy } from "../lib/edgar";
import { EDGAR } from "../lib/edgar-config";

export default defineTool({
	description:
		"Read a US public company's latest proxy statement (DEF 14A): the named executives with their titles and pay from the summary compensation table, the CEO's pay and pay actually paid with the NEO average over the last years, pay versus performance (TSR, peer TSR, net income, the company's chosen measure), the 5%+ holders the proxy lists, the voting proposals, the CEO pay ratio and whether an insider trading policy is adopted. Free, through the edgar service. The filing URL is the source for every executive you add as a contact.",
	inputSchema: z.object({
		cik: z
			.string()
			.trim()
			.regex(/^\d{1,10}$/)
			.describe("'320193'."),
		years: z
			.number()
			.int()
			.min(1)
			.max(EDGAR.compensation.maxYears)
			.default(EDGAR.compensation.years)
			.describe("How many fiscal years of pay history to keep."),
	}),
	async execute(input) {
		if (!edgarEnabled()) return unavailable(EDGAR.env.url);

		const result = await getProxy(input);
		if (!result.ok) return { found: false, reason: result.reason };

		return {
			found: true,
			proxy: result.data,
			sourceUrl: result.data.url,
			note:
				result.data.executives.length === 0
					? "The proxy carries no machine-readable compensation table. The CEO figures come from the pay-versus-performance disclosure."
					: undefined,
		};
	},
});
