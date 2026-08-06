import { describe, expect, test } from "bun:test";
import { chatDateGroup } from "../lib/chat-date-group";

describe("chat date groups", () => {
	const now = Date.parse("2026-08-05T20:00:00.000Z");

	test("uses deterministic UTC calendar buckets", () => {
		expect(chatDateGroup("2026-08-05T00:00:00.000Z", now)).toBe("Today");
		expect(chatDateGroup("2026-08-04T23:59:59.999Z", now)).toBe("Yesterday");
		expect(chatDateGroup("2026-07-30T12:00:00.000Z", now)).toBe("Last 7 days");
		expect(chatDateGroup("2026-07-28T23:59:59.999Z", now)).toBeNull();
	});

	test("does not group before a query has a stable timestamp", () => {
		expect(chatDateGroup("2026-08-05T12:00:00.000Z", 0)).toBeNull();
	});
});
