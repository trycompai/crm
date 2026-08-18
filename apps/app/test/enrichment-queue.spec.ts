import { describe, expect, it } from "bun:test";
import {
	elapsedLabel,
	formatElapsed,
	NO_ELAPSED,
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
