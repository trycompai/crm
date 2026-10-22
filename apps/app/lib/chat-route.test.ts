import { describe, expect, it } from "bun:test";
import { adoptChatUrl } from "./chat-route";

describe("chat route adoption", () => {
	it("replaces the new-chat URL without adding a history entry", () => {
		const calls: unknown[][] = [];
		const history = {
			replaceState: (...args: unknown[]) => {
				calls.push(args);
			},
		};

		adoptChatUrl(history, "/tripwire/chat/chat-1");

		expect(calls).toEqual([[null, "", "/tripwire/chat/chat-1"]]);
	});
});
