import { describe, expect, test } from "bun:test";
import { DealStage } from "@crm/db/enums";
import { dealNextAction } from "@/components/crm/deal-next-action";
import { prospectNextAction } from "@/components/crm/prospect-next-action";

const prospect = {
	companyId: null,
	contactId: null,
	dealCount: 0,
	enrichmentStatus: "COMPLETE" as const,
	hasDraft: true,
	jobPostingCount: 1,
	namedPerson: "Alex Buyer",
	queued: false,
	role: "Operations Director",
	routeStatus: "DIRECT_ROUTE_REVIEW",
	status: "QUALIFIED",
};

const deal = {
	amountCents: 25_000_00,
	contactCount: 1,
	expectedCloseDate: "2026-09-30T00:00:00.000Z",
	lastActivityAt: new Date().toISOString(),
	stage: DealStage.QUALIFIED_TO_BUY,
};

describe("prospectNextAction", () => {
	test("shows active agent work before later actions", () => {
		expect(
			prospectNextAction({
				...prospect,
				enrichmentStatus: "PENDING",
				queued: true,
			}),
		).toMatchObject({ kind: "working", label: "Agent researching" });
	});

	test("hands a converted account into its first deal", () => {
		expect(
			prospectNextAction({
				...prospect,
				companyId: "company-1",
				contactId: "contact-1",
				status: "PROMOTED",
			}),
		).toMatchObject({ kind: "start-deal", label: "Start first deal" });
	});

	test("opens existing deal management instead of creating a duplicate", () => {
		expect(
			prospectNextAction({
				...prospect,
				companyId: "company-1",
				contactId: "contact-1",
				dealCount: 2,
				status: "PROMOTED",
			}),
		).toMatchObject({ kind: "manage-deals", label: "Manage deals" });
	});

	test("prioritises finding the decision-maker", () => {
		expect(
			prospectNextAction({ ...prospect, namedPerson: null, role: null }),
		).toMatchObject({ kind: "research", label: "Find decision-maker" });
	});

	test("moves a complete research card to draft review", () => {
		expect(prospectNextAction(prospect)).toMatchObject({
			kind: "review-draft",
			label: "Review draft",
		});
	});

	test("does not requeue a disqualified prospect", () => {
		expect(
			prospectNextAction({ ...prospect, status: "DISQUALIFIED" }),
		).toMatchObject({ kind: "review-disqualification" });
	});
});

describe("dealNextAction", () => {
	test("requires a buyer first", () => {
		expect(dealNextAction({ ...deal, contactCount: 0 })).toMatchObject({
			kind: "add-contact",
		});
	});

	test("requires value before forecast timing", () => {
		expect(dealNextAction({ ...deal, amountCents: null })).toMatchObject({
			kind: "set-value",
		});
	});

	test("requires a close date after value", () => {
		expect(dealNextAction({ ...deal, expectedCloseDate: null })).toMatchObject({
			kind: "set-close-date",
		});
	});

	test("starts the sales history", () => {
		expect(dealNextAction({ ...deal, lastActivityAt: null })).toMatchObject({
			kind: "log-activity",
		});
	});

	test("surfaces a quiet deal for follow-up", () => {
		expect(
			dealNextAction({
				...deal,
				lastActivityAt: new Date(
					Date.now() - 15 * 24 * 60 * 60 * 1_000,
				).toISOString(),
			}),
		).toMatchObject({ kind: "follow-up" });
	});

	test("advances an active complete deal", () => {
		expect(dealNextAction(deal)).toMatchObject({ kind: "advance" });
	});

	test("reviews closed outcomes instead of advancing them", () => {
		expect(
			dealNextAction({ ...deal, stage: DealStage.CLOSED_WON }),
		).toMatchObject({ kind: "review-outcome" });
	});
});
