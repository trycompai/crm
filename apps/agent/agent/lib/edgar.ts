import {
	edgarCompany,
	edgarCompanySearch,
	edgarCompensationComparison,
	edgarFilingSearch,
	edgarFilings,
	edgarHealth,
	edgarInsiders,
	edgarOwners,
	edgarProxy,
} from "@crm/validation/edgar";
import type { z } from "zod";
import { EDGAR } from "./edgar-config";

export type Outcome<T> = { ok: true; data: T } | { ok: false; reason: string };

type Query = Record<string, string | number | undefined>;

export function edgarUrl(): string | null {
	const url = process.env[EDGAR.env.url]?.trim();
	return url ? url.replace(/\/+$/, "") : null;
}

export function edgarEnabled(): boolean {
	return edgarUrl() !== null;
}

function headers(): Record<string, string> {
	const secret = process.env[EDGAR.env.secret]?.trim();
	return secret
		? { accept: "application/json", authorization: `Bearer ${secret}` }
		: { accept: "application/json" };
}

export function companyUrl(cik: string): string {
	return `${EDGAR.browseUrl}${cik}`;
}

async function request<Shape extends z.ZodTypeAny>(
	path: string,
	query: Query,
	shape: Shape,
	notFound: z.infer<Shape> | null,
): Promise<Outcome<z.infer<Shape>>> {
	const base = edgarUrl();
	if (!base) return { ok: false, reason: `No ${EDGAR.env.url}.` };

	const url = new URL(`${base}${path}`);
	for (const [key, value] of Object.entries(query)) {
		if (value !== undefined) url.searchParams.set(key, String(value));
	}

	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), EDGAR.timeoutMs);

	try {
		const response = await fetch(url, {
			headers: headers(),
			signal: controller.signal,
		});

		if (response.status === 404) {
			if (notFound !== null) return { ok: true, data: notFound };
			return { ok: false, reason: await reasonOf(response) };
		}
		if (!response.ok) {
			return { ok: false, reason: `HTTP ${response.status}` };
		}

		const parsed = shape.safeParse(await response.json());
		return parsed.success
			? { ok: true, data: parsed.data }
			: {
					ok: false,
					reason: `Unreadable EDGAR service response: ${parsed.error.message}`,
				};
	} catch (error) {
		const aborted = error instanceof Error && error.name === "AbortError";
		return {
			ok: false,
			reason: aborted
				? `The EDGAR service timed out after ${EDGAR.timeoutMs}ms.`
				: error instanceof Error
					? error.message
					: String(error),
		};
	} finally {
		clearTimeout(timer);
	}
}

async function reasonOf(response: Response): Promise<string> {
	const text = await response.text();
	try {
		const parsed: { reason?: string } = JSON.parse(text);
		return parsed.reason ?? "Not found.";
	} catch {
		return text || "Not found.";
	}
}

function normalizeCik(value: string): string {
	return value.trim().replace(/^0+(?=\d)/, "");
}

export function health() {
	return request("/health", {}, edgarHealth, null);
}

export function searchCompanies(input: { query: string; limit?: number }) {
	return request(
		"/companies/search",
		{ q: input.query.trim(), limit: input.limit ?? EDGAR.search.defaultLimit },
		edgarCompanySearch,
		{ companies: [] },
	);
}

export function getCompany(input: { cik?: string; ticker?: string }) {
	const key = input.cik
		? normalizeCik(input.cik)
		: (input.ticker?.trim().toUpperCase() ?? "");
	return request(
		`/companies/${encodeURIComponent(key)}`,
		{},
		edgarCompany,
		null,
	);
}

export function listFilings(input: {
	cik: string;
	form?: string;
	from?: string;
	to?: string;
	limit?: number;
}) {
	return request(
		`/companies/${encodeURIComponent(normalizeCik(input.cik))}/filings`,
		{
			form: input.form?.trim() || undefined,
			from: input.from,
			to: input.to,
			limit: input.limit ?? EDGAR.filings.defaultLimit,
		},
		edgarFilings,
		{ filings: [], truncated: false },
	);
}

export function searchFilings(input: {
	query: string;
	form?: string;
	from?: string;
	to?: string;
	limit?: number;
}) {
	return request(
		"/filings/search",
		{
			q: input.query.trim(),
			form: input.form?.trim() || undefined,
			from: input.from,
			to: input.to,
			limit: input.limit ?? EDGAR.filings.defaultLimit,
		},
		edgarFilingSearch,
		{ filings: [], total: 0 },
	);
}

export function listOwners(input: {
	cik: string;
	minPercent?: number;
	form?: string;
	limit?: number;
}) {
	return request(
		`/companies/${encodeURIComponent(normalizeCik(input.cik))}/owners`,
		{
			minPercent: input.minPercent ?? EDGAR.owners.minPercent,
			form: input.form,
			limit: input.limit ?? EDGAR.owners.defaultLimit,
		},
		edgarOwners,
		{ owners: [], filingsRead: 0 },
	);
}

export function listInsiders(input: { cik: string; limit?: number }) {
	return request(
		`/companies/${encodeURIComponent(normalizeCik(input.cik))}/insiders`,
		{ limit: input.limit ?? EDGAR.insiders.defaultLimit },
		edgarInsiders,
		{ transactions: [] },
	);
}

export function getProxy(input: { cik: string; years?: number }) {
	return request(
		`/companies/${encodeURIComponent(normalizeCik(input.cik))}/proxy`,
		{ years: input.years ?? EDGAR.compensation.years },
		edgarProxy,
		null,
	);
}

export function compareCompensation(input: {
	tickers: readonly string[];
	years?: number;
}) {
	return request(
		"/compensation/compare",
		{
			tickers: input.tickers
				.map((ticker) => ticker.trim().toUpperCase())
				.filter(Boolean)
				.join(","),
			years: input.years ?? EDGAR.compensation.years,
		},
		edgarCompensationComparison,
		{ rows: [] },
	);
}
