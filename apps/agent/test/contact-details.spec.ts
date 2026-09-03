import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { APOLLO_API_KEY, apolloMatch } from "../agent/lib/apollo";
import {
	type ContactDetails,
	configuredProviders,
	lookupContactDetails,
	type Provider,
} from "../agent/lib/contact-details";
import { CONTACT_DETAILS } from "../agent/lib/contact-details-config";
import {
	DROPCONTACT_API_KEY,
	dropcontactEnrich,
} from "../agent/lib/dropcontact";
import { LUSHA_API_KEY, lushaPerson } from "../agent/lib/lusha";
import {
	forgetZoomInfoSession,
	ZOOMINFO_PASSWORD,
	ZOOMINFO_USERNAME,
	zoominfoEnrich,
} from "../agent/lib/zoominfo";

const KEYS = [
	APOLLO_API_KEY,
	LUSHA_API_KEY,
	DROPCONTACT_API_KEY,
	ZOOMINFO_USERNAME,
	ZOOMINFO_PASSWORD,
] as const;

const saved: Record<string, string | undefined> = {};
const realFetch = globalThis.fetch;
const requests: { url: URL; method: string; body: string }[] = [];

const ADA = {
	firstName: "Ada",
	lastName: "Lovelace",
	domain: "example.com",
	companyName: "Example",
};

function replies(answer: (url: URL) => { status?: number; json: string }) {
	globalThis.fetch = (async (input: URL | RequestInfo, init?: RequestInit) => {
		const url = new URL(String(input instanceof Request ? input.url : input));
		requests.push({
			url,
			method: init?.method ?? "GET",
			body: String(init?.body ?? ""),
		});
		const { status, json } = answer(url);
		return new Response(json, {
			status: status ?? 200,
			headers: { "content-type": "application/json" },
		});
	}) as typeof fetch;
}

function details(overrides: Partial<ContactDetails>): ContactDetails {
	return {
		provider: "hunter",
		email: null,
		confidence: 0,
		phones: [],
		title: null,
		linkedinUrl: null,
		sources: [],
		reference: null,
		...overrides,
	};
}

function fake(
	id: Provider["id"],
	enabled: boolean,
	find: Provider["find"],
): Provider {
	return { id, label: id, keys: [], enabled: () => enabled, find };
}

beforeEach(() => {
	for (const key of KEYS) {
		saved[key] = process.env[key];
		process.env[key] = `${key}-test`;
	}
	forgetZoomInfoSession();
});

afterEach(() => {
	globalThis.fetch = realFetch;
	requests.length = 0;
	for (const key of KEYS) {
		if (saved[key] === undefined) delete process.env[key];
		else process.env[key] = saved[key];
	}
});

describe("configuredProviders", () => {
	it("keeps the configured order and drops what is off", () => {
		const all = [
			fake("zoominfo", true, async () => ({ ok: true, data: details({}) })),
			fake("hunter", false, async () => ({ ok: true, data: details({}) })),
			fake("lusha", true, async () => ({ ok: true, data: details({}) })),
		];

		expect(configuredProviders(all).map((p) => p.id)).toEqual([
			"lusha",
			"zoominfo",
		]);
	});
});

describe("lookupContactDetails", () => {
	it("says so when nothing is configured", async () => {
		expect(await lookupContactDetails(ADA, [])).toEqual({
			outcome: "unconfigured",
		});
	});

	it("stops at the first confident answer and names what it tried", async () => {
		const calls: string[] = [];
		const all = [
			fake("hunter", true, async () => {
				calls.push("hunter");
				return {
					ok: true,
					data: details({ email: "a@example.com", confidence: 20 }),
				};
			}),
			fake("apollo", true, async () => {
				calls.push("apollo");
				return { ok: false, reason: "HTTP 500" };
			}),
			fake("lusha", true, async () => {
				calls.push("lusha");
				return {
					ok: true,
					data: details({
						provider: "lusha",
						email: "ada@example.com",
						confidence: 85,
					}),
				};
			}),
			fake("zoominfo", true, async () => {
				calls.push("zoominfo");
				return { ok: true, data: details({}) };
			}),
		];

		const result = await lookupContactDetails(ADA, all);

		expect(result.outcome).toBe("found");
		if (result.outcome !== "found") return;
		expect(result.details.email).toBe("ada@example.com");
		expect(result.tried).toEqual(["hunter", "apollo", "lusha"]);
		expect(calls).not.toContain("zoominfo");
	});

	it("accepts a phone-only answer when no address is on offer", async () => {
		const all = [
			fake("lusha", true, async () => ({
				ok: true,
				data: details({
					provider: "lusha",
					phones: [{ number: "+33100000000", type: "work" }],
				}),
			})),
		];

		const result = await lookupContactDetails(ADA, all);

		expect(result.outcome).toBe("found");
	});

	it("reports every reason when nobody is confident", async () => {
		const all = [
			fake("hunter", true, async () => ({
				ok: true,
				data: details({ email: "a@example.com", confidence: 10 }),
			})),
			fake("apollo", true, async () => ({ ok: false, reason: "HTTP 401" })),
		];

		const result = await lookupContactDetails(ADA, all);

		expect(result.outcome).toBe("none");
		if (result.outcome !== "none") return;
		expect(result.reasons).toHaveLength(2);
		expect(result.reasons[0]).toContain(
			`below ${CONTACT_DETAILS.minConfidence}`,
		);
		expect(result.reasons[1]).toBe("apollo: HTTP 401");
	});
});

describe("apolloMatch", () => {
	it("posts the person and reads email status, title and phones", async () => {
		replies(() => ({
			json: JSON.stringify({
				person: {
					id: "p1",
					email: "ada@example.com",
					email_status: "verified",
					title: "CTO",
					linkedin_url: "https://www.linkedin.com/in/ada",
					phone_numbers: [
						{ sanitized_number: "+33100000000", type: "work_hq" },
					],
				},
			}),
		}));

		const result = await apolloMatch(ADA);

		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.data).toMatchObject({
			provider: "apollo",
			email: "ada@example.com",
			confidence: CONTACT_DETAILS.apollo.confidence.verified,
			title: "CTO",
			reference: "p1",
			phones: [{ number: "+33100000000", type: "work_hq" }],
		});
		expect(requests[0]?.method).toBe("POST");
		expect(requests[0]?.body).toContain('"domain":"example.com"');
	});

	it("is a blank, not a failure, when nobody matches", async () => {
		replies(() => ({ json: JSON.stringify({ person: null }) }));

		const result = await apolloMatch(ADA);

		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.data.email).toBeNull();
		expect(result.data.confidence).toBe(0);
	});
});

describe("lushaPerson", () => {
	it("prefers the work address and keeps the phones", async () => {
		replies(() => ({
			json: JSON.stringify({
				data: {
					id: 42,
					jobTitle: "CTO",
					emailAddresses: [
						{ email: "ada@personal.test", emailType: "personal" },
						{ email: "ada@example.com", emailType: "work" },
					],
					phoneNumbers: [{ number: "+33100000000", phoneType: "direct" }],
					socialLinks: { linkedin: "https://www.linkedin.com/in/ada" },
				},
			}),
		}));

		const result = await lushaPerson(ADA);

		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.data).toMatchObject({
			provider: "lusha",
			email: "ada@example.com",
			confidence: CONTACT_DETAILS.lusha.confidence.work,
			reference: "42",
			phones: [{ number: "+33100000000", type: "direct" }],
		});
		expect(requests[0]?.url.searchParams.get("companyDomain")).toBe(
			"example.com",
		);
	});

	it("accepts the wrapped contact shape too", async () => {
		replies(() => ({
			json: JSON.stringify({
				data: { contact: { emailAddresses: [{ email: "ada@example.com" }] } },
			}),
		}));

		const result = await lushaPerson(ADA);

		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.data.email).toBe("ada@example.com");
		expect(result.data.confidence).toBe(CONTACT_DETAILS.lusha.confidence.other);
	});
});

describe("dropcontactEnrich", () => {
	it("submits a batch, then reads the finished row", async () => {
		replies((url) =>
			url.pathname.endsWith("/batch")
				? { json: JSON.stringify({ request_id: "req-1", success: true }) }
				: {
						json: JSON.stringify({
							success: true,
							data: [
								{
									email: [
										{
											email: "ada@example.com",
											qualification: "nominative@pro",
										},
									],
									phone: "+33100000000",
									job: "CTO",
									linkedin: "https://www.linkedin.com/in/ada",
								},
							],
						}),
					},
		);

		const result = await dropcontactEnrich(ADA);

		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.data).toMatchObject({
			provider: "dropcontact",
			email: "ada@example.com",
			confidence: CONTACT_DETAILS.dropcontact.confidence.nominative,
			reference: "req-1",
			phones: [{ number: "+33100000000", type: "work" }],
		});
		expect(requests.map((r) => r.method)).toEqual(["POST", "GET"]);
		expect(requests[1]?.url.pathname).toBe("/batch/req-1");
	});
});

describe("zoominfoEnrich", () => {
	it("authenticates once, then enriches with the bearer token", async () => {
		replies((url) =>
			url.pathname === "/authenticate"
				? { json: JSON.stringify({ jwt: "jwt-1" }) }
				: {
						json: JSON.stringify({
							success: true,
							data: {
								result: [
									{
										data: [
											{
												id: 7,
												email: "ada@example.com",
												directPhone: "+33100000000",
												jobTitle: "CTO",
											},
										],
									},
								],
							},
						}),
					},
		);

		const first = await zoominfoEnrich(ADA);
		const second = await zoominfoEnrich(ADA);

		expect(first.ok).toBe(true);
		if (!first.ok) return;
		expect(first.data).toMatchObject({
			provider: "zoominfo",
			email: "ada@example.com",
			confidence: CONTACT_DETAILS.zoominfo.confidence.matched,
			reference: "7",
			phones: [{ number: "+33100000000", type: "direct" }],
		});
		expect(second.ok).toBe(true);
		expect(
			requests.filter((r) => r.url.pathname === "/authenticate"),
		).toHaveLength(1);
	});

	it("needs both halves of the credential", async () => {
		delete process.env[ZOOMINFO_PASSWORD];

		const result = await zoominfoEnrich(ADA);

		expect(result.ok).toBe(false);
		expect(requests).toHaveLength(0);
	});
});
