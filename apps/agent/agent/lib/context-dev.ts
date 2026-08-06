import ContextDev from "context.dev";
import { APIError } from "context.dev/core/error";
import { contextDevKey } from "./capabilities";

export type Brand = {
	domain?: string | null;
	title?: string | null;
	description?: string | null;
	slogan?: string | null;
	email?: string | null;
	phone?: string | null;
	colors?: { hex?: string | null; name?: string | null }[] | null;
	logos?:
		| {
				url?: string | null;
				mode?: string | null;
				type?: string | null;
				colors?: { hex?: string | null; name?: string | null }[] | null;
		  }[]
		| null;
	socials?: { type?: string | null; url?: string | null }[] | null;
	address?: {
		city?: string | null;
		state_code?: string | null;
		country?: string | null;
		country_code?: string | null;
	} | null;
	industries?: {
		eic?: { industry?: string | null; subindustry?: string | null }[] | null;
	} | null;
	links?: {
		pricing?: string | null;
		careers?: string | null;
	} | null;
};

export type LookupResult =
	| { outcome: "found"; brand: Brand; raw: unknown }
	| { outcome: "skipped"; reason: string }
	| { outcome: "failed"; reason: string; retryable: boolean };

export type SearchResult = {
	url: string | null;
	title: string | null;
	description: string | null;
	markdown: string | null;
};

const TIMEOUT_MS = 60_000;

let client: { key: string; api: ContextDev } | null = null;

async function contextDev(): Promise<ContextDev | null> {
	const key = await contextDevKey();

	if (!key) {
		client = null;
		return null;
	}

	if (client?.key !== key) {
		client = { key, api: new ContextDev({ apiKey: key }) };
	}

	return client.api;
}

export async function contextDevEnabled(): Promise<boolean> {
	return (await contextDevKey()) !== null;
}

export type KeyCheck =
	| { outcome: "valid" }
	| { outcome: "invalid"; reason: string }
	| { outcome: "unknown"; reason: string };

/**
 * A free-provider address is refused with a documented 422 before any brand is
 * resolved, and a lookup that resolves nothing is not billed — so this proves
 * the key authenticates without spending a credit.
 */
const PROBE_EMAIL = "key-check@gmail.com";

const VERIFY_TIMEOUT_MS = 15_000;

export async function verifyKey(key: string): Promise<KeyCheck> {
	const api = new ContextDev({ apiKey: key });

	try {
		await api.brand.retrieve({
			type: "by_email",
			email: PROBE_EMAIL,
			timeoutMS: VERIFY_TIMEOUT_MS,
		});

		return { outcome: "valid" };
	} catch (error) {
		return classifyKey(error);
	}
}

export function classifyKey(error: unknown): KeyCheck {
	if (!(error instanceof APIError)) {
		return { outcome: "unknown", reason: describe(error) };
	}

	if (error.status === undefined) {
		return { outcome: "unknown", reason: describe(error) };
	}

	if (error.status === 401 && !recognisedKeyFailure(error)) {
		return {
			outcome: "invalid",
			reason: "Context did not recognise that API key.",
		};
	}

	return { outcome: "valid" };
}

export async function brandByDomain(
	domain: string,
	maxAgeMs?: number,
): Promise<LookupResult> {
	return lookup({
		type: "by_domain",
		domain,
		timeoutMS: TIMEOUT_MS,
		...(maxAgeMs === undefined ? {} : { maxAgeMs }),
	});
}

export async function brandByEmail(email: string): Promise<LookupResult> {
	return lookup({ type: "by_email", email, timeoutMS: TIMEOUT_MS });
}

export async function prefetch(domain: string): Promise<void> {
	const api = await contextDev();
	if (!api) return;

	try {
		await api.utility.prefetch({ type: "brand", identifier: { domain } });
	} catch {}
}

export async function extract(
	url: string,
	schema: Record<string, unknown>,
	instructions: string,
): Promise<
	{ outcome: "found"; data: unknown } | { outcome: "failed"; reason: string }
> {
	const api = await contextDev();
	if (!api) {
		return { outcome: "failed", reason: "Context.dev is not configured." };
	}

	try {
		const response = await api.web.extract({
			url,
			schema,
			instructions,
			maxPages: 8,
			timeoutMS: TIMEOUT_MS,
		});
		return { outcome: "found", data: response.data };
	} catch (error) {
		return { outcome: "failed", reason: describe(error) };
	}
}

export async function search(
	query: string,
	options: { limit?: number; excludeDomains?: string[] } = {},
): Promise<
	| { outcome: "found"; results: SearchResult[] }
	| { outcome: "failed"; reason: string }
> {
	const api = await contextDev();
	if (!api) {
		return { outcome: "failed", reason: "Context.dev is not configured." };
	}

	try {
		const response = await api.web.search({
			query,
			numResults: Math.max(options.limit ?? 10, 10),
			markdownOptions: { enabled: true },
			...(options.excludeDomains
				? { excludeDomains: options.excludeDomains }
				: {}),
		});

		const results = (response.results ?? []).map((result) => ({
			url: result.url ?? null,
			title: result.title ?? null,
			description: result.description ?? null,
			markdown:
				result.markdown?.code === "SUCCESS"
					? (result.markdown.markdown ?? null)
					: null,
		}));

		return { outcome: "found", results };
	} catch (error) {
		return { outcome: "failed", reason: describe(error) };
	}
}

async function lookup(
	params: Parameters<ContextDev["brand"]["retrieve"]>[0],
): Promise<LookupResult> {
	const api = await contextDev();
	if (!api) {
		return { outcome: "skipped", reason: "Context.dev is not configured." };
	}

	try {
		const response = await api.brand.retrieve(params);
		const brand = response.brand as Brand | undefined;

		if (!brand) return { outcome: "skipped", reason: "No brand matched." };

		return { outcome: "found", brand, raw: response };
	} catch (error) {
		return classify(error);
	}
}

function classify(error: unknown): LookupResult {
	if (!(error instanceof APIError)) {
		return { outcome: "failed", reason: describe(error), retryable: true };
	}

	const code = errorCode(error);

	if (error.status === 400) {
		if (code === "NOT_FOUND" || code === "WEBSITE_ACCESS_ERROR") {
			return {
				outcome: "skipped",
				reason:
					code === "NOT_FOUND"
						? "No brand matched this domain."
						: "The site could not be reached.",
			};
		}
		return { outcome: "failed", reason: describe(error), retryable: false };
	}

	if (error.status === 422) {
		return {
			outcome: "skipped",
			reason: "That is a personal or disposable email address.",
		};
	}

	if (error.status === 401 || error.status === 403) {
		return { outcome: "failed", reason: describe(error), retryable: false };
	}

	if (error.status === 408 || error.status === 429) {
		return { outcome: "failed", reason: describe(error), retryable: true };
	}

	return {
		outcome: "failed",
		reason: describe(error),
		retryable: (error.status ?? 500) >= 500,
	};
}

function errorCode(error: APIError): string | undefined {
	const body = error.error as { error_code?: unknown } | undefined;
	return typeof body?.error_code === "string" ? body.error_code : undefined;
}

function recognisedKeyFailure(error: APIError): boolean {
	const body = error.error as
		| { error_code?: unknown; message?: unknown }
		| undefined;
	const detail = [body?.error_code, body?.message, error.message]
		.filter((value): value is string => typeof value === "string")
		.join(" ");

	return /(usage|credit|quota|allowance|billing|rate.?limit|limit.?exceeded|insufficient.?permission)/i.test(
		detail,
	);
}

function describe(error: unknown): string {
	if (error instanceof APIError) {
		return `${error.status ?? "?"} ${errorCode(error) ?? error.message}`;
	}
	return error instanceof Error ? error.message : String(error);
}
