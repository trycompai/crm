import { defineTool } from "eve/tools";
import { z } from "zod";
import { finishRun } from "../../../lib/run-runtime";
import { requireTeamAgentAttribute } from "../../../lib/session-purpose";

export default defineTool({
	description:
		"Finish this run successfully with its concise summary and structured result.",
	inputSchema: z.object({
		summary: z.string().trim().min(1).max(1000),
		result: z.record(z.string(), z.unknown()).nullish(),
	}),
	async execute(input, ctx) {
		return finishRun(requireTeamAgentAttribute(ctx, "runId"), input);
	},
});
