import { describe, expect, it } from "bun:test";
import {
	isPublicDirectWorkEmail,
	perfectProspectGate,
	weightedProspectScore,
} from "../agent/lib/prospect-promotion";

const now = new Date("2026-08-10T12:00:00.000Z");

function perfectProspect() {
	return {
		status: "QUALIFIED" as const,
		enrichmentStatus: "COMPLETE",
		website: "https://example.com",
		fitScore: 100,
		painStrength: 5,
		productFit: 5,
		timing: 5,
		reachability: 5,
		evidenceQuality: 5,
		companyProof: "Official site confirms a multi-crew landscaping operator.",
		painSignal: "A live operations role owns scheduling and delivery.",
		whyFit: "Lode coordinates the work described in the vacancy.",
		whyNow: "The role was posted this month.",
		suggestedChannel: "Direct public work email.",
		caution: "Confirm the vacancy remains open before outreach.",
		personalHook: "The operations director owns delivery.",
		jobDayProblem: "Likely coordinating crews, schedules and client updates.",
		nextAction: "Review the draft and current source receipts.",
		draftSubject: "Crew delivery at Example",
		draftBody: "A reviewable draft that has not been sent.",
		namedPerson: "Alex Example",
		role: "Operations Director",
		personSourceUrl: "https://example.com/team/alex",
		routeStatus: "DIRECT_ROUTE_REVIEW" as const,
		routeEmail: "alex@example.com",
		evidence: [
			{
				receiptId: "receipt-job",
				sourceType: "OFFICIAL_JOB_POSTING",
				url: "https://example.com/jobs/operations-manager",
				signalDate: new Date("2026-08-01T00:00:00.000Z"),
				observed: "The role coordinates crews and project delivery.",
			},
			{
				receiptId: "receipt-person",
				sourceType: "OFFICIAL_TEAM",
				url: "https://example.com/team/alex",
				signalDate: null,
				observed:
					"Alex Example is the Operations Director. Public work email: alex@example.com.",
			},
		],
	};
}

describe("weightedProspectScore", () => {
	it("uses the First Customer Finder weighting", () => {
		expect(
			weightedProspectScore({
				painStrength: 5,
				productFit: 4,
				timing: 3,
				reachability: 2,
				evidenceQuality: 1,
			}),
		).toBe(66);
	});
});

describe("isPublicDirectWorkEmail", () => {
	it("accepts a same-domain named route", () => {
		expect(
			isPublicDirectWorkEmail("alex@example.com", "https://example.com"),
		).toBe(true);
	});

	it("rejects generic, personal and off-domain routes", () => {
		expect(
			isPublicDirectWorkEmail("info@example.com", "https://example.com"),
		).toBe(false);
		expect(
			isPublicDirectWorkEmail("alex@gmail.com", "https://example.com"),
		).toBe(false);
		expect(
			isPublicDirectWorkEmail("alex@other.test", "https://example.com"),
		).toBe(false);
	});
});

describe("perfectProspectGate", () => {
	it("passes only the complete receipted perfect account", () => {
		expect(perfectProspectGate(perfectProspect(), now)).toEqual({
			passed: true,
		});
	});

	it("rejects a merely high score", () => {
		const prospect = perfectProspect();
		prospect.timing = 4;
		prospect.fitScore = 96;
		expect(perfectProspectGate(prospect, now)).toEqual({
			passed: false,
			reason: "Every score dimension must be 5/5.",
		});
	});

	it("rejects unreceipted evidence", () => {
		const prospect = perfectProspect();
		const evidence = prospect.evidence.map((item, index) => ({
			...item,
			receiptId: index === 0 ? null : item.receiptId,
		}));
		expect(perfectProspectGate({ ...prospect, evidence }, now)).toEqual({
			passed: false,
			reason: "Two observed public evidence sources are required.",
		});
	});

	it("rejects a stale job posting", () => {
		const prospect = perfectProspect();
		const evidence = prospect.evidence.map((item, index) => ({
			...item,
			signalDate:
				index === 0 ? new Date("2025-01-01T00:00:00.000Z") : item.signalDate,
		}));
		expect(perfectProspectGate({ ...prospect, evidence }, now)).toEqual({
			passed: false,
			reason:
				"A dated official company-domain job posting from the last 120 days is required.",
		});
	});

	it("rejects a future-dated job posting", () => {
		const prospect = perfectProspect();
		const evidence = prospect.evidence.map((item, index) => ({
			...item,
			signalDate:
				index === 0 ? new Date("2026-09-01T00:00:00.000Z") : item.signalDate,
		}));
		expect(perfectProspectGate({ ...prospect, evidence }, now)).toEqual({
			passed: false,
			reason:
				"A dated official company-domain job posting from the last 120 days is required.",
		});
	});

	it("rejects a route that is not visibly present in retained evidence", () => {
		const prospect = perfectProspect();
		prospect.evidence[1] = {
			...prospect.evidence[1],
			observed: "Alex Example is the Operations Director.",
		};
		expect(perfectProspectGate(prospect, now)).toEqual({
			passed: false,
			reason:
				"Retained public evidence must visibly contain the exact work email.",
		});
	});
});
