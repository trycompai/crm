import { describe, expect, it } from "bun:test";
import { anchorResults } from "../lib/agent-results";
import {
	type DealListResult,
	dealListResultOf,
	groupDealListPages,
	type TranscriptItem,
} from "../lib/agent-transcript";

const page = (status: string, ids: string[]) => ({
	asOf: "2026-08-07T00:00:00.000Z",
	criteria: {
		status,
		inactiveForDays: null,
		companyId: null,
		ownerId: null,
	},
	deals: ids.map((id) => ({
		id,
		name: id,
		stage: "Discovery",
		amount: null,
		currency: "USD",
		company: { id: "c1", name: "Acme" },
		owner: null,
		daysSinceLastActivity: 3,
		expectedCloseDate: null,
	})),
});

const did = (
	id: string,
	output: unknown,
	extra: Partial<Extract<TranscriptItem, { kind: "did" }>> = {},
): TranscriptItem => ({
	kind: "did",
	id,
	label: "Listed deals",
	input: null,
	output,
	errorText: null,
	tone: "neutral",
	pending: false,
	sources: [],
	tool: "list_deals",
	...extra,
});

const said = (id: string, text: string): TranscriptItem => ({
	kind: "said",
	id,
	mine: false,
	text,
});

const anchorDeals = (items: readonly TranscriptItem[]) =>
	anchorResults<DealListResult>({
		items,
		tool: "list_deals",
		validate: dealListResultOf,
		group: groupDealListPages,
	});

describe("anchorResults", () => {
	it("leaves a finished result under its own call when a pending one follows", () => {
		const anchored = anchorDeals([
			did("a", page("OPEN", ["d1"])),
			did("b", null, { pending: true, output: null }),
		]);

		expect([...anchored.keys()]).toEqual(["a"]);
	});

	it("never anchors to a failed call", () => {
		const anchored = anchorDeals([
			did("a", page("OPEN", ["d1"])),
			did("b", { broken: true }, { tone: "warning", errorText: "Nope." }),
		]);

		expect([...anchored.keys()]).toEqual(["a"]);
	});

	it("keeps two different criteria under their own calls", () => {
		const anchored = anchorDeals([
			did("a", page("OPEN", ["d1"])),
			said("t", "And the won ones:"),
			did("b", page("WON", ["d2"])),
		]);

		expect([...anchored.keys()]).toEqual(["a", "b"]);
		expect(anchored.get("a")?.[0]?.criteria.status).toBe("OPEN");
		expect(anchored.get("b")?.[0]?.criteria.status).toBe("WON");
	});

	it("anchors paginated pages of one criteria to the final page", () => {
		const anchored = anchorDeals([
			did("a", page("OPEN", ["d1"])),
			did("b", page("OPEN", ["d2"])),
		]);

		expect([...anchored.keys()]).toEqual(["b"]);
		expect(anchored.get("b")?.[0]?.deals.map((deal) => deal.id)).toEqual([
			"d1",
			"d2",
		]);
	});

	it("anchors pagination to the last valid page, not a later failure", () => {
		const anchored = anchorDeals([
			did("a", page("OPEN", ["d1"])),
			did("b", page("OPEN", ["d2"])),
			did("c", { broken: true }),
		]);

		expect([...anchored.keys()]).toEqual(["b"]);
	});

	it("ignores calls belonging to another tool", () => {
		const anchored = anchorDeals([
			did("a", page("OPEN", ["d1"]), { tool: "list_companies" }),
		]);

		expect(anchored.size).toBe(0);
	});
});
