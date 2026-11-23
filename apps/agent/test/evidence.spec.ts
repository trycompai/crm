import { describe, expect, it } from "bun:test";
import { emailTitleEvidence } from "../agent/lib/email-title";
import {
	BAND_FLOOR,
	bandFor,
	type Evidence,
	scoreEvidence,
} from "../agent/lib/evidence";

const of = (...kinds: Evidence["kind"][]): Evidence[] =>
	kinds.map((kind) => ({ kind, detail: `saw ${kind}` }));

describe("email title evidence", () => {
	const title = "Director of Procurement";

	it("finds a title below the sender name and leaves role responsibilities in the reply", () => {
		const message = {
			fromName: "Mira Vale",
			body: "I lead the procurement evaluation.\n\nMira Vale\nDirector of Procurement · Example",
		};
		expect(emailTitleEvidence(message, title)).toEqual({
			reply: undefined,
			signature: "Director of Procurement · Example",
		});
	});

	it("checks direct declarations and ignores longer, third-party and quoted titles", () => {
		const message = (body: string) => ({ fromName: null, body });
		expect(
			emailTitleEvidence(
				message("I serve as Director of Procurement at Example."),
				title,
			).reply,
		).toBe("I serve as Director of Procurement");
		for (const body of [
			"I am the Director of Procurement Operations.",
			"Our Director of Procurement will lead the meeting.",
			"I can join.\nOn Tuesday, Mira wrote:\nI am the Director of Procurement.",
		]) {
			expect(emailTitleEvidence(message(body), title).reply).toBeUndefined();
		}
	});
});

describe("scoreEvidence", () => {
	it("writes a fact when a primary source names them", () => {
		const scored = scoreEvidence(of("profile.email-match"));
		expect(scored.band).toBe("VERIFIED");
		expect(scored.hasPrimary).toBe(true);
	});

	it("treats our own mailbox as primary evidence", () => {
		expect(scoreEvidence(of("crm.thread-reply")).band).toBe("VERIFIED");
	});

	it("uses the strongest mail evidence once when legacy observations have no ids", () => {
		expect(scoreEvidence(of("crm.signature-block")).band).toBe("PROBABLE");
		const scored = scoreEvidence(of("crm.thread-reply", "crm.signature-block"));
		expect(scored.band).toBe("VERIFIED");
		expect(scored.score).toBeCloseTo(0.85);
		expect(scored.evidence.map(({ kind }) => kind)).toEqual([
			"crm.thread-reply",
		]);
	});

	it("counts different validated message ids separately", () => {
		const scored = scoreEvidence(
			[
				{ kind: "crm.signature-block", detail: "first", sourceId: "message-1" },
				{ kind: "crm.thread-reply", detail: "same", sourceId: "message-1" },
				{
					kind: "crm.signature-block",
					detail: "second",
					sourceId: "message-2",
				},
				{ kind: "crm.thread-reply", detail: "no message id" },
			],
			{ email: new Set(["message-1", "message-2"]), meeting: new Set() },
		);
		expect(scored.score).toBeCloseTo(0.97);
		expect(scored.evidence.map(({ detail }) => detail)).toEqual([
			"same",
			"second",
		]);
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
