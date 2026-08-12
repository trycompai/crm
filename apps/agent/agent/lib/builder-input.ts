import { db, type Prisma } from "@crm/db";
import { lockIdempotencyKey } from "@crm/db/idempotency";
import { type InputRequested, parse, schemas } from "@crm/validation";
import {
	builderIdFromToken,
	builderToken,
	lockBuilderConversation,
} from "./custom-agent-dispatch";

const BUILDER_INPUT = {
	eventType: "input.requested",
	idPrefix: "builder-input",
} as const;

export async function persistBuilderInputRequest(
	data: unknown,
	continuationToken: string | undefined,
	authenticatedConversationId?: string | null,
): Promise<boolean> {
	const conversationId =
		authenticatedConversationId?.trim() ||
		builderIdFromToken(continuationToken);
	if (!conversationId) return false;

	const event = parse(
		schemas.agents.inputRequested,
		data,
		BUILDER_INPUT.eventType,
	);
	const question = event.requests.find(
		(request) => request.kind === "question",
	);
	if (!question) return false;

	const eventId = `${eventPrefix(conversationId)}${question.requestId}`;

	return db.$transaction(async (tx) => {
		await lockIdempotencyKey(tx, eventId);

		const replay = await tx.agentEvent.findUnique({
			where: { id: eventId },
			select: { id: true },
		});
		if (replay) return false;

		const conversation = await lockBuilderConversation(tx, conversationId);
		if (conversation?.kind !== "BUILDER" || !conversation.sessionId) {
			return false;
		}

		const recorded = await tx.agentEvent.findFirst({
			where: {
				conversationId: conversation.id,
				id: { startsWith: eventPrefix(conversation.id) },
			},
			orderBy: [{ emittedAt: "desc" }, { id: "desc" }],
			select: { id: true, data: true },
		});
		if (
			recorded &&
			!supersedes(
				event,
				parse(schemas.agents.inputRequested, recorded.data, recorded.id),
			)
		) {
			return false;
		}

		await tx.agentEvent.create({
			data: {
				id: eventId,
				sessionId: conversation.sessionId,
				conversationId: conversation.id,
				type: BUILDER_INPUT.eventType,
				data: event as Prisma.InputJsonValue,
				emittedAt: new Date(),
			},
		});

		await tx.agentConversation.update({
			where: { id: conversation.id },
			data: {
				continuationToken: builderToken(conversation.id),
				pendingInputRequest: question as Prisma.InputJsonValue,
			},
		});

		return true;
	});
}

function eventPrefix(conversationId: string): string {
	return `${BUILDER_INPUT.idPrefix}:${conversationId}:`;
}

function supersedes(event: InputRequested, current: InputRequested): boolean {
	if (event.sequence !== current.sequence) {
		return event.sequence > current.sequence;
	}
	return event.stepIndex > current.stepIndex;
}
