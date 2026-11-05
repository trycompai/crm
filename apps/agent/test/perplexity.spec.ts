import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { ask } from "../agent/lib/perplexity";

const realFetch = globalThis.fetch;
const savedKey = process.env.PERPLEXITY_API_KEY;

type Sent = { url: string; body: string };

type OutputItem =
	| { type: "search_results"; results: { id: number; url: string }[] }
	| { type: "fetch_url_results"; contents: string[] }
	| {
			type: "message";
			role: "assistant";
			content: { type: "output_text"; text: string }[];
	  };

type Reply = {
	status?: string;
	output?: OutputItem[];
	error?: { message: string };
	choices?: { message: { content: string } }[];
};

let sent: Sent[] = [];

function respondWith(status: number, payload: Reply) {
	globalThis.fetch = (async (input: URL | RequestInfo, init?: RequestInit) => {
		sent.push({ url: String(input), body: String(init?.body ?? "") });
		return new Response(JSON.stringify(payload), { status });
	}) as typeof fetch;
}

function sentBody(index = 0) {
	return JSON.parse(sent[index]?.body ?? "{}");
}

const completed: Reply = {
	status: "completed",
	output: [
		{
			type: "search_results",
			results: [
				{ id: 1, url: "https://acme.example/about" },
				{ id: 2, url: "https://news.example/acme" },
			],
		},
		{ type: "fetch_url_results", contents: [] },
		{
			type: "search_results",
			results: [{ id: 3, url: "https://acme.example/about" }],
		},
		{
			type: "message",
			role: "assistant",
			content: [{ type: "output_text", text: " Acme sells anvils.[1] " }],
		},
	],
};

beforeEach(() => {
	sent = [];
	process.env.PERPLEXITY_API_KEY = "pplx-test";
});

afterEach(() => {
	globalThis.fetch = realFetch;
	if (savedKey === undefined) delete process.env.PERPLEXITY_API_KEY;
	else process.env.PERPLEXITY_API_KEY = savedKey;
});

describe("ask", () => {
	it("calls the Agent API and reads the answer and its sources", async () => {
		respondWith(200, completed);

		const answer = await ask("What does Acme sell?", {
			system: "Be factual.",
		});

		expect(answer).toEqual({
			ok: true,
			data: {
				text: "Acme sells anvils.[1]",
				citations: ["https://acme.example/about", "https://news.example/acme"],
			},
		});
		expect(sent[0]?.url).toBe("https://api.perplexity.ai/v1/agent");
		expect(sentBody()).toEqual({
			effort: "fast",
			input: "What does Acme sell?",
			instructions: "Be factual.",
		});
	});

	it("maps sonar-pro to low effort and domains to a web_search filter", async () => {
		respondWith(200, completed);

		await ask("Who is Jane Doe?", {
			model: "sonar-pro",
			domains: ["linkedin.com"],
		});

		expect(sentBody()).toEqual({
			effort: "low",
			input: "Who is Jane Doe?",
			tools: [
				{
					type: "web_search",
					filters: { search_domain_filter: ["linkedin.com"] },
				},
			],
		});
	});

	it("reports an HTTP failure", async () => {
		respondWith(403, { error: { message: "nope" } });

		expect(await ask("Anything?")).toEqual({ ok: false, reason: "HTTP 403" });
	});

	it("reports a response it cannot read rather than an empty answer", async () => {
		respondWith(200, { choices: [{ message: { content: "old shape" } }] });

		expect(await ask("Anything?")).toEqual({
			ok: false,
			reason: "Unreadable Perplexity answer.",
		});
	});

	it("reports an answer with no text", async () => {
		respondWith(200, { status: "incomplete", output: [] });

		expect(await ask("Anything?")).toEqual({
			ok: false,
			reason: "Empty answer (incomplete).",
		});
	});

	it("needs a key", async () => {
		delete process.env.PERPLEXITY_API_KEY;

		expect(await ask("Anything?")).toEqual({
			ok: false,
			reason: "No PERPLEXITY_API_KEY.",
		});
	});
});
