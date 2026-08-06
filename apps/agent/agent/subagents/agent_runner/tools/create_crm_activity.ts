import { defineTool } from "eve/tools";
import { z } from "zod";
import { createRunActivity } from "../../../lib/run-runtime";
import { requireTeamAgentAttribute } from "../../../lib/session-purpose";

export default defineTool({
	description:
		"Create an approved internal CRM note or task on an approved record. The version must allow the exact activity type. The action is logged before it executes and is idempotent across retries.",
	inputSchema: z.object({
		type: z.enum(["NOTE", "TASK"]),
		targetKind: z.enum(["company", "contact", "deal"]),
		targetId: z.string().min(1),
		subject: z.string().trim().max(240).nullish(),
		body: z.string().trim().max(10_000).nullish(),
		dueAt: z.string().nullish(),
	}),
	async execute(input, ctx) {
		return createRunActivity(
			requireTeamAgentAttribute(ctx, "runId"),
			ctx.callId,
			input,
		);
	},
});
