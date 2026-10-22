import { describe, expect, test } from "bun:test";
import { randomBytes } from "node:crypto";
import {
	chatEventPurpose,
	createChatEventSecretBox,
} from "../src/chat-event-crypto";

describe("chat event encryption", () => {
	test("stays disabled without a valid key", () => {
		const previous = process.env.CHAT_EVENT_ENCRYPTION_KEY;
		delete process.env.CHAT_EVENT_ENCRYPTION_KEY;
		try {
			expect(createChatEventSecretBox()).toBeUndefined();
			expect(createChatEventSecretBox("invalid")).toBeUndefined();
		} finally {
			if (previous === undefined) delete process.env.CHAT_EVENT_ENCRYPTION_KEY;
			else process.env.CHAT_EVENT_ENCRYPTION_KEY = previous;
		}
	});

	test("binds ciphertext to one conversation event", () => {
		const box = createChatEventSecretBox(randomBytes(32).toString("base64"));
		if (!box) throw new Error("Secret box is missing");
		const identity = { conversationId: "conversation-1", eventId: "event-1" };
		const plaintext = JSON.stringify({ message: "Private plan" });
		const encrypted = box.encrypt(plaintext, chatEventPurpose(identity));

		expect(encrypted).not.toContain("Private plan");
		expect(box.decrypt(encrypted, chatEventPurpose(identity))).toBe(plaintext);
		expect(() =>
			box.decrypt(
				encrypted,
				chatEventPurpose({ ...identity, eventId: "event-2" }),
			),
		).toThrow();
	});
});
