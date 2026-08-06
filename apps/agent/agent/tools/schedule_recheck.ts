import { PRIORITY } from "@crm/db/agent-tasks";
import { defineTool } from "eve/tools";
import { z } from "zod";
import { assertResearchPurpose } from "../lib/session-purpose";
import { scheduleTask } from "../lib/tasks";

const MIN_DAYS = 1;
const MAX_DAYS = 730;

export default defineTool({
	description:
		"Decide when this contact is worth looking at again, and say why. Use a short interval for people whose job change would move a live deal, a long one for quiet records, and skip it entirely for addresses nobody will ever sell to.",
	inputSchema: z.object({
		contactId: z.string(),
		days: z
			.number()
			.int()
			.min(MIN_DAYS)
			.max(MAX_DAYS)
			.describe(
				"14 for a champion on an open deal; 90 for a named contact with no deal; 365 when two attempts have found nothing.",
			),
		reason: z
			.string()
			.min(10)
			.describe(
				"Why this interval, for this person. A rep reads it: 'a job change here would move the Acme deal', not 'scheduled recheck'.",
			),
		budget: z
			.number()
			.int()
			.min(1)
			.max(20)
			.default(4)
			.describe("Vendor calls the next run may spend."),
	}),
	async execute({ contactId, days, reason, budget }, ctx) {
		assertResearchPurpose(ctx);
		const dueAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000);

		await scheduleTask({
			contactId,
			kind: "recheck",
			reason,
			dueAt,
			budget,
			priority: PRIORITY.recheck,
		});

		return { scheduled: true as const, dueAt: dueAt.toISOString(), reason };
	},
});
