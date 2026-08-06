import { defineTool } from "eve/tools";
import { z } from "zod";
import { builderContext } from "../../../lib/builder-runtime";
import { requireBuilderAttribute } from "../../../lib/session-purpose";

export default defineTool({
	description:
		"Read the authoritative builder-chat scope, connected sources, selected CRM records, current time, and latest draft.",
	inputSchema: z.object({}),
	async execute(_input, ctx) {
		return builderContext(
			requireBuilderAttribute(ctx, "conversationId"),
			requireBuilderAttribute(ctx, "userId"),
		);
	},
});
