import { describe, expect, it } from "bun:test";
import {
	dealOutcome,
	HUBSPOT,
	type HubspotConnectionRow,
	hubspotApiUrl,
	outcomeOfStage,
	splitScopes,
	tokenIsFresh,
} from "../src/hubspot";

function connection(
	overrides: Partial<HubspotConnectionRow> = {},
): HubspotConnectionRow {
	return {
		id: "connection",
		portalId: "1234567",
		portalDomain: "acme.hubspot.com",
		refreshToken: "refresh",
		accessToken: "access",
		accessTokenExpiresAt: new Date(Date.now() + 30 * 60_000),
		scopes: "oauth crm.objects.deals.read",
		installerEmail: "admin@acme.test",
		lastReadAt: null,
		lastErrorAt: null,
		lastError: null,
		revokedAt: null,
		createdAt: new Date(),
		updatedAt: new Date(),
		...overrides,
	};
}

describe("outcomeOfStage", () => {
	it("reads an open stage as open whatever its probability", () => {
		expect(outcomeOfStage({ isClosed: false, probability: 0 })).toBe("OPEN");
		expect(outcomeOfStage({ isClosed: false, probability: 1 })).toBe("OPEN");
		expect(outcomeOfStage({ isClosed: false, probability: 0.8 })).toBe("OPEN");
	});

	it("reads a closed stage at probability 1 as won", () => {
		expect(outcomeOfStage({ isClosed: true, probability: 1 })).toBe("WON");
	});

	it("reads every other closed stage as lost", () => {
		expect(outcomeOfStage({ isClosed: true, probability: 0 })).toBe("LOST");
		expect(outcomeOfStage({ isClosed: true, probability: 0.9 })).toBe("LOST");
	});
});

describe("splitScopes", () => {
	it("splits on spaces and on commas", () => {
		expect(splitScopes("oauth crm.objects.deals.read")).toEqual([
			"oauth",
			"crm.objects.deals.read",
		]);
		expect(splitScopes("oauth, crm.objects.deals.read")).toEqual([
			"oauth",
			"crm.objects.deals.read",
		]);
	});

	it("reads nothing as an empty list", () => {
		expect(splitScopes(null)).toEqual([]);
		expect(splitScopes(undefined)).toEqual([]);
		expect(splitScopes("   ")).toEqual([]);
	});
});

describe("tokenIsFresh", () => {
	it("refuses a token with no expiry", () => {
		expect(tokenIsFresh(connection({ accessTokenExpiresAt: null }))).toBe(
			false,
		);
	});

	it("refuses a missing token", () => {
		expect(tokenIsFresh(connection({ accessToken: null }))).toBe(false);
	});

	it("refuses a token that expires inside the skew", () => {
		const soon = new Date(Date.now() + HUBSPOT.token.refreshSkewMs - 1_000);
		expect(tokenIsFresh(connection({ accessTokenExpiresAt: soon }))).toBe(
			false,
		);
	});

	it("accepts a token that outlives the skew", () => {
		const later = new Date(Date.now() + HUBSPOT.token.refreshSkewMs + 60_000);
		expect(tokenIsFresh(connection({ accessTokenExpiresAt: later }))).toBe(
			true,
		);
	});
});

describe("hubspotApiUrl", () => {
	it("builds one versioned base for every read", () => {
		expect(hubspotApiUrl("pipelines/deals")).toBe(
			"https://api.hubapi.com/crm/v3/pipelines/deals",
		);
		expect(hubspotApiUrl("objects/deals/search")).toBe(
			"https://api.hubapi.com/crm/v3/objects/deals/search",
		);
	});
});

describe("dealOutcome", () => {
	it("believes HubSpot's own closed-won flag before any stage", () => {
		expect(dealOutcome({ hs_is_closed_won: "true" }, { outcome: "OPEN" })).toBe(
			"won",
		);
	});

	it("believes HubSpot's own closed-lost flag before any stage", () => {
		expect(
			dealOutcome({ hs_is_closed_lost: "true" }, { outcome: "OPEN" }),
		).toBe("lost");
	});

	it("falls back to the stage when the flags are absent", () => {
		expect(dealOutcome({ dealstage: "701459930" }, { outcome: "LOST" })).toBe(
			"lost",
		);
	});

	it("reads a custom pipeline's numeric stage, not its name", () => {
		expect(dealOutcome({ dealstage: "701459931" }, { outcome: "WON" })).toBe(
			"won",
		);
	});

	it("reads a stage it has never seen as open rather than guessing", () => {
		expect(dealOutcome({ dealstage: "unknown" }, null)).toBe("open");
	});

	it('reads the string "false" as false', () => {
		expect(
			dealOutcome(
				{ hs_is_closed_won: "false", hs_is_closed_lost: "false" },
				{ outcome: "OPEN" },
			),
		).toBe("open");
	});
});
