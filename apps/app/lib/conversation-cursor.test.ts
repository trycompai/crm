import { describe, expect, test } from "bun:test";
import { claimCursor, conversationCursor } from "./conversation-cursor";

describe("conversationCursor", () => {
	test("has no cursor before eve assigns a session", () => {
		expect(
			conversationCursor({ sessionId: null, token: "t", messages: 2 }),
		).toBeNull();
		expect(
			conversationCursor({ sessionId: "", token: null, messages: 0 }),
		).toBeNull();
	});

	test("changes when the session, the token or the message count changes", () => {
		const base = conversationCursor({
			sessionId: "s1",
			token: "t1",
			messages: 1,
		});
		expect(base).toBe("s1:t1:1");
		expect(
			conversationCursor({ sessionId: "s2", token: "t1", messages: 1 }),
		).not.toBe(base);
		expect(
			conversationCursor({ sessionId: "s1", token: "t2", messages: 1 }),
		).not.toBe(base);
		expect(
			conversationCursor({ sessionId: "s1", token: null, messages: 1 }),
		).toBe("s1::1");
		expect(
			conversationCursor({ sessionId: "s1", token: "t1", messages: 2 }),
		).not.toBe(base);
	});
});

describe("claimCursor", () => {
	test("claims each cursor once, so a remount does not save twice", () => {
		const written = { current: null as string | null };
		expect(claimCursor(written, "s1:t1:1")).toBe(true);
		expect(claimCursor(written, "s1:t1:1")).toBe(false);
		expect(claimCursor(written, "s1:t1:2")).toBe(true);
		expect(claimCursor(written, "s1:t1:2")).toBe(false);
	});

	test("claims a cursor again after a different one was written", () => {
		const written = { current: null as string | null };
		claimCursor(written, "s1:t1:1");
		claimCursor(written, "s1:t2:1");
		expect(claimCursor(written, "s1:t1:1")).toBe(true);
	});
});
