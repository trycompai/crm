import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import {
	findWorkEmail,
	HUNTER_API_KEY,
	hunterEnabled,
	verifyEmail,
} from "../agent/lib/hunter";

const realFetch = globalThis.fetch;
const savedKey = process.env[HUNTER_API_KEY];
const requested: string[] = [];

function replies(status: number, json: string) {
	globalThis.fetch = (async (input: URL | RequestInfo) => {
		requested.push(String(input instanceof Request ? input.url : input));
		return new Response(json, {
			status,
			headers: { "content-type": "application/json" },
		});
	}) as typeof fetch;
}

beforeEach(() => {
	process.env[HUNTER_API_KEY] = "hunter-test-key";
});

afterEach(() => {
	globalThis.fetch = realFetch;
	requested.length = 0;
	if (savedKey === undefined) delete process.env[HUNTER_API_KEY];
	else process.env[HUNTER_API_KEY] = savedKey;
});

describe("hunterEnabled", () => {
	it("is off without a key, and blank counts as unset", () => {
		delete process.env[HUNTER_API_KEY];
		expect(hunterEnabled()).toBe(false);
		process.env[HUNTER_API_KEY] = "  ";
		expect(hunterEnabled()).toBe(false);
	});
});

describe("findWorkEmail", () => {
	it("refuses without a key, before any request", async () => {
		delete process.env[HUNTER_API_KEY];

		const result = await findWorkEmail({
			firstName: "Ada",
			lastName: "Lovelace",
			domain: "example.com",
		});

		expect(result.ok).toBe(false);
		expect(requested).toHaveLength(0);
	});

	it("returns the address, its score and the pages it was seen on", async () => {
		replies(
			200,
			JSON.stringify({
				data: {
					email: "ada.lovelace@example.com",
					score: 92,
					position: "CTO",
					sources: [
						{
							domain: "example.com",
							uri: "https://example.com/team",
							extracted_on: "2026-05-01",
						},
						{
							domain: "news.test",
							uri: "https://news.test/ada",
							extracted_on: null,
						},
					],
				},
			}),
		);

		const result = await findWorkEmail({
			firstName: "Ada",
			lastName: "Lovelace",
			domain: "Example.com",
		});

		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.data.email).toBe("ada.lovelace@example.com");
		expect(result.data.score).toBe(92);
		expect(result.data.sources.map((s) => s.url)).toEqual([
			"https://example.com/team",
			"https://news.test/ada",
		]);

		const url = new URL(requested[0] ?? "");
		expect(url.searchParams.get("domain")).toBe("example.com");
		expect(url.searchParams.get("first_name")).toBe("Ada");
		expect(url.searchParams.get("api_key")).toBe("hunter-test-key");
	});

	it("keeps a null address as a null, not a failure", async () => {
		replies(
			200,
			JSON.stringify({ data: { email: null, score: null, sources: [] } }),
		);

		const result = await findWorkEmail({
			firstName: "Ada",
			lastName: "Lovelace",
			domain: "example.com",
		});

		expect(result).toEqual({
			ok: true,
			data: { email: null, score: 0, position: null, sources: [] },
		});
	});

	it("reports an HTTP failure as a reason", async () => {
		replies(429, JSON.stringify({ errors: [] }));

		const result = await findWorkEmail({
			firstName: "Ada",
			lastName: "Lovelace",
			domain: "example.com",
		});

		expect(result).toEqual({ ok: false, reason: "HTTP 429" });
	});
});

describe("verifyEmail", () => {
	it("reads the status and score", async () => {
		replies(200, JSON.stringify({ data: { status: "valid", score: 97 } }));

		const result = await verifyEmail("Ada.Lovelace@Example.com");

		expect(result).toEqual({ ok: true, data: { status: "valid", score: 97 } });
		expect(new URL(requested[0] ?? "").searchParams.get("email")).toBe(
			"ada.lovelace@example.com",
		);
	});
});
