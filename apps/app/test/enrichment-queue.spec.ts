import { describe, expect, it } from "bun:test";
import {
	elapsedLabel,
	formatElapsed,
	NO_ELAPSED,
	queueFooter,
} from "../lib/enrichment-queue";

describe("how long a lookup has been going", () => {
	it("pads the seconds under a minute", () => {
		expect(formatElapsed(0)).toBe("0:00");
		expect(formatElapsed(9)).toBe("0:09");
		expect(formatElapsed(12)).toBe("0:12");
	});

	it("counts minutes up to an hour", () => {
		expect(formatElapsed(60)).toBe("1:00");
		expect(formatElapsed(605)).toBe("10:05");
		expect(formatElapsed(3599)).toBe("59:59");
	});

	it("adds an hours field past an hour", () => {
		expect(formatElapsed(3600)).toBe("1:00:00");
		expect(formatElapsed(3723)).toBe("1:02:03");
		expect(formatElapsed(86_400)).toBe("24:00:00");
	});

	it("drops part seconds instead of rounding up", () => {
		expect(formatElapsed(12.9)).toBe("0:12");
	});

	it("reads a clock skew as zero, never as a negative time", () => {
		expect(formatElapsed(-5)).toBe("0:00");
	});
});

describe("what the meta slot shows", () => {
	const started = "2026-08-17T10:00:00.000Z";
	const now = Date.parse("2026-08-17T10:00:12.000Z");

	it("counts up while the agent works", () => {
		expect(elapsedLabel("running", started, now)).toBe("0:12");
	});

	it("shows a dash for a row that is still waiting", () => {
		expect(elapsedLabel("queued", started, now)).toBe(NO_ELAPSED);
	});

	it("keeps the time on a row that gave up", () => {
		expect(elapsedLabel("failed", started, now)).toBe("0:12");
	});

	it("shows a dash when nothing has started", () => {
		expect(elapsedLabel("running", null, now)).toBe(NO_ELAPSED);
	});

	it("shows a dash rather than NaN for an unreadable date", () => {
		expect(elapsedLabel("running", "not a date", now)).toBe(NO_ELAPSED);
	});
});

describe("what the queue footer offers", () => {
	it("says nothing when every row is on screen", () => {
		expect(queueFooter({ total: 3, fetched: 3, shown: 3, limit: 20 })).toEqual({
			more: 0,
			action: "none",
		});
	});

	it("offers to show the rows already fetched", () => {
		expect(
			queueFooter({ total: 12, fetched: 12, shown: 5, limit: 20 }),
		).toEqual({ more: 7, action: "show-all" });
	});

	it("offers to fetch the rows the server held back", () => {
		expect(
			queueFooter({ total: 60, fetched: 20, shown: 20, limit: 20 }),
		).toEqual({ more: 40, action: "load-more" });
	});

	it("shows the rows it has before fetching more", () => {
		expect(
			queueFooter({ total: 60, fetched: 20, shown: 5, limit: 20 }),
		).toEqual({ more: 55, action: "show-all" });
	});

	it("stops offering once the page maximum is reached", () => {
		expect(
			queueFooter({ total: 500, fetched: 200, shown: 200, limit: 200 }),
		).toEqual({ more: 300, action: "none" });
	});

	it("never promises a negative number of rows", () => {
		expect(queueFooter({ total: 0, fetched: 5, shown: 5, limit: 20 })).toEqual({
			more: 0,
			action: "none",
		});
	});
});
