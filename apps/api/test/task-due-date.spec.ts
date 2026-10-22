import { describe, expect, it } from "bun:test";
import {
	parseTaskDueDay,
	serializeTaskDueDay,
	taskDayBoundaries,
	taskWindowFilter,
} from "../src/activities/task-due-date";

describe("task calendar days", () => {
	it("stores and returns a selected day without a timezone shift", () => {
		const stored = parseTaskDueDay("2026-10-22");

		expect(stored?.toISOString()).toBe("2026-10-22T00:00:00.000Z");
		expect(serializeTaskDueDay(stored)).toBe("2026-10-22");
	});

	it("rejects an instant where a calendar day is required", () => {
		expect(() => parseTaskDueDay("2026-10-22T14:00:00.000Z")).toThrow(
			"is not a calendar day",
		);
	});

	it("uses one UTC workspace day on both sides of midnight", () => {
		expect(taskDayBoundaries(new Date("2026-10-22T23:59:59.999Z"))).toEqual(
			taskDayBoundaries(new Date("2026-10-22T00:00:00.000Z")),
		);
	});

	it("ends this week at the next Monday", () => {
		const reference = new Date("2026-10-22T12:00:00.000Z");

		expect(taskWindowFilter("week", reference)).toEqual({
			dueAt: {
				gte: new Date("2026-10-23T00:00:00.000Z"),
				lt: new Date("2026-10-26T00:00:00.000Z"),
			},
		});
	});

	it("keeps today separate from overdue work", () => {
		const reference = new Date("2026-10-22T12:00:00.000Z");

		expect(taskWindowFilter("overdue", reference)).toEqual({
			dueAt: { lt: new Date("2026-10-22T00:00:00.000Z") },
		});
		expect(taskWindowFilter("today", reference)).toEqual({
			dueAt: {
				gte: new Date("2026-10-22T00:00:00.000Z"),
				lt: new Date("2026-10-23T00:00:00.000Z"),
			},
		});
	});
});
