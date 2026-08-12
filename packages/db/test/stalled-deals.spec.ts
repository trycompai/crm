import { describe, expect, it } from "bun:test";
import {
	activityAnchor,
	daysInactive,
	isStalledDeal,
	STALLED_DEAL,
	stallCutoff,
	stallReason,
	stallTaskSubject,
} from "../src/stalled-deals";

const NOW = new Date("2026-08-12T12:00:00.000Z");

describe("stallCutoff", () => {
	it("subtracts whole days from now", () => {
		expect(stallCutoff(NOW, 14).toISOString()).toBe("2026-07-29T12:00:00.000Z");
	});

	it("treats a negative window as zero", () => {
		expect(stallCutoff(NOW, -3).getTime()).toBe(NOW.getTime());
	});
});

describe("activityAnchor", () => {
	it("prefers lastActivityAt when present", () => {
		const last = new Date("2026-08-01T00:00:00.000Z");
		const created = new Date("2026-07-01T00:00:00.000Z");
		expect(activityAnchor(last, created)).toBe(last);
	});

	it("falls back to createdAt when never active", () => {
		const created = new Date("2026-07-01T00:00:00.000Z");
		expect(activityAnchor(null, created)).toBe(created);
	});
});

describe("isStalledDeal", () => {
	it("flags an open deal past the inactive window", () => {
		expect(
			isStalledDeal({
				lastActivityAt: new Date("2026-07-20T12:00:00.000Z"),
				createdAt: new Date("2026-06-01T00:00:00.000Z"),
				now: NOW,
				inactiveDays: 14,
			}),
		).toBe(true);
	});

	it("keeps a recently active deal open", () => {
		expect(
			isStalledDeal({
				lastActivityAt: new Date("2026-08-10T12:00:00.000Z"),
				createdAt: new Date("2026-06-01T00:00:00.000Z"),
				now: NOW,
				inactiveDays: 14,
			}),
		).toBe(false);
	});

	it("uses createdAt when the deal has no activity stamp", () => {
		expect(
			isStalledDeal({
				lastActivityAt: null,
				createdAt: new Date("2026-07-01T00:00:00.000Z"),
				now: NOW,
				inactiveDays: 14,
			}),
		).toBe(true);

		expect(
			isStalledDeal({
				lastActivityAt: null,
				createdAt: new Date("2026-08-10T00:00:00.000Z"),
				now: NOW,
				inactiveDays: 14,
			}),
		).toBe(false);
	});

	it("defaults to STALLED_DEAL.inactiveDays", () => {
		expect(STALLED_DEAL.inactiveDays).toBe(14);
		expect(
			isStalledDeal({
				lastActivityAt: stallCutoff(NOW),
				createdAt: new Date("2026-01-01T00:00:00.000Z"),
				now: NOW,
			}),
		).toBe(true);
	});
});

describe("daysInactive and reasons", () => {
	it("counts whole days from the activity anchor", () => {
		expect(
			daysInactive({
				lastActivityAt: new Date("2026-07-29T12:00:00.000Z"),
				createdAt: new Date("2026-01-01T00:00:00.000Z"),
				now: NOW,
			}),
		).toBe(14);
	});

	it("writes a stable reason and subject", () => {
		expect(stallReason("Acme renewal", 14)).toBe(
			"Acme renewal has had no activity for 14 days.",
		);
		expect(stallReason("Acme renewal", 1)).toBe(
			"Acme renewal has had no activity for 1 day.",
		);
		expect(stallTaskSubject("Acme renewal")).toBe("Re-engage: Acme renewal");
		expect(stallTaskSubject("  ")).toBe("Re-engage: Untitled deal");
	});
});
