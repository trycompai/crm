import { afterEach, describe, expect, test } from "bun:test";
import { randomBytes } from "node:crypto";
import {
	prepareBuilderEventForStorage,
	readBuilderEvent,
	storeBuilderEvent,
} from "../agent/lib/builder-event-storage";

const previousKey = process.env.CHAT_EVENT_ENCRYPTION_KEY;

afterEach(() => {
	if (previousKey === undefined) delete process.env.CHAT_EVENT_ENCRYPTION_KEY;
	else process.env.CHAT_EVENT_ENCRYPTION_KEY = previousKey;
});

describe("builder event storage", () => {
	test("stores plaintext when encryption is not configured", () => {
		delete process.env.CHAT_EVENT_ENCRYPTION_KEY;
		const stored = storeBuilderEvent(
			{ message: "Visible" },
			{ conversationId: "conversation-1", eventId: "event-1" },
		);

		expect(stored).toEqual({
			data: { message: "Visible" },
			encryptedData: null,
		});
	});

	test("encrypts configured builder history and restores it", () => {
		process.env.CHAT_EVENT_ENCRYPTION_KEY = randomBytes(32).toString("base64");
		const identity = { conversationId: "conversation-1", eventId: "event-1" };
		const stored = storeBuilderEvent({ message: "Private" }, identity);

		expect(stored.data).toEqual({});
		expect(stored.encryptedData).not.toContain("Private");
		expect(readBuilderEvent(stored, identity)).toEqual({ message: "Private" });
	});

	test("returns no replay data when the key is missing", () => {
		process.env.CHAT_EVENT_ENCRYPTION_KEY = randomBytes(32).toString("base64");
		const identity = { conversationId: "conversation-1", eventId: "event-1" };
		const stored = storeBuilderEvent({ message: "Private" }, identity);
		delete process.env.CHAT_EVENT_ENCRYPTION_KEY;

		expect(readBuilderEvent(stored, identity)).toBeNull();
	});

	test("stores a completed runtime tool result for replay", () => {
		process.env.CHAT_EVENT_ENCRYPTION_KEY = randomBytes(32).toString("base64");
		const identity = { conversationId: "conversation-1", eventId: "event-1" };
		const stored = prepareBuilderEventForStorage(
			"action.result",
			{
				error: undefined,
				result: {
					callId: "call-1",
					kind: "tool-result",
					output: { saved: true, title: "Pipeline review" },
					toolName: "set_chat_title",
				},
				sequence: 0,
				status: "completed",
				stepIndex: 0,
				turnId: "turn-1",
			},
			identity,
		);

		expect(stored.type).toBe("action.result");
		expect(readBuilderEvent(stored, identity)).toMatchObject({
			result: { callId: "call-1", toolName: "set_chat_title" },
			status: "completed",
		});
	});
});
