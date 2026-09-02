import { defineTool } from "eve/tools";
import { z } from "zod";
import { postRunSlackMessage } from "../../../lib/run-runtime";
import { requireTeamAgentAttribute } from "../../../lib/session-purpose";

export default defineTool({
	description:
		"Post one message to the Slack channel this agent is allowed to use. That's the channel this run opened, or the channel (or person) set when the agent was saved. Don't pick a channel here. The same call twice does not post twice.",
	inputSchema: z.object({
		text: z.string().trim().min(1).max(4_000),
	}),
	async execute(input, ctx) {
		return postRunSlackMessage(
			requireTeamAgentAttribute(ctx, "runId"),
			ctx.callId,
			input,
			ctx.abortSignal,
		);
	},
});
