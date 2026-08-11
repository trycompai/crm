type ConversationStore = {
	agentConversation: {
		findUnique(args: {
			where: { sessionId: string };
			select: { userId: true };
		}): Promise<{ userId: string } | null>;
		findFirst(args: {
			where: { id: string; userId: string; kind: "BUILDER" };
			select: { sessionId: true };
		}): Promise<{ sessionId: string | null } | null>;
	};
};

export function sessionFromPath(pathname: string): string | null {
	const match = pathname.match(/\/eve\/v1\/session\/([^/]+)/);
	return match?.[1] ? decodeURIComponent(match[1]) : null;
}

export async function canProxyEveSession(
	db: ConversationStore,
	input: {
		requestedSession: string | null;
		builderConversationId: string | null;
		userId: string;
	},
): Promise<boolean> {
	if (input.builderConversationId) {
		const conversation = await db.agentConversation.findFirst({
			where: {
				id: input.builderConversationId,
				userId: input.userId,
				kind: "BUILDER",
			},
			select: { sessionId: true },
		});

		if (!conversation) return false;
		if (
			input.requestedSession &&
			conversation.sessionId !== input.requestedSession
		) {
			return false;
		}

		return true;
	}

	if (!input.requestedSession) return true;

	const conversation = await db.agentConversation.findUnique({
		where: { sessionId: input.requestedSession },
		select: { userId: true },
	});

	return conversation?.userId === input.userId;
}
