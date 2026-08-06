import { defineTool } from "eve/tools";
import { z } from "zod";
import {
	BUILDER_CONVERSATION_TITLE_MAX_LENGTH,
	setBuilderConversationTitle,
} from "../lib/conversation-title";
import { purposeOf, requireAttribute } from "../lib/session-purpose";

export default defineTool({
	description:
		"Set the concise title for a new private builder chat. Available only when the current turn says the chat needs a title.",
	inputSchema: z.object({
		title: z.string().trim().min(1).max(BUILDER_CONVERSATION_TITLE_MAX_LENGTH),
	}),
	async execute({ title }, ctx) {
		if (purposeOf(ctx) !== "builder") {
			throw new Error("Chat titles can only be set in builder conversations.");
		}

		return setBuilderConversationTitle(
			requireAttribute(ctx, "conversationId"),
			requireAttribute(ctx, "userId"),
			title,
		);
	},
});
