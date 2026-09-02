import { defineTool } from "eve/tools";
import { z } from "zod";
import { builderContext } from "../../../lib/builder-runtime";
import { requireBuilderReadAttribute } from "../../../lib/session-purpose";

export default defineTool({
	description:
		"Read the authoritative builder-chat scope, supported real-time CRM events, connected sources, matched Slack people, available Slack channels, selected CRM records, current time, and latest draft.",
	inputSchema: z.object({}),
	async execute(_input, ctx) {
		return builderContext(
			requireBuilderReadAttribute(ctx, "conversationId"),
			requireBuilderReadAttribute(ctx, "userId"),
		);
	},
});
