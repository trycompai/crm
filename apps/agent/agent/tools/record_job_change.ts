import { defineTool } from "eve/tools";
import { z } from "zod";
import { sensitiveWhen } from "../lib/approval";
import { focusOn } from "../lib/focus";
import { raiseJobChange } from "../lib/job-change";
import { assertResearchPurpose } from "../lib/session-purpose";

export default defineTool({
	description:
		"Raise a job change on a contact's timeline and task their owner. Reads the change from the facts already recorded; call it after recording a new employer. Re-parenting to a CRM company needs a person; omit moveToCompanyId on unattended runs.",
	inputSchema: z.object({
		contactId: z.string(),
		moveToCompanyId: z
			.string()
			.optional()
			.describe(
				"Only when the new employer is already a company in the CRM and a person has approved the move.",
			),
	}),
	approval: sensitiveWhen(
		(input: { moveToCompanyId?: string } | undefined) =>
			Boolean(input?.moveToCompanyId),
		"Raise the change without `moveToCompanyId` — the alert lands on the timeline and their owner decides whether to move them.",
	),
	async execute({ contactId, moveToCompanyId }, ctx) {
		assertResearchPurpose(ctx);
		focusOn({ contactId });
		return raiseJobChange({ contactId, moveToCompanyId });
	},
});
