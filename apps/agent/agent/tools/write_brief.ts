import { defineTool } from "eve/tools";
import { z } from "zod";
import type { Evidence, EvidenceKind } from "../lib/evidence";
import { WEIGHTS } from "../lib/evidence";
import { writeBrief } from "../lib/facts";
import { focusOn } from "../lib/focus";
import { assertResearchPurpose } from "../lib/session-purpose";

const MAX_NARRATIVE = 400;

export default defineTool({
	description:
		"Write the Background panel on a contact: a short narrative plus the structured lines under it. Replaces the previous one. Every claim must come from something you read.",
	inputSchema: z.object({
		contactId: z.string(),
		narrative: z
			.string()
			.max(MAX_NARRATIVE)
			.describe(
				"Two or three sentences, third person, present tense, their name first. " +
					"Current role and employer, then the previous roles worth knowing. " +
					"No adjectives about the person, no 'passionate about', no guessing at seniority.",
			),
		sections: z.object({
			currentRole: z
				.string()
				.optional()
				.describe('e.g. "CEO & Co-founder · Comp AI"'),
			tenure: z.string().optional().describe('e.g. "2 yrs 3 mos"'),
			previousRoles: z.array(z.string()).optional(),
			seniority: z.string().optional().describe('e.g. "Founder / C-level"'),
			function: z
				.string()
				.optional()
				.describe('e.g. "Executive", "Security", "Finance"'),
			location: z.string().optional(),
		}),
		evidence: z
			.array(
				z.object({
					kind: z.enum(
						Object.keys(WEIGHTS) as [EvidenceKind, ...EvidenceKind[]],
					),
					detail: z.string(),
					sourceUrl: z.string().optional(),
				}),
			)
			.min(1),
		sourceUrl: z.string().optional(),
	}),
	async execute(input, ctx) {
		assertResearchPurpose(ctx);
		focusOn({ contactId: input.contactId });

		const narrative = input.narrative.trim();

		if (narrative.length < 40) {
			return {
				written: false as const,
				reason:
					"Too short to be worth a panel. Say something the record does not already show, or write nothing.",
			};
		}

		const result = await writeBrief({
			contactId: input.contactId,
			narrative,
			sections: input.sections,
			evidence: input.evidence as Evidence[],
			sourceUrl: input.sourceUrl,
		});

		return result.written
			? { written: true as const, score: Number(result.score.toFixed(2)) }
			: { written: false as const, reason: result.reason };
	},
});
