import { db, type Prisma } from "@crm/db";
import { builderIdFromToken, builderToken } from "./custom-agent-dispatch";

type BuilderInputRequest = {
	kind: string;
	requestId: string;
	[key: string]: unknown;
};

export async function persistBuilderInputRequest(
	data: {
		requests: readonly BuilderInputRequest[];
		sequence: number;
		stepIndex: number;
		turnId: string;
	},
	continuationToken: string | undefined,
	authenticatedConversationId?: string | null,
): Promise<boolean> {
	const conversationId =
		authenticatedConversationId?.trim() ||
		builderIdFromToken(continuationToken);
	if (!conversationId) return false;

	const question = data.requests.find((request) => request.kind === "question");
	if (!question) return false;

	return db.$transaction(async (tx) => {
		const conversation = await tx.agentConversation.findFirst({
			where: { id: conversationId, kind: "BUILDER" },
			select: { id: true, sessionId: true },
		});
		if (!conversation) return false;

		await tx.agentConversation.update({
			where: { id: conversation.id },
			data: {
				continuationToken: builderToken(conversation.id),
				pendingInputRequest: question as Prisma.InputJsonValue,
			},
		});

		if (conversation.sessionId) {
			await tx.agentEvent.createMany({
				data: [
					{
						id: `builder-input:${conversation.id}:${question.requestId}`,
						sessionId: conversation.sessionId,
						conversationId: conversation.id,
						type: "input.requested",
						data: data as Prisma.InputJsonValue,
						emittedAt: new Date(),
					},
				],
				skipDuplicates: true,
			});
		}

		return true;
	});
}
