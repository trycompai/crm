import { PRIORITY } from "@crm/db/agent-tasks";
import { defineTool } from "eve/tools";
import { z } from "zod";
import { daysFromNow, RECHECK } from "../lib/recheck-config";
import { assertResearchPurpose } from "../lib/session-purpose";
import { scheduleTask } from "../lib/tasks";

export default defineTool({
	description:
		"Decide when this contact is worth looking at again, and say why. Use a short interval for people whose job change would move a live deal, a long one for quiet records, and skip it entirely for addresses nobody will ever sell to.",
	inputSchema: z.object({
		contactId: z.string(),
		days: z
			.number()
			.int()
			.min(RECHECK.minDays)
			.max(RECHECK.maxDays)
			.describe(
				`${RECHECK.championDays} for a champion on an open deal; ${RECHECK.namedDays} for a named contact with no deal; ${RECHECK.baselineDays} for a steady job-change feed; ${RECHECK.emptyDays} when two attempts have found nothing.`,
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
			.default(RECHECK.defaultBudget)
			.describe("Vendor calls the next run may spend."),
	}),
	async execute({ contactId, days, reason, budget }, ctx) {
		assertResearchPurpose(ctx);
		const dueAt = daysFromNow(days);

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
