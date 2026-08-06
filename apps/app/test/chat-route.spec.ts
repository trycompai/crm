import { describe, expect, it } from "bun:test";
import { isSharedChatToken } from "../lib/chat-route";

describe("chat routes", () => {
	it("distinguishes private conversation ids from shared link tokens", () => {
		expect(isSharedChatToken("cmsee2ntb0000govjsw7iayac")).toBe(false);
		expect(isSharedChatToken("x".repeat(42))).toBe(false);
		expect(isSharedChatToken("x".repeat(43))).toBe(true);
		expect(isSharedChatToken(`${"x".repeat(42)}_`)).toBe(true);
		expect(isSharedChatToken(`${"x".repeat(43)}.`)).toBe(false);
	});
});
