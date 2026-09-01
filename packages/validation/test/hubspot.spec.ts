import { describe, expect, it } from "bun:test";
import {
	accessTokenInfo,
	dealsPage,
	pipelinesPage,
	tokenGrant,
} from "../src/hubspot";

describe("pipeline stage metadata", () => {
	it("reads HubSpot's string booleans as booleans", () => {
		const page = pipelinesPage.parse({
			results: [
				{
					id: "default",
					label: "Sales Pipeline",
					displayOrder: 0,
					stages: [
						{
							id: "appointmentscheduled",
							label: "Appointment Scheduled",
							displayOrder: 0,
							metadata: { isClosed: "false", probability: "0.2" },
						},
						{
							id: "closedwon",
							label: "Closed Won",
							displayOrder: 6,
							metadata: { isClosed: "true", probability: "1.0" },
						},
					],
				},
			],
		});

		const [open, won] = page.results[0]?.stages ?? [];
		expect(open?.metadata.isClosed).toBe(false);
		expect(open?.metadata.probability).toBe(0.2);
		expect(won?.metadata.isClosed).toBe(true);
		expect(won?.metadata.probability).toBe(1);
	});

	it("reads real booleans and numbers too", () => {
		const page = pipelinesPage.parse({
			results: [
				{
					id: "701459927",
					label: "Partners",
					stages: [
						{
							id: "701459928",
							label: "Signed",
							displayOrder: 3,
							metadata: { isClosed: true, probability: 1 },
						},
					],
				},
			],
		});

		expect(page.results[0]?.stages[0]?.metadata.isClosed).toBe(true);
	});

	it("defaults a stage with no metadata to open", () => {
		const page = pipelinesPage.parse({
			results: [{ id: "p", label: "P", stages: [{ id: "s", label: "S" }] }],
		});

		expect(page.results[0]?.stages[0]?.metadata).toEqual({
			isClosed: false,
			probability: 0,
		});
	});
});

describe("accessTokenInfo", () => {
	it("reads a numeric hub id as a string", () => {
		const info = accessTokenInfo.parse({
			hub_id: 1234567,
			hub_domain: "acme.hubspot.com",
			user: "admin@acme.test",
			user_id: 890,
			scopes: ["oauth", "crm.objects.deals.read"],
		});

		expect(info.hub_id).toBe("1234567");
		expect(info.user_id).toBe("890");
	});

	it("reads a token info with no scopes as an empty list", () => {
		expect(accessTokenInfo.parse({ hub_id: 1 }).scopes).toEqual([]);
	});
});

describe("tokenGrant", () => {
	it("refuses a grant with no refresh token", () => {
		expect(
			tokenGrant.safeParse({ access_token: "a", expires_in: 1800 }).success,
		).toBe(false);
	});

	it("reads a full grant", () => {
		const grant = tokenGrant.parse({
			access_token: "a",
			refresh_token: "r",
			expires_in: 1800,
			token_type: "bearer",
		});

		expect(grant.expires_in).toBe(1800);
	});
});

describe("dealsPage", () => {
	it("keeps a null property rather than dropping it", () => {
		const page = dealsPage.parse({
			results: [
				{
					id: "42",
					properties: { dealname: "Acme", closed_lost_reason: null },
				},
			],
			paging: { next: { after: "100" } },
		});

		expect(page.results[0]?.properties.closed_lost_reason).toBeNull();
		expect(page.paging?.next?.after).toBe("100");
	});

	it("reads a last page with no paging", () => {
		expect(dealsPage.parse({ results: [] }).paging).toBeUndefined();
	});
});
