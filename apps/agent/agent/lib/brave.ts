const ENDPOINT = "https://api.search.brave.com/res/v1/web/search";
const TIMEOUT_MS = 20_000;

export type BraveHit = { title: string; url: string; description: string };

export async function braveSearch(
	query: string,
	count = 20,
): Promise<
	| { ok: true; data: BraveHit[]; costCents: number }
	| { ok: false; reason: string }
> {
	const apiKey = process.env.BRAVE_SEARCH_API_KEY?.trim();
	if (!apiKey) return { ok: false, reason: "No BRAVE_SEARCH_API_KEY." };

	const url = new URL(ENDPOINT);
	url.searchParams.set("q", query);
	url.searchParams.set("count", String(Math.min(Math.max(count, 1), 20)));
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

	try {
		const response = await fetch(url, {
			headers: { Accept: "application/json", "X-Subscription-Token": apiKey },
			signal: controller.signal,
		});
		if (!response.ok) return { ok: false, reason: `HTTP ${response.status}` };
		const body = (await response.json()) as {
			web?: {
				results?: { title?: string; url?: string; description?: string }[];
			};
		};
		return {
			ok: true,
			data: (body.web?.results ?? []).flatMap((hit) =>
				hit.url
					? [
							{
								title: hit.title ?? hit.url,
								url: hit.url,
								description: hit.description ?? "",
							},
						]
					: [],
			),
			costCents: 1,
		};
	} catch (error) {
		return {
			ok: false,
			reason: error instanceof Error ? error.message : String(error),
		};
	} finally {
		clearTimeout(timer);
	}
}
