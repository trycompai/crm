const BASE = "https://api.hunter.io/v2";
const TIMEOUT_MS = 20_000;

export type HunterCompany = {
	name: string;
	domain: string | null;
	description: string;
	countryCode: string | null;
};

export type HunterContact = {
	name: string;
	email: string;
	title: string | null;
	verification: string | null;
	sources: string[];
};

export async function discoverCompanies(
	query: string,
	limit: number,
): Promise<
	{ ok: true; data: HunterCompany[] } | { ok: false; reason: string }
> {
	return request(
		"/discover",
		{},
		(body) => {
			const rows = object(body).data;
			const companies = Array.isArray(rows)
				? rows
				: array(object(rows).companies);
			return companies.slice(0, Math.min(limit, 100)).flatMap((entry) => {
				const row = object(entry);
				const name =
					string(row.organization) ?? string(row.name) ?? string(row.company);
				if (!name) return [];
				return [
					{
						name,
						domain: string(row.domain),
						description: string(row.description) ?? string(row.industry) ?? "",
						countryCode: string(row.country_code)?.toUpperCase() ?? null,
					},
				];
			});
		},
		{ query },
	);
}

export async function contactsByDomain(
	domain: string,
): Promise<
	{ ok: true; data: HunterContact[] } | { ok: false; reason: string }
> {
	return request("/domain-search", { domain, limit: "10" }, (body) => {
		const data = object(object(body).data);
		return array(data.emails).flatMap((entry) => {
			const row = object(entry);
			const email = string(row.value);
			if (!email) return [];
			const first = string(row.first_name);
			const last = string(row.last_name);
			return [
				{
					name: [first, last].filter(Boolean).join(" ") || email,
					email,
					title: string(row.position),
					verification: string(object(row.verification).status),
					sources: array(row.sources).flatMap((source) => {
						const uri = string(object(source).uri);
						return uri ? [uri] : [];
					}),
				},
			];
		});
	});
}

async function request<T>(
	path: string,
	params: Record<string, string>,
	parse: (body: unknown) => T,
	body?: Record<string, unknown>,
): Promise<{ ok: true; data: T } | { ok: false; reason: string }> {
	const apiKey = process.env.HUNTER_API_KEY?.trim();
	if (!apiKey) return { ok: false, reason: "No HUNTER_API_KEY." };
	const url = new URL(`${BASE}${path}`);
	for (const [key, value] of Object.entries(params))
		url.searchParams.set(key, value);
	url.searchParams.set("api_key", apiKey);
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
	try {
		const response = await fetch(url, {
			method: body ? "POST" : "GET",
			headers: body ? { "Content-Type": "application/json" } : undefined,
			body: body ? JSON.stringify(body) : undefined,
			signal: controller.signal,
		});
		if (!response.ok) return { ok: false, reason: `HTTP ${response.status}` };
		return { ok: true, data: parse(await response.json()) };
	} catch (error) {
		return {
			ok: false,
			reason: error instanceof Error ? error.message : String(error),
		};
	} finally {
		clearTimeout(timer);
	}
}

function object(value: unknown): Record<string, unknown> {
	return value && typeof value === "object" && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: {};
}
function array(value: unknown): unknown[] {
	return Array.isArray(value) ? value : [];
}
function string(value: unknown): string | null {
	return typeof value === "string" && value.trim() ? value.trim() : null;
}
