import { describe, expect, it } from "bun:test";
import {
	describeHubspotScopes,
	HUBSPOT_REQUESTED_SCOPES,
	HUBSPOT_SCOPE_GROUPS,
	HUBSPOT_SCOPES,
	hubspotCanReadDeals,
	hubspotScopeDrift,
	summariseHubspotScopes,
} from "../src/hubspot-scopes";

describe("the HubSpot scope catalogue", () => {
	it("asks for read scopes only", () => {
		const writes = HUBSPOT_REQUESTED_SCOPES.filter((scope) =>
			scope.endsWith(".write"),
		);

		expect(writes).toEqual([]);
	});

	it("puts every scope in a group the page renders", () => {
		const groups = new Set(HUBSPOT_SCOPE_GROUPS.map((group) => group.id));

		for (const entry of HUBSPOT_SCOPES) {
			expect(groups.has(entry.group)).toBe(true);
		}
	});
});

describe("hubspotCanReadDeals", () => {
	it("needs oauth and the deals read scope", () => {
		expect(hubspotCanReadDeals(["oauth", "crm.objects.deals.read"])).toBe(true);
	});

	it("refuses when HubSpot held the deals scope back", () => {
		expect(hubspotCanReadDeals(["oauth", "crm.schemas.deals.read"])).toBe(
			false,
		);
	});

	it("refuses an empty grant", () => {
		expect(hubspotCanReadDeals([])).toBe(false);
	});
});

describe("hubspotScopeDrift", () => {
	it("reports what HubSpot withheld", () => {
		const drift = hubspotScopeDrift(["oauth", "crm.objects.deals.read"]);
		const missing = drift.missing.map((entry) => entry.scope);

		expect(missing).toContain("crm.objects.owners.read");
		expect(missing).not.toContain("oauth");
		expect(drift.extra).toEqual([]);
	});

	it("reports a scope this build never asked for", () => {
		const drift = hubspotScopeDrift([...HUBSPOT_REQUESTED_SCOPES, "tickets"]);

		expect(drift.extra.map((entry) => entry.scope)).toEqual(["tickets"]);
		expect(drift.missing).toEqual([]);
	});
});

describe("describeHubspotScopes", () => {
	it("names an unknown scope as broad rather than dropping it", () => {
		const [entry] = describeHubspotScopes(["something.new"]);

		expect(entry?.sensitive).toBe(true);
		expect(entry?.grant).toContain("something.new");
	});
});

describe("summariseHubspotScopes", () => {
	it("counts the broad grants in each group", () => {
		const summary = summariseHubspotScopes([...HUBSPOT_REQUESTED_SCOPES]);
		const deals = summary.find((group) => group.id === "deals");

		expect(deals?.total).toBe(3);
		expect(deals?.broad).toBe(3);
	});

	it("drops a group nothing was granted in", () => {
		const summary = summariseHubspotScopes(["oauth"]);

		expect(summary.map((group) => group.id)).toEqual(["shape"]);
	});
});
