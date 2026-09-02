import { defineTool } from "eve/tools";
import { z } from "zod";
import { inviteToRunSlackChannel } from "../../../lib/run-runtime";
import { requireTeamAgentAttribute } from "../../../lib/session-purpose";

export default defineTool({
	description:
		"Invite people to the Slack channel this run opened. An address inside this workspace is added straight away. An address outside it gets a Slack Connect invitation, which that person has to accept before they can read anything.",
	inputSchema: z.object({
		emails: z
			.array(z.email())
			.min(1)
			.max(10)
			.describe(
				"Who to invite, by email address. Customers and colleagues both go here.",
			),
	}),
	async execute(input, ctx) {
		return inviteToRunSlackChannel(
			requireTeamAgentAttribute(ctx, "runId"),
			ctx.callId,
			input,
		);
	},
});
