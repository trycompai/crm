import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import type { MessageStreamEvent, SessionState } from "eve/client";
import { recordCopy, recordFilter, recordHeader } from "../lib/agent-record";
import { classify, composerState, eventsOf } from "../lib/agent-session";

const NOW = Date.parse("2026-08-01T12:00:00.000Z");

const event = (
	type: string,
	at: string = "2026-08-01T12:00:00.000Z",
): MessageStreamEvent =>
	({ type, data: {}, meta: { id: `evt_${type}`, at } }) as MessageStreamEvent;

const parked: SessionState = {
	sessionId: "wrun_1",
	continuationToken: "eve:live",
	streamIndex: 3,
};

const unparked: SessionState = { sessionId: "wrun_1", streamIndex: 3 };

describe("classify", () => {
	it("trusts the token over any reading of the events", () => {
		expect(classify(parked, [event("message.appended")], NOW)).toBe("ready");
	});

	it("knows a terminal session cannot be continued", () => {
		expect(classify(unparked, [event("session.completed")], NOW)).toBe("ended");
		expect(classify(unparked, [event("session.failed")], NOW)).toBe("ended");
	});

	it("reads a turn still emitting as working", () => {
		const recent = event("message.appended", "2026-08-01T11:59:30.000Z");

		expect(classify(unparked, [recent], NOW)).toBe("working");
	});

	it("retires a turn that stopped mid-sentence", () => {
		const stalled = event("message.appended", "2026-08-01T11:50:00.000Z");

		expect(classify(unparked, [stalled], NOW)).toBe("ended");
	});

	it("does not retire a live turn for want of a timestamp", () => {
		const undated = { type: "step.started", data: {}, meta: { id: "x" } };

		expect(classify(unparked, [undated as MessageStreamEvent], NOW)).toBe(
			"working",
		);
	});
});

describe("the composer", () => {
	it("takes input on a parked thread, and on one not started yet", () => {
		expect(
			composerState({ status: "ready", session: parked, events: [] }, false),
		).toEqual({ locked: false, ended: false });
		expect(composerState({ status: "new" }, false)).toEqual({
			locked: false,
			ended: false,
		});
		expect(composerState(undefined, false)).toEqual({
			locked: false,
			ended: false,
		});
	});

	it("holds input while a turn is in flight, from either side", () => {
		expect(
			composerState({ status: "ready", session: parked, events: [] }, true)
				.locked,
		).toBe(true);
		expect(
			composerState(
				{ status: "working", session: unparked, events: [] },
				false,
			),
		).toEqual({ locked: true, ended: false });
	});

	it("says an ended thread is ended rather than merely busy", () => {
		expect(
			composerState({ status: "ended", session: unparked, events: [] }, false),
		).toEqual({ locked: true, ended: true });
	});

	it("lets somebody type when the agent could not be reached", () => {
		expect(composerState({ status: "offline", events: [] }, false)).toEqual({
			locked: false,
			ended: false,
		});
	});
});

describe("eventsOf", () => {
	it("renders the transcript in every state that has one", () => {
		const events = [event("message.completed")];

		expect(eventsOf({ status: "offline", events })).toEqual(events);
		expect(eventsOf({ status: "ended", session: unparked, events })).toEqual(
			events,
		);
		expect(eventsOf({ status: "new" })).toEqual([]);
		expect(eventsOf(undefined)).toEqual([]);
	});
});

describe("record context", () => {
	it("asks about the thing you are actually looking at", () => {
		expect(recordCopy({ kind: "contact" }).title).toBe("Ask about this person");
		expect(recordCopy({ kind: "company" }).title).toBe(
			"Ask about this company",
		);
		expect(recordCopy({ kind: "deal" }).title).toBe("Ask about this deal");
	});

	it("offers questions that suit the record", () => {
		expect(recordCopy({ kind: "company" }).suggestions.join(" ")).not.toContain(
			"person",
		);
		expect(recordCopy({ kind: "deal" }).suggestions.join(" ")).not.toContain(
			"person",
		);
		expect(recordCopy({ kind: "contact" }).suggestions[0]).toBe(
			"Who is this person?",
		);
	});

	it("tells the agent which record it is on", () => {
		expect(recordHeader({ kind: "contact", id: "c1" })).toEqual({
			"x-crm-contact": "c1",
		});
		expect(recordHeader({ kind: "company", id: "co1" })).toEqual({
			"x-crm-company": "co1",
		});
		expect(recordHeader({ kind: "deal", id: "d1" })).toEqual({
			"x-crm-deal": "d1",
		});
	});

	it("files a conversation under one record and no other", () => {
		expect(recordFilter({ kind: "deal", id: "d1" })).toEqual({ dealId: "d1" });
		expect(Object.keys(recordFilter({ kind: "company", id: "co1" }))).toEqual([
			"companyId",
		]);
	});

	it("carries the open email step beside the campaign", () => {
		expect(
			recordHeader({ kind: "campaign", id: "cmp1", nodeId: "n1" }),
		).toEqual({
			"x-crm-campaign": "cmp1",
			"x-crm-campaign-node": "n1",
		});
		expect(recordHeader({ kind: "campaign", id: "cmp1" })).toEqual({
			"x-crm-campaign": "cmp1",
		});
		expect(recordHeader({ kind: "template", id: "t1", nodeId: "n1" })).toEqual({
			"x-crm-template": "t1",
		});
	});

	it("swaps the copy when an email step is open", () => {
		expect(recordCopy({ kind: "campaign", nodeId: "n1" }).title).toBe(
			"Write this email",
		);
		expect(recordCopy({ kind: "campaign" }).title).toBe("Build this campaign");
		expect(recordCopy({ kind: "campaign", nodeId: "n1" }).field).toBe(
			"campaignId",
		);
	});

	it("speaks to one send on a blast and to a flow on a drip", () => {
		const blast = recordCopy({ kind: "campaign", campaignKind: "BLAST" });
		const drip = recordCopy({ kind: "campaign", campaignKind: "DRIP" });

		expect(blast.suggestions.join(" ")).not.toContain("Branch");
		expect(blast.suggestions.join(" ")).not.toContain("wait");
		expect(blast.suggestions.join(" ")).toContain("subject line");
		expect(drip).toEqual(recordCopy({ kind: "campaign" }));
		expect(drip.suggestions.join(" ")).toContain("Branch");
	});

	it("lets the open email step win over the campaign kind", () => {
		expect(
			recordCopy({ kind: "campaign", nodeId: "n1", campaignKind: "BLAST" })
				.title,
		).toBe("Write this email");
	});

	it("offers to start a template that is still blank", () => {
		const blank = recordCopy({ kind: "template", empty: true });
		const written = recordCopy({ kind: "template" });

		expect(blank.title).toBe("Write this email");
		expect(blank.placeholder).toBe(
			"A welcome email for people who just signed up.",
		);
		expect(blank.suggestions[0]).toBe("Write a welcome email for new signups");
		expect(written.placeholder).toBe(
			"Make this shorter and lead with the customer.",
		);
		expect(recordCopy({ kind: "template", empty: false })).toEqual(written);
	});

	it("files a node-scoped chat under the campaign and its node", () => {
		expect(
			recordFilter({ kind: "campaign", id: "cmp1", nodeId: "n1" }),
		).toEqual({ campaignId: "cmp1", campaignNodeId: "n1" });
		expect(recordFilter({ kind: "campaign", id: "cmp1" })).toEqual({
			campaignId: "cmp1",
		});
		expect(recordFilter({ kind: "template", id: "t1", nodeId: "n1" })).toEqual({
			templateId: "t1",
		});
	});
});

describe("the panel", () => {
	const source = () =>
		readFileSync(
			new URL("../components/crm/agent-panel.tsx", import.meta.url),
			"utf8",
		);

	it("takes its copy from the record, never from a literal", () => {
		for (const kind of ["contact", "company", "deal"] as const) {
			const copy = recordCopy({ kind });
			for (const literal of [copy.title, copy.blurb, copy.placeholder]) {
				expect(source()).not.toContain(literal);
			}
		}
	});

	it("offers a way out of a thread that has ended", () => {
		expect(source()).toContain("Start a new conversation");
		expect(source()).toContain("onClick={onNewThread}");
	});
});

describe("the record sheet", () => {
	it("keeps the agent tab mounted behind the others", () => {
		for (const sheet of ["contact", "company", "deal"]) {
			const source = readFileSync(
				new URL(
					`../components/crm/record-sheet/${sheet}-sheet.tsx`,
					import.meta.url,
				),
				"utf8",
			);

			expect(source).toContain("keepMounted: true");
		}

		const sheet = readFileSync(
			new URL("../components/detail-sheet.tsx", import.meta.url),
			"utf8",
		);

		expect(sheet).toContain("tab.keepMounted && opened.has(tab.value)");
		expect(sheet).toContain("data-[state=inactive]:hidden");
	});
});
