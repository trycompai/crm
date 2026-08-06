import { db } from "@crm/db";

export const BUILDER_CONVERSATION_TITLE_MAX_LENGTH = 60;

export async function setBuilderConversationTitle(
	conversationId: string,
	userId: string,
	title: string,
) {
	const normalized = title
		.replace(/\s+/g, " ")
		.trim()
		.replace(/^["'“”‘’]+|["'“”‘’]+$/g, "")
		.slice(0, BUILDER_CONVERSATION_TITLE_MAX_LENGTH)
		.trim();

	if (!normalized) throw new Error("A chat title cannot be empty.");

	const updated = await db.agentConversation.updateMany({
		where: {
			id: conversationId,
			userId,
			kind: "BUILDER",
			title: null,
		},
		data: { title: normalized },
	});

	if (updated.count === 0) {
		const conversation = await db.agentConversation.findFirst({
			where: { id: conversationId, userId, kind: "BUILDER" },
			select: { title: true },
		});
		if (!conversation)
			throw new Error("This builder conversation is unavailable.");
		return { saved: false as const, title: conversation.title };
	}

	return { saved: true as const, title: normalized };
}
