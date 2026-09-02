import { defineTool } from "eve/tools";
import { always } from "eve/tools/approval";
import { z } from "zod";
import { requireBuilderAttribute } from "../../../lib/session-purpose";
import { toChannelName } from "../../../lib/slack-channel-name";
import {
	createSlackChannel,
	joinSlackChannel,
} from "../../../lib/slack-membership";
import { requestSlackInventorySync } from "../../../lib/slack-people";

export default defineTool({
	description:
		"Create one Slack channel this agent will post to, when the user named a channel that does not exist yet. Returns the channel id and label to pin as a chosen destination. Ask first with ask_question; a person approves the creation itself.",
	inputSchema: z.object({
		name: z.string().trim().min(1).max(80),
		isPrivate: z.boolean(),
	}),
	approval: always(),
	async execute(input, ctx) {
		requireBuilderAttribute(ctx, "conversationId");

		const name = toChannelName(input.name);
		if (!name) {
			throw new Error("That name has no letters or numbers Slack accepts.");
		}

		const outcome = await createSlackChannel(name, input.isPrivate);
		if ("error" in outcome) throw new Error(outcome.error);

		const join = await joinSlackChannel(outcome.id);
		if (!join.joined) {
			throw new Error(
				`Slack has #${outcome.name}, and Comp AI cannot post in it: ${join.reason}`,
			);
		}

		await requestSlackInventorySync();

		return {
			created: true,
			destination: {
				kind: "channel" as const,
				resolution: "chosen" as const,
				id: outcome.id,
				label: `#${outcome.name}`,
			},
		};
	},
});
