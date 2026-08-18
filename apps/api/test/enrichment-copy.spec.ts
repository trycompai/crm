import { describe, expect, it } from "bun:test";
import { MAX_ATTEMPTS, TASK_KINDS } from "@crm/db/agent-tasks";
import {
	enrichmentDueLabel,
	enrichmentQueueLine,
	enrichmentQueueState,
	enrichmentStep,
} from "../src/enrichment/enrichment-copy";

const NOW = new Date("2026-08-17T10:00:00.000Z");
const LATER = new Date("2026-08-17T10:05:00.000Z");
const EARLIER = new Date("2026-08-17T09:55:00.000Z");

describe("what a rep reads while the agent works", () => {
	it("gives every task kind a sentence", () => {
		for (const kind of TASK_KINDS) {
			expect(enrichmentStep(kind).length).toBeGreaterThan(0);
		}
	});

	it("says what the agent is doing, not what the code calls it", () => {
		expect(enrichmentStep("brand")).toBe("Fetching the logo");
		expect(enrichmentStep("identify")).toBe("Reading their profile");
		expect(enrichmentStep("portrait")).toBe("Finding their photo");
		expect(enrichmentStep("company-profile")).toBe(
			"Reading the company website",
		);
	});

	it("uses no internal vocabulary", () => {
		const banned = ["tick", "sweep", "enrol", "task", "lane", "dispatch"];

		for (const kind of TASK_KINDS) {
			const sentence = enrichmentStep(kind).toLowerCase();
			for (const word of banned) expect(sentence).not.toContain(word);
		}
	});

	it("falls back to a sentence for a kind it does not know", () => {
		expect(enrichmentStep("something-new")).toBe("Looking them up");
	});
});

describe("which state a row is in", () => {
	it("is running while the lease holds", () => {
		expect(enrichmentQueueState(1, LATER, NOW)).toBe("running");
	});

	it("is waiting before anything claims it", () => {
		expect(enrichmentQueueState(0, null, NOW)).toBe("queued");
	});

	it("is waiting again once a lease expires", () => {
		expect(enrichmentQueueState(1, EARLIER, NOW)).toBe("queued");
	});

	it("has failed once the attempts run out", () => {
		expect(enrichmentQueueState(MAX_ATTEMPTS, null, NOW)).toBe("failed");
		expect(enrichmentQueueState(MAX_ATTEMPTS, EARLIER, NOW)).toBe("failed");
	});

	it("still reads as running on the last attempt while the lease holds", () => {
		expect(enrichmentQueueState(MAX_ATTEMPTS, LATER, NOW)).toBe("running");
	});
});

describe("when work is booked for later", () => {
	const ahead = (days: number, hours = 0) =>
		new Date(NOW.getTime() + days * 86_400_000 + hours * 3_600_000);

	it("says the day in words, never a date", () => {
		expect(enrichmentDueLabel(ahead(0, 6), NOW)).toBe("Later today");
		expect(enrichmentDueLabel(ahead(1, 1), NOW)).toBe("Tomorrow");
		expect(enrichmentDueLabel(ahead(3), NOW)).toBe("In 3 days");
	});

	it("counts weeks from a fortnight, and months from two", () => {
		expect(enrichmentDueLabel(ahead(14), NOW)).toBe("In 2 weeks");
		expect(enrichmentDueLabel(ahead(30), NOW)).toBe("In 4 weeks");
		expect(enrichmentDueLabel(ahead(60), NOW)).toBe("In 2 months");
		expect(enrichmentDueLabel(ahead(90), NOW)).toBe("In 3 months");
	});

	it("uses no internal vocabulary", () => {
		const banned = ["tick", "sweep", "task", "lease", "dispatch", "queue"];

		for (const days of [0, 1, 3, 14, 30, 90, 365]) {
			const sentence = enrichmentDueLabel(ahead(days), NOW).toLowerCase();
			for (const word of banned) expect(sentence).not.toContain(word);
		}
	});
});

describe("the second line of a row", () => {
	it("names the step while it runs", () => {
		expect(enrichmentQueueLine("running", "brand")).toBe("Fetching the logo");
	});

	it("says Waiting for a queued row, whatever the kind", () => {
		expect(enrichmentQueueLine("queued", "brand")).toBe("Waiting");
		expect(enrichmentQueueLine("queued", "identify")).toBe("Waiting");
	});

	it("says why a failed row stopped", () => {
		expect(enrichmentQueueLine("failed", "brand")).toBe(
			"Could not look this up",
		);
	});
});
