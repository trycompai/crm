import {
	chatEventPurpose,
	createChatEventSecretBox,
} from "@crm/auth/chat-event-crypto";
import type { Prisma } from "@crm/db";
import {
	publicEveEventData,
	publicEveEventInput,
} from "@crm/validation/eve-public-event";

type BuilderEventIdentity = {
	conversationId: string;
	eventId: string;
};

type StoredBuilderEvent = {
	data: Prisma.InputJsonValue;
	encryptedData: string | null;
};

type BuilderEventRecord = {
	data: Prisma.JsonValue;
	encryptedData: string | null;
};

type RuntimeEventValue =
	| Prisma.InputJsonValue
	| undefined
	| RuntimeEventValue[]
	| { [key: string]: RuntimeEventValue };

export function storeBuilderEvent(
	value: Prisma.InputJsonValue,
	identity: BuilderEventIdentity,
): StoredBuilderEvent {
	const box = createChatEventSecretBox();
	if (!box) return { data: value, encryptedData: null };
	return {
		data: {},
		encryptedData: box.encrypt(
			JSON.stringify(value),
			chatEventPurpose(identity),
		),
	};
}

export function prepareBuilderEventForStorage(
	type: string,
	value: RuntimeEventValue,
	identity: BuilderEventIdentity,
) {
	const event = publicEveEventData(type, value);
	return { ...event, ...storeBuilderEvent(event.data, identity) };
}

export function readBuilderEvent(
	record: BuilderEventRecord,
	identity: BuilderEventIdentity,
): Prisma.JsonValue | null {
	if (!record.encryptedData) return record.data;
	const box = createChatEventSecretBox();
	if (!box) return null;
	return publicEveEventInput.parse(
		JSON.parse(box.decrypt(record.encryptedData, chatEventPurpose(identity))),
	);
}
