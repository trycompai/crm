import { db, type Prisma } from "@crm/db";
import { lockIdempotencyKey } from "@crm/db/idempotency";
import {
	type InputRequest,
	type InputRequested,
	parse,
	schemas,
} from "@crm/validation";
import type { ChannelEvents } from "eve/channels";
import { readBuilderEvent, storeBuilderEvent } from "./builder-event-storage";
import {
	builderIdFromToken,
	builderToken,
	lockBuilderConversation,
} from "./custom-agent-dispatch";

const BUILDER_INPUT = {
	eventType: "input.requested",
	idPrefix: "builder-input",
} as const;

export const BUILDER_INPUT_EVENT_PREFIX = `${BUILDER_INPUT.idPrefix}:`;

type InputRequestedEvent = Parameters<
	NonNullable<ChannelEvents["input.requested"]>
>[0];

export async function persistBuilderInputRequest(
	data: InputRequestedEvent,
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
	const request = pendingBuilderRequest(event.requests);
	if (!request) return false;

	const eventId = `${eventPrefix(conversationId)}${request.requestId}`;

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
			select: { id: true, data: true, encryptedData: true },
		});
		const recordedData = recorded
			? readBuilderEvent(recorded, {
					conversationId: conversation.id,
					eventId: recorded.id,
				})
			: null;
		if (
			recorded &&
			recordedData &&
			!supersedes(
				event,
				parse(schemas.agents.inputRequested, recordedData, recorded.id),
			)
		) {
			return false;
		}
		if (recorded && !recordedData) return false;

		const storedEvent = storeBuilderEvent(event as Prisma.InputJsonValue, {
			conversationId: conversation.id,
			eventId,
		});

		await tx.agentEvent.create({
			data: {
				id: eventId,
				sessionId: conversation.sessionId,
				conversationId: conversation.id,
				type: BUILDER_INPUT.eventType,
				data: storedEvent.data,
				encryptedData: storedEvent.encryptedData,
				emittedAt: new Date(),
			},
		});

		await tx.agentConversation.update({
			where: { id: conversation.id },
			data: {
				continuationToken: builderToken(conversation.id),
				pendingInputRequest: request as Prisma.InputJsonValue,
			},
		});

		return true;
	});
}

function pendingBuilderRequest(
	requests: readonly InputRequest[],
): InputRequest | null {
	return (
		requests.find((request) => request.kind === "tool-approval") ??
		requests.find((request) => request.kind === "question") ??
		null
	);
}

function eventPrefix(conversationId: string): string {
	return `${BUILDER_INPUT_EVENT_PREFIX}${conversationId}:`;
}

function supersedes(event: InputRequested, current: InputRequested): boolean {
	if (event.sequence !== current.sequence) {
		return event.sequence > current.sequence;
	}
	return event.stepIndex > current.stepIndex;
}
