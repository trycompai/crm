import { z } from "zod";

const ENDPOINT = "https://api.perplexity.ai/v1/agent";
const TIMEOUT_MS = 45_000;

const EFFORT = { sonar: "fast", "sonar-pro": "low" } as const;

const agentResponse = z.object({
	status: z.string(),
	output: z.array(z.unknown()),
});

const messageItem = z.object({
	type: z.literal("message"),
	content: z.array(z.object({ type: z.string(), text: z.string().optional() })),
});

const searchResultsItem = z.object({
	type: z.literal("search_results"),
	results: z.array(z.object({ url: z.string() })),
});

export type Answer = {
	text: string;
	citations: string[];
};

function answerOf(output: readonly unknown[]): Answer {
	const text = output
		.flatMap((item) => messageItem.safeParse(item).data?.content ?? [])
		.flatMap((part) =>
			part.type === "output_text" && part.text ? [part.text] : [],
		)
		.join("\n")
		.trim();

	const citations = [
		...new Set(
			output
				.flatMap(
					(item) => searchResultsItem.safeParse(item).data?.results ?? [],
				)
				.map((result) => result.url),
		),
	];

	return { text, citations };
}

type Outcome<T> = { ok: true; data: T } | { ok: false; reason: string };

export function perplexityEnabled(): boolean {
	return Boolean(process.env.PERPLEXITY_API_KEY);
}

export type AskOptions = {
	model?: "sonar" | "sonar-pro";
	domains?: string[];
	system?: string;
};

type AgentRequest = {
	effort: (typeof EFFORT)[keyof typeof EFFORT];
	input: string;
	instructions?: string;
	tools?: {
		type: "web_search";
		filters: { search_domain_filter: string[] };
	}[];
};

function requestFor(question: string, options: AskOptions): AgentRequest {
	const request: AgentRequest = {
		effort: EFFORT[options.model ?? "sonar"],
		input: question,
	};

	if (options.system) request.instructions = options.system;

	if (options.domains) {
		request.tools = [
			{
				type: "web_search",
				filters: { search_domain_filter: options.domains },
			},
		];
	}

	return request;
}

export async function ask(
	question: string,
	options: AskOptions = {},
): Promise<Outcome<Answer>> {
	const apiKey = process.env.PERPLEXITY_API_KEY;
	if (!apiKey) return { ok: false, reason: "No PERPLEXITY_API_KEY." };

	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

	try {
		const response = await fetch(ENDPOINT, {
			method: "POST",
			headers: {
				authorization: `Bearer ${apiKey}`,
				"content-type": "application/json",
			},
			signal: controller.signal,
			body: JSON.stringify(requestFor(question, options)),
		});

		if (!response.ok) {
			return { ok: false, reason: `HTTP ${response.status}` };
		}

		const body = agentResponse.safeParse(await response.json());
		if (!body.success) {
			return { ok: false, reason: "Unreadable Perplexity answer." };
		}

		const answer = answerOf(body.data.output);
		if (!answer.text) {
			return { ok: false, reason: `Empty answer (${body.data.status}).` };
		}

		return { ok: true, data: answer };
	} catch (error) {
		const aborted = error instanceof Error && error.name === "AbortError";
		return {
			ok: false,
			reason: aborted
				? `Timed out after ${TIMEOUT_MS}ms.`
				: error instanceof Error
					? error.message
					: String(error),
		};
	} finally {
		clearTimeout(timer);
	}
}

export async function findProfileUrls(
	terms: string[],
	companyName: string,
): Promise<string[]> {
	const slugs: string[] = [];

	for (const term of terms) {
		const answer = await ask(
			`Find the LinkedIn profile of the person called "${term}" who works at ${companyName}. Reply with their profile URL only.`,
			{ domains: ["linkedin.com"] },
		);

		if (!answer.ok) continue;

		const haystack = [answer.data.text, ...answer.data.citations].join(" ");
		for (const match of haystack.matchAll(
			/linkedin\.com\/in\/([A-Za-z0-9\-_%]+)/g,
		)) {
			const slug = match[1];
			if (slug && !slugs.includes(slug)) slugs.push(slug);
		}

		if (slugs.length > 0) break;
	}

	return slugs;
}
