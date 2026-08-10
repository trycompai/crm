import { describe, expect, it } from "bun:test";
import { isTransportOnlyEvent } from "../agent/lib/event-persistence";

describe("event persistence", () => {
	it("never stores a streaming frame", () => {
		expect(isTransportOnlyEvent("message.appended")).toBe(true);
		expect(isTransportOnlyEvent("reasoning.appended")).toBe(true);
	});

	it("stores the completed record for the same stream", () => {
		expect(isTransportOnlyEvent("message.completed")).toBe(false);
		expect(isTransportOnlyEvent("reasoning.completed")).toBe(false);
	});

	it("stores semantic run events", () => {
		for (const type of [
			"session.started",
			"turn.started",
			"turn.completed",
			"step.completed",
			"actions.requested",
			"action.result",
			"session.completed",
		]) {
			expect(isTransportOnlyEvent(type)).toBe(false);
		}
	});
});
