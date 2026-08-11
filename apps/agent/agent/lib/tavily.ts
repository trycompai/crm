import { z } from "zod";

const resultSchema = z.object({
	title: z.string().default("Public source"),
	url: z.string().url(),
	content: z.string().default(""),
	score: z.number().optional(),
	published_date: z.string().nullable().optional(),
});

const responseSchema = z.object({
	results: z.array(z.unknown()).default([]),
});

export type TavilySearchOptions = {
	depth: "basic" | "advanced";
	maxResults: number;
	includeDomains?: string[];
};

export async function searchTavily(
	query: string,
	options: TavilySearchOptions,
	request: typeof fetch = fetch,
) {
	const key = process.env.TAVILY_API_KEY?.trim();
	if (!key) {
		return { ok: false as const, reason: "TAVILY_API_KEY is not configured." };
	}

	const response = await request("https://api.tavily.com/search", {
		method: "POST",
		headers: {
			authorization: `Bearer ${key}`,
			"content-type": "application/json",
		},
		body: JSON.stringify({
			query,
			search_depth: options.depth,
			max_results: options.maxResults,
			include_answer: false,
			include_raw_content: false,
			...(options.includeDomains?.length
				? { include_domains: options.includeDomains }
				: {}),
		}),
		signal: AbortSignal.timeout(20_000),
	});

	if (!response.ok) {
		return {
			ok: false as const,
			reason: `Tavily search returned ${response.status}.`,
		};
	}

	const data = responseSchema.parse(await response.json());
	return {
		ok: true as const,
		results: data.results.flatMap((candidate) => {
			const result = resultSchema.safeParse(candidate);
			if (!result.success) return [];
			return [
				{
					title: result.data.title,
					url: result.data.url,
					snippet: result.data.content,
					score: result.data.score ?? null,
					publishedDate: result.data.published_date ?? null,
				},
			];
		}),
	};
}
