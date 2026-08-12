import { describe, expect, it } from "bun:test";
import {
	BAND_FLOOR,
	bandFor,
	type Evidence,
	scoreEvidence,
} from "../agent/lib/evidence";

const of = (...kinds: Evidence["kind"][]): Evidence[] =>
	kinds.map((kind) => ({ kind, detail: `saw ${kind}` }));

describe("scoreEvidence", () => {
	it("writes a fact when a primary source names them", () => {
		const scored = scoreEvidence(of("profile.email-match"));
		expect(scored.band).toBe("VERIFIED");
		expect(scored.hasPrimary).toBe(true);
	});

	it("writes when LinkedIn employer and name both match", () => {
		const scored = scoreEvidence(of("linkedin.employer-and-name"));
		expect(scored.band).toBe("VERIFIED");
		expect(scored.hasPrimary).toBe(true);
	});

	it("keeps employer-only below the floor so strangers are not stored", () => {
		expect(scoreEvidence(of("employer-only")).band).toBeNull();
	});

	it("treats our own mailbox as primary evidence", () => {
		expect(scoreEvidence(of("crm.thread-reply")).band).toBe("VERIFIED");
	});

	it("writes a title a signature block states on a thread they replied to", () => {
		expect(scoreEvidence(of("crm.signature-block")).band).toBe("PROBABLE");
		expect(
			scoreEvidence(of("crm.thread-reply", "crm.signature-block")).band,
		).toBe("VERIFIED");
	});

	it("refuses to write anything without a primary source, however much of it there is", () => {
		const scored = scoreEvidence(
			of(
				"handle.name-form",
				"search.cites-profile",
				"web.cited-claim",
				"employer-only",
			),
		);

		expect(scored.score).toBeGreaterThan(BAND_FLOOR.PROBABLE);
		expect(scored.hasPrimary).toBe(false);
		expect(scored.band).toBe("PROBABLE");
	});

	it("holds the primary-source rule even if the weights are re-calibrated upwards", () => {
		expect(bandFor(0.99, false)).toBe("PROBABLE");
		expect(bandFor(0.85, true)).toBe("VERIFIED");
	});

	it("makes an unreadable X handle a suggestion, not a value", () => {
		const scored = scoreEvidence(
			of("handle.name-form", "search.cites-profile"),
		);
		expect(scored.band).toBe("PROBABLE");
	});

	it("holds a fact when sources disagree, rather than averaging them", () => {
		const scored = scoreEvidence([
			...of("linkedin.employer-and-name"),
			{
				kind: "contradiction",
				detail: "their signature says a different employer",
			},
		]);

		expect(scored.band).toBe("POSSIBLE");
		expect(scored.rationale).toContain("Held:");
	});

	it("drops evidence too weak to keep at all", () => {
		expect(scoreEvidence(of("employer-only")).band).toBeNull();
		expect(scoreEvidence([]).band).toBeNull();
	});

	it("never claims certainty", () => {
		const everything = scoreEvidence(
			of(
				"profile.email-match",
				"linkedin.employer-and-name",
				"crm.thread-reply",
				"github.account-identity",
			),
		);
		expect(everything.score).toBeLessThan(1);
	});

	it("explains itself in words a rep could read", () => {
		const scored = scoreEvidence(
			of("github.account-identity", "handle.name-form"),
		);
		expect(scored.rationale).toContain("GitHub account");
		expect(scored.rationale).toContain("handle");
	});
});
