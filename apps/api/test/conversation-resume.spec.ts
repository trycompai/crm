import { afterEach, describe, expect, it } from "bun:test";
import { randomBytes } from "node:crypto";
import {
	chatEventPurpose,
	createChatEventSecretBox,
} from "@crm/auth/chat-event-crypto";
import {
	conversationResumeSnapshot,
	publicConversationEvent,
} from "../src/conversations/conversation-resume";

const row = (streamIndex: number, id = `event-${streamIndex}`) => ({
	id,
	type: "message.completed",
	data: { message: `Message ${streamIndex}` },
	emittedAt: new Date(`2026-10-20T12:00:0${streamIndex}.000Z`),
	streamIndex,
	deliveryIds: [`delivery-${streamIndex}`],
	conversationId: "conversation-1",
	encryptedData: null,
});

const previousKey = process.env.CHAT_EVENT_ENCRYPTION_KEY;

afterEach(() => {
	if (previousKey === undefined) delete process.env.CHAT_EVENT_ENCRYPTION_KEY;
	else process.env.CHAT_EVENT_ENCRYPTION_KEY = previousKey;
});

describe("conversation resume snapshots", () => {
	it("restores a complete saved prefix and its next cursor", () => {
		const snapshot = conversationResumeSnapshot("session-1", [row(0), row(1)]);

		expect(snapshot.events.map((event) => event.meta.id)).toEqual([
			"event-0",
			"event-1",
		]);
		expect(snapshot.session).toEqual({
			sessionId: "session-1",
			streamIndex: 2,
		});
	});

	it("stops before a missing suffix so Eve replays from the gap", () => {
		const snapshot = conversationResumeSnapshot("session-1", [row(0), row(2)]);

		expect(snapshot.events.map((event) => event.meta.id)).toEqual(["event-0"]);
		expect(snapshot.session.streamIndex).toBe(1);
	});

	it("keeps the absolute cursor when duplicate event IDs require replay", () => {
		const snapshot = conversationResumeSnapshot("session-1", [
			row(0, "same-event"),
			row(1, "same-event"),
		]);

		expect(snapshot.events.map((event) => event.meta.id)).toEqual([
			"same-event",
		]);
		expect(snapshot.session.streamIndex).toBe(2);
	});

	it("removes raw tool failures from saved history", () => {
		const event = publicConversationEvent({
			...row(0),
			type: "action.result",
			data: {
				turnId: "turn-1",
				status: "failed",
				result: {
					kind: "tool-result",
					callId: "call-1",
					toolName: "secret_tool",
					output: { password: "secret" },
					isError: true,
				},
				error: { message: "database password" },
			},
		});

		expect(event.data).toMatchObject({
			result: { output: null },
			error: { message: "The agent could not complete this action." },
		});
		expect(JSON.stringify(event)).not.toContain("password");
	});

	it("removes saved authorization events with unsafe links", () => {
		const event = publicConversationEvent({
			...row(0),
			type: "authorization.required",
			data: {
				turnId: "turn-1",
				name: "vendor",
				description: "Connect vendor",
				authorization: { url: "javascript:alert(1)" },
			},
		});

		expect(event).toMatchObject({ type: "event.ignored", data: {} });
	});

	it("decrypts protected builder history", () => {
		const key = randomBytes(32).toString("base64");
		process.env.CHAT_EVENT_ENCRYPTION_KEY = key;
		const box = createChatEventSecretBox(key);
		if (!box) throw new Error("Secret box is missing");
		const identity = { conversationId: "conversation-1", eventId: "event-0" };
		const event = publicConversationEvent({
			...row(0),
			data: {},
			encryptedData: box.encrypt(
				JSON.stringify({ message: "Private reply" }),
				chatEventPurpose(identity),
			),
		});

		expect(event).toMatchObject({
			type: "message.completed",
			data: { message: "Private reply" },
		});
	});

	it("keeps the replay cursor when its optional key is missing", () => {
		const key = randomBytes(32).toString("base64");
		const box = createChatEventSecretBox(key);
		if (!box) throw new Error("Secret box is missing");
		const identity = { conversationId: "conversation-1", eventId: "event-0" };
		delete process.env.CHAT_EVENT_ENCRYPTION_KEY;
		const snapshot = conversationResumeSnapshot("session-1", [
			{
				...row(0),
				data: {},
				encryptedData: box.encrypt(
					JSON.stringify({ message: "Private reply" }),
					chatEventPurpose(identity),
				),
			},
		]);

		expect(snapshot.session.streamIndex).toBe(1);
		expect(snapshot.events[0]).toMatchObject({
			type: "event.ignored",
			data: {},
		});
	});

	it("replays a stored completed tool result", () => {
		const snapshot = conversationResumeSnapshot("session-1", [
			{
				...row(0),
				type: "actions.requested",
				data: {
					actions: [
						{
							callId: "call-1",
							input: { title: "Pipeline review" },
							kind: "tool-call",
							toolName: "set_chat_title",
						},
					],
					turnId: "turn-1",
				},
			},
			{
				...row(1),
				type: "action.result",
				data: {
					result: {
						callId: "call-1",
						kind: "tool-result",
						output: { saved: true, title: "Pipeline review" },
						toolName: "set_chat_title",
					},
					status: "completed",
					turnId: "turn-1",
				},
			},
		]);

		expect(snapshot.events.at(-1)).toMatchObject({
			type: "action.result",
			data: {
				result: { callId: "call-1", toolName: "set_chat_title" },
				status: "completed",
			},
		});
	});
});
