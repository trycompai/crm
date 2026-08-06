import { defineTool } from "eve/tools";
import { z } from "zod";
import { stageRunResult } from "../../../lib/run-runtime";
import { requireTeamAgentAttribute } from "../../../lib/session-purpose";

export default defineTool({
	description:
		"Finish this run successfully with its concise summary and structured result.",
	inputSchema: z.object({
		summary: z.string().trim().min(1).max(1000),
		result: z.record(z.string(), z.unknown()).nullish(),
	}),
	async execute(input, ctx) {
		return stageRunResult(requireTeamAgentAttribute(ctx, "runId"), input);
	},
});
