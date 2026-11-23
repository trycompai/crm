import { defineTool } from "eve/tools";
import { z } from "zod";
import { changeWrite } from "../lib/approval";
import { evidenceInput } from "../lib/evidence";
import { FACT_FIELDS, type FactField, recordFact } from "../lib/facts";
import { focusOn } from "../lib/focus";
import { assertResearchPurpose } from "../lib/session-purpose";

export default defineTool({
	description:
		"Record one claim about a contact — title, employer, a profile URL, seniority — together with the evidence for it. The evidence decides whether it is written to the record or offered to a rep as a suggestion. Never invent evidence you did not observe.",
	inputSchema: z.object({
		contactId: z.string(),
		field: z
			.enum(FACT_FIELDS as [FactField, ...FactField[]])
			.describe("Which fact about them this is."),
		value: z
			.string()
			.describe("The claim itself, exactly as the source states it."),
		evidence: z
			.array(evidenceInput)
			.min(1)
			.describe(
				"One observation per independent source. For a title, cite a message ID and use crm.thread-reply only when the sender states that exact title in the reply. Use crm.signature-block when it appears in the signature.",
			),
		method: z
			.string()
			.describe(
				'Where it came from: "linkedin.profile", "github.api", "crm.thread", "web".',
			),
		sourceUrl: z
			.string()
			.optional()
			.describe("The page a rep should open to check."),
	}),
	approval: changeWrite(),
	async execute(input, ctx) {
		assertResearchPurpose(ctx);
		focusOn({ contactId: input.contactId });

		const result = await recordFact({
			contactId: input.contactId,
			field: input.field,
			value: input.value,
			evidence: input.evidence,
			method: input.method,
			sourceUrl: input.sourceUrl,
		});

		return {
			stored: result.stored,
			applied: result.applied,
			band: result.band,
			score: Number(result.score.toFixed(2)),
			rationale: result.rationale,
			reason: result.reason || undefined,
		};
	},
});
