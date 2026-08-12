import { describe, expect, it } from "bun:test";
import { formatDay, fromDay, isDayBefore, toDay } from "@crm/ui/lib/format";

describe("day strings", () => {
	it("round-trips a date through its local parts", () => {
		const date = new Date(2026, 11, 31, 23, 30);
		expect(toDay(date)).toBe("2026-12-31");
		expect(toDay(fromDay(toDay(date)) as Date)).toBe("2026-12-31");
	});

	it("pads single-digit months and days", () => {
		expect(toDay(new Date(2026, 0, 5))).toBe("2026-01-05");
	});

	it("reads the day the server stored, not the local rendering of it", () => {
		expect(formatDay("2026-12-31T00:00:00.000Z")).toBe("Dec 31, 2026");
		expect(fromDay("2026-12-31T00:00:00.000Z")?.getDate()).toBe(31);
	});

	it("has nothing to show for nothing", () => {
		expect(fromDay(null)).toBeUndefined();
		expect(fromDay("")).toBeUndefined();
		expect(fromDay("someday")).toBeUndefined();
		expect(formatDay(null)).toBe("—");
	});

	it("compares calendar days without interpreting them as instants", () => {
		expect(isDayBefore("2026-08-11", "2026-08-12")).toBe(true);
		expect(isDayBefore("2026-08-12", "2026-08-12")).toBe(false);
		expect(isDayBefore("2026-08-13", "2026-08-12")).toBe(false);
	});
});
