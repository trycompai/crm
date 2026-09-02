import { defineTool } from "eve/tools";
import { z } from "zod";
import { openRunSlackChannel } from "../../../lib/run-runtime";
import { requireTeamAgentAttribute } from "../../../lib/session-purpose";

export default defineTool({
	description:
		"Open the Slack channel this run works in, and start watching it. Every message and every join in that channel wakes this run up, so open the channel before you invite anybody. A name already in use gives you back the existing channel.",
	inputSchema: z.object({
		name: z
			.string()
			.trim()
			.min(1)
			.max(120)
			.describe(
				"What to call it, in plain words: 'Acme onboarding'. Spaces and capitals are fine; Slack gets a tidied version.",
			),
		isPrivate: z
			.boolean()
			.default(false)
			.describe(
				"True for work the whole workspace must not read. A customer channel is public.",
			),
	}),
	async execute(input, ctx) {
		return openRunSlackChannel(
			requireTeamAgentAttribute(ctx, "runId"),
			ctx.callId,
			input,
		);
	},
});
