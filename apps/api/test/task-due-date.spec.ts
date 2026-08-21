import { describe, expect, it } from "bun:test";
import {
	parseTaskDueDay,
	serializeTaskDueDay,
	taskWindowFilter,
} from "../src/activities/task-due-date";

describe("task calendar days", () => {
	it("stores and returns the selected day without a timezone shift", () => {
		const stored = parseTaskDueDay("2026-08-12");
		expect(stored?.toISOString()).toBe("2026-08-12T00:00:00.000Z");
		expect(serializeTaskDueDay(stored)).toBe("2026-08-12");
	});

	it("rejects an instant where a calendar day is required", () => {
		expect(() => parseTaskDueDay("2026-08-11T14:00:00.000Z")).toThrow(
			"is not a calendar day",
		);
	});

	it("derives due windows from the viewer's calendar day", () => {
		expect(taskWindowFilter("overdue", "2026-08-12")).toEqual({
			dueAt: { lt: new Date("2026-08-12T00:00:00.000Z") },
		});
		expect(taskWindowFilter("today", "2026-08-12")).toEqual({
			dueAt: {
				gte: new Date("2026-08-12T00:00:00.000Z"),
				lt: new Date("2026-08-13T00:00:00.000Z"),
			},
		});
	});
});
