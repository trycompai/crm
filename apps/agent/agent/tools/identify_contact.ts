import { defineTool } from "eve/tools";
import { z } from "zod";
import type { Evidence, EvidenceKind } from "../lib/evidence";
import { WEIGHTS } from "../lib/evidence";
import { recordFact } from "../lib/facts";
import { focusOn } from "../lib/focus";
import { assertResearchPurpose } from "../lib/session-purpose";

export default defineTool({
	description:
		"Put a verified name to a CRM contact, with the evidence for it. Strong evidence writes the name; anything less becomes a suggestion for a rep. Never overwrites a name a person supplied.",
	inputSchema: z.object({
		contactId: z.string(),
		fullName: z.string().describe("Exactly as the source writes it."),
		evidence: z
			.array(
				z.object({
					kind: z.enum(
						Object.keys(WEIGHTS) as [EvidenceKind, ...EvidenceKind[]],
					),
					detail: z.string().describe("What the source actually said."),
					sourceUrl: z.string().optional(),
				}),
			)
			.min(1),
		sourceUrl: z.string().describe("The page a rep should open to check."),
	}),
	async execute(input, ctx) {
		assertResearchPurpose(ctx);
		focusOn({ contactId: input.contactId });

		const result = await recordFact({
			contactId: input.contactId,
			field: "name",
			value: input.fullName,
			evidence: input.evidence as Evidence[],
			method: "identity",
			sourceUrl: input.sourceUrl,
		});

		return {
			applied: result.applied,
			stored: result.stored,
			band: result.band,
			score: Number(result.score.toFixed(2)),
			rationale: result.rationale,
			...(result.reason ? { reason: result.reason } : {}),
		};
	},
});
