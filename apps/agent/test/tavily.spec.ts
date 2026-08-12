import { afterEach, describe, expect, it } from "bun:test";
import { searchTavily } from "../agent/lib/tavily";

const originalKey = process.env.TAVILY_API_KEY;

afterEach(() => {
	if (originalKey === undefined) delete process.env.TAVILY_API_KEY;
	else process.env.TAVILY_API_KEY = originalKey;
});

describe("Tavily transport", () => {
	it("sends the bounded search request through the mocked transport", async () => {
		process.env.TAVILY_API_KEY = "test-key";
		const requests: RequestInit[] = [];
		const result = await searchTavily(
			"Lode CRM",
			{ depth: "advanced", maxResults: 3, includeDomains: ["example.com"] },
			async (_url, request) => {
				requests.push(request ?? {});
				return Response.json({
					results: [
						{
							title: "Example",
							url: "https://example.com/source",
							content: "Public source",
						},
					],
				});
			},
		);

		expect(result).toEqual({
			ok: true,
			results: [
				{
					title: "Example",
					url: "https://example.com/source",
					snippet: "Public source",
					score: null,
					publishedDate: null,
				},
			],
		});
		expect(requests).toHaveLength(1);
		expect(requests[0]).toMatchObject({
			method: "POST",
			headers: {
				authorization: "Bearer test-key",
				"content-type": "application/json",
			},
		});
		expect(JSON.parse(String(requests[0]?.body))).toEqual({
			query: "Lode CRM",
			search_depth: "advanced",
			max_results: 3,
			include_answer: false,
			include_raw_content: false,
			include_domains: ["example.com"],
		});
	});

	it("returns the mocked transport status without reading its body", async () => {
		process.env.TAVILY_API_KEY = "test-key";
		const result = await searchTavily(
			"Lode CRM",
			{ depth: "basic", maxResults: 1 },
			async () => new Response(null, { status: 429 }),
		);

		expect(result).toEqual({
			ok: false,
			reason: "Tavily search returned 429.",
		});
	});

	it("drops malformed results from the mocked transport", async () => {
		process.env.TAVILY_API_KEY = "test-key";
		const result = await searchTavily(
			"Lode CRM",
			{ depth: "basic", maxResults: 2 },
			async () =>
				Response.json({
					results: [
						{ title: "Missing URL", content: "Ignored" },
						{
							title: "Kept",
							url: "https://example.com/kept",
							content: "Kept source",
							score: 0.8,
							published_date: "2026-08-12",
						},
					],
				}),
		);

		expect(result).toEqual({
			ok: true,
			results: [
				{
					title: "Kept",
					url: "https://example.com/kept",
					snippet: "Kept source",
					score: 0.8,
					publishedDate: "2026-08-12",
				},
			],
		});
	});
});
