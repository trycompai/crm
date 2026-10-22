import {
	chatEventPurpose,
	createChatEventSecretBox,
} from "@crm/auth/chat-event-crypto";
import type { Prisma } from "@crm/db";
import {
	publicEveEventData,
	publicEveEventInput,
} from "@crm/validation/eve-public-event";

export type IndexedConversationEvent = {
	id: string;
	type: string;
	data: Prisma.JsonValue;
	emittedAt: Date;
	streamIndex: number | null;
	deliveryIds: string[];
	conversationId: string | null;
	encryptedData: string | null;
};

export function conversationResumeSnapshot(
	sessionId: string,
	rows: readonly IndexedConversationEvent[],
) {
	const events: Array<{
		type: string;
		data: Prisma.JsonValue;
		meta: { id: string; at: string; deliveryIds?: string[] };
	}> = [];
	const ids = new Set<string>();
	let streamIndex = 0;

	for (const row of rows) {
		if (row.streamIndex !== streamIndex) break;
		streamIndex += 1;
		if (ids.has(row.id)) continue;
		ids.add(row.id);
		events.push(publicConversationEvent(row));
	}

	return { events, session: { sessionId, streamIndex } };
}

export function publicConversationEvent(row: IndexedConversationEvent) {
	const stored = storedConversationEvent(row);
	if (!stored.available) {
		return {
			type: "event.ignored",
			data: {},
			meta: eventMeta(row),
		};
	}
	const safe = publicEveEventData(
		row.type,
		publicEveEventInput.parse(stored.data),
	);
	return {
		type: safe.type,
		data: safe.data,
		meta: eventMeta(row),
	};
}

function storedConversationEvent(
	row: IndexedConversationEvent,
): { available: true; data: Prisma.JsonValue } | { available: false } {
	if (!row.encryptedData) return { available: true, data: row.data };
	if (!row.conversationId) return { available: false };
	const box = createChatEventSecretBox();
	if (!box) return { available: false };
	return {
		available: true,
		data: publicEveEventInput.parse(
			JSON.parse(
				box.decrypt(
					row.encryptedData,
					chatEventPurpose({
						conversationId: row.conversationId,
						eventId: row.id,
					}),
				),
			),
		),
	};
}

function eventMeta(row: IndexedConversationEvent) {
	return {
		id: row.id,
		at: row.emittedAt.toISOString(),
		deliveryIds: row.deliveryIds.length > 0 ? row.deliveryIds : undefined,
	};
}
