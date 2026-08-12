import { DEAL_SCORE } from "@crm/db/deal-score";
import { defineTool } from "eve/tools";
import { z } from "zod";
import { writeDealIntelligence } from "../lib/deal-intelligence";
import { assertResearchPurpose } from "../lib/session-purpose";

export default defineTool({
	description:
		"Write the deal score (0–100), one-paragraph rationale, and AI forecast context on a deal. Replaces the previous AI score and forecast. Does not overwrite forecastContextManual. Base every claim on the deal timeline you already read.",
	inputSchema: z.object({
		dealId: z.string(),
		score: z
			.number()
			.int()
			.min(DEAL_SCORE.min)
			.max(DEAL_SCORE.max)
			.describe(
				"Health 0–100 from stage age, activity cadence, contact coverage, and note content.",
			),
		summary: z
			.string()
			.min(40)
			.max(DEAL_SCORE.summaryMax)
			.describe(
				"One paragraph on why this score. Present tense. No fluff. Cite stage age, activity, contacts, and notes.",
			),
		forecastContext: z
			.string()
			.min(40)
			.max(DEAL_SCORE.forecastMax)
			.describe(
				"Rolling summary of the deal timeline for forecast. What moved, what blocks, what is next.",
			),
	}),
	async execute(input, ctx) {
		assertResearchPurpose(ctx);

		return writeDealIntelligence({
			dealId: input.dealId,
			score: input.score,
			summary: input.summary,
			forecastContext: input.forecastContext,
		});
	},
});
