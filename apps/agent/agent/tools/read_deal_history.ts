import { defineTool } from "eve/tools";
import { z } from "zod";
import { readDealHistory } from "../lib/accounts";
import { focusOn } from "../lib/focus";

export default defineTool({
	description:
		"Read a deal in full: stage and how long it has been there, value, close date, the whole stage history, who is on it with their contact ids, correspondence, calendar meetings, Granola call summaries with note ids, and notes. Free — call it first in a deal session.",
	inputSchema: z.object({
		dealId: z.string(),
		threads: z
			.number()
			.int()
			.min(1)
			.max(20)
			.default(5)
			.describe("How many recent threads to read."),
	}),
	async execute({ dealId, threads }) {
		const history = await readDealHistory(dealId, { threads });
		if (!history) return { found: false as const, reason: "No such deal." };

		focusOn({ companyId: history.company.id });

		return { found: true as const, ...history };
	},
});
