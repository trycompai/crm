import "@crm/env/load";

import { createSecretBox, type SecretBox } from "./secret-box";

export type ChatEventIdentity = {
	conversationId: string;
	eventId: string;
};

export function createChatEventSecretBox(
	source: string | undefined = process.env.CHAT_EVENT_ENCRYPTION_KEY,
): SecretBox | undefined {
	return createSecretBox(source);
}

export function chatEventPurpose(identity: ChatEventIdentity): string {
	return `chat-event:${identity.conversationId}:${identity.eventId}`;
}
