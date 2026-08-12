import { describe, expect, it } from "bun:test";
import { daysFromNow, JOB_CHANGE, RECHECK } from "../agent/lib/recheck-config";

describe("RECHECK", () => {
	it("keeps champion shorter than named, named shorter than empty", () => {
		expect(RECHECK.championDays).toBe(14);
		expect(RECHECK.namedDays).toBe(90);
		expect(RECHECK.baselineDays).toBe(30);
		expect(RECHECK.emptyDays).toBe(365);
		expect(RECHECK.championDays).toBeLessThan(RECHECK.namedDays);
		expect(RECHECK.namedDays).toBeLessThan(RECHECK.emptyDays);
		expect(RECHECK.championDays).toBeLessThan(RECHECK.baselineDays);
	});

	it("bounds schedule_recheck days", () => {
		expect(RECHECK.minDays).toBe(1);
		expect(RECHECK.maxDays).toBe(730);
		expect(RECHECK.defaultBudget).toBe(4);
	});
});

describe("JOB_CHANGE", () => {
	it("gives the owner a near due date", () => {
		expect(JOB_CHANGE.ownerTaskDueDays).toBe(2);
	});
});

describe("daysFromNow", () => {
	it("adds whole days from a fixed instant", () => {
		const from = Date.UTC(2026, 0, 1, 12, 0, 0);
		expect(daysFromNow(14, from).toISOString()).toBe(
			"2026-01-15T12:00:00.000Z",
		);
	});
});
