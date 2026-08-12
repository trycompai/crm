import { describe, expect, it } from "bun:test";
import {
	blankToNull,
	clampDealScore,
	DEAL_SCORE,
	effectiveForecastContext,
	isValidDealScore,
	needsDealScore,
	scoreRescoreCutoff,
} from "../src/deal-score";

describe("deal score helpers", () => {
	it("clamps scores to 0–100 integers", () => {
		expect(clampDealScore(-4)).toBe(0);
		expect(clampDealScore(140.7)).toBe(100);
		expect(clampDealScore(72.4)).toBe(72);
		expect(isValidDealScore(0)).toBe(true);
		expect(isValidDealScore(100)).toBe(true);
		expect(isValidDealScore(72.5)).toBe(false);
		expect(isValidDealScore(-1)).toBe(false);
	});

	it("prefers manual forecast context when set", () => {
		expect(
			effectiveForecastContext("AI says close next month", "Rep: wait for CFO"),
		).toBe("Rep: wait for CFO");
		expect(effectiveForecastContext("AI summary", null)).toBe("AI summary");
		expect(effectiveForecastContext("AI summary", "   ")).toBe("AI summary");
		expect(effectiveForecastContext(null, null)).toBe(null);
		expect(blankToNull("  note  ")).toBe("note");
		expect(blankToNull("")).toBe(null);
	});

	it("flags deals that need a rescore after the cutoff", () => {
		const now = new Date("2026-08-12T12:00:00.000Z");
		expect(needsDealScore({ dealScoredAt: null, now })).toBe(true);
		expect(
			needsDealScore({
				dealScoredAt: new Date("2026-08-12T08:00:00.000Z"),
				now,
			}),
		).toBe(false);
		expect(
			needsDealScore({
				dealScoredAt: new Date("2026-08-10T12:00:00.000Z"),
				now,
			}),
		).toBe(true);
		expect(scoreRescoreCutoff(now).toISOString()).toBe(
			new Date(now.getTime() - DEAL_SCORE.rescoreAfterDays * 86_400_000).toISOString(),
		);
	});
});
