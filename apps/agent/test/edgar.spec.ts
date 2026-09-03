import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import {
	companyUrl,
	compareCompensation,
	edgarEnabled,
	getCompany,
	getProxy,
	health,
	listFilings,
	listOwners,
	searchCompanies,
} from "../agent/lib/edgar";
import { EDGAR } from "../agent/lib/edgar-config";

const realFetch = globalThis.fetch;
const savedUrl = process.env[EDGAR.env.url];
const savedSecret = process.env[EDGAR.env.secret];
const requests: { url: URL; headers: Record<string, string> }[] = [];

function replies(answer: (url: URL) => { status?: number; json: string }) {
	globalThis.fetch = (async (input: URL | RequestInfo, init?: RequestInit) => {
		const url = new URL(String(input instanceof Request ? input.url : input));
		const headers: Record<string, string> = {};
		for (const [key, value] of Object.entries(init?.headers ?? {})) {
			headers[key] = String(value);
		}
		requests.push({ url, headers });
		const { status, json } = answer(url);
		return new Response(json, {
			status: status ?? 200,
			headers: { "content-type": "application/json" },
		});
	}) as typeof fetch;
}

const COMPANY = {
	cik: "320193",
	name: "Apple Inc.",
	tickers: ["AAPL"],
	exchanges: ["Nasdaq"],
	sic: "3571",
	sicDescription: "Electronic Computers",
	stateOfIncorporation: "CA",
	fiscalYearEnd: "0926",
	category: "Large accelerated filer",
	businessAddress: {
		street: "ONE APPLE PARK WAY",
		city: "CUPERTINO",
		state: "CA",
		zip: "95014",
	},
	website: null,
	formerNames: ["APPLE COMPUTER INC"],
	url: "https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=320193",
};

beforeEach(() => {
	requests.length = 0;
	process.env[EDGAR.env.url] = "http://edgar.test:2100/";
	process.env[EDGAR.env.secret] = "s3cret";
});

afterEach(() => {
	globalThis.fetch = realFetch;
	if (savedUrl === undefined) delete process.env[EDGAR.env.url];
	else process.env[EDGAR.env.url] = savedUrl;
	if (savedSecret === undefined) delete process.env[EDGAR.env.secret];
	else process.env[EDGAR.env.secret] = savedSecret;
});

describe("the edgar client", () => {
	it("is off without a URL, before any request", async () => {
		delete process.env[EDGAR.env.url];
		expect(edgarEnabled()).toBe(false);
		const result = await searchCompanies({ query: "apple" });
		expect(result.ok).toBe(false);
		expect(requests).toHaveLength(0);
	});

	it("sends the bearer secret and trims the trailing slash", async () => {
		replies(() => ({ json: JSON.stringify({ companies: [] }) }));
		await searchCompanies({ query: "apple", limit: 3 });
		expect(requests[0]?.url.toString()).toBe(
			"http://edgar.test:2100/companies/search?q=apple&limit=3",
		);
		expect(requests[0]?.headers.authorization).toBe("Bearer s3cret");
	});

	it("sends no authorization header without a secret", async () => {
		delete process.env[EDGAR.env.secret];
		replies(() => ({
			json: JSON.stringify({
				ok: true,
				version: "0.1.0",
				edgartools: "5.56.0",
				identitySet: true,
			}),
		}));
		const result = await health();
		expect(result.ok).toBe(true);
		expect(requests[0]?.headers.authorization).toBeUndefined();
	});

	it("parses a company and strips leading zeros from the CIK it asks for", async () => {
		replies(() => ({ json: JSON.stringify(COMPANY) }));
		const result = await getCompany({ cik: "0000320193" });
		expect(requests[0]?.url.pathname).toBe("/companies/320193");
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.data.sicDescription).toBe("Electronic Computers");
		expect(companyUrl(result.data.cik)).toBe(COMPANY.url);
	});

	it("reads a 404 on a record as the service's reason", async () => {
		replies(() => ({
			status: 404,
			json: JSON.stringify({ reason: "No SEC filer matches ZZZZ." }),
		}));
		const result = await getCompany({ ticker: "zzzz" });
		expect(result).toEqual({ ok: false, reason: "No SEC filer matches ZZZZ." });
	});

	it("reads a 404 on a list as an empty list", async () => {
		replies(() => ({ status: 404, json: "" }));
		const result = await listFilings({ cik: "320193", form: "10-K" });
		expect(result).toEqual({
			ok: true,
			data: { filings: [], truncated: false },
		});
	});

	it("reports another failure as HTTP status", async () => {
		replies(() => ({
			status: 502,
			json: JSON.stringify({ reason: "SEC down" }),
		}));
		const result = await listOwners({ cik: "320193" });
		expect(result).toEqual({ ok: false, reason: "HTTP 502" });
	});

	it("refuses a shape the service does not promise", async () => {
		replies(() => ({
			json: JSON.stringify({ owners: [{ filer: "X" }], filingsRead: 1 }),
		}));
		const result = await listOwners({ cik: "320193" });
		expect(result.ok).toBe(false);
		if (result.ok) return;
		expect(result.reason).toContain("Unreadable EDGAR service response");
	});

	it("passes the proxy through with its executives", async () => {
		const proxy = {
			accession: "0001308179-26-000008",
			filedAt: "2026-01-08",
			url: "https://www.sec.gov/Archives/edgar/data/320193/0001308179-26-000008-index.html",
			peo: {
				name: "Mr. Cook",
				totalComp: 74294811,
				actuallyPaidComp: 108423733,
			},
			neoAverage: { totalComp: 23812358, actuallyPaidComp: 34125743 },
			compensationByYear: [
				{
					fiscalYearEnd: "2025-09-27",
					peoTotalComp: 74294811,
					peoActuallyPaidComp: 108423733,
					neoAverageTotalComp: 23812358,
					neoAverageActuallyPaidComp: 34125743,
				},
			],
			payVsPerformance: [
				{
					fiscalYearEnd: "2025-09-27",
					peoActuallyPaidComp: 108423733,
					neoAverageActuallyPaidComp: 34125743,
					tsr: 233.88,
					peerTsr: 279.51,
					netIncome: 112010000000,
					selectedMeasureValue: 416161000000,
				},
			],
			executives: [
				{
					name: "Tim Cook",
					title: "CEO",
					year: 2025,
					salary: 3000000,
					bonus: null,
					stockAwards: 57535293,
					optionAwards: null,
					nonEquityIncentive: 12000000,
					otherCompensation: 1759518,
					total: 74294811,
				},
			],
			holders: [
				{ name: "The Vanguard Group", percentOfClass: 9.63, shares: null },
			],
			proposals: [
				{
					number: 1,
					description: "Election of Directors",
					type: "director_election",
				},
			],
			performanceMeasures: ["Net Sales", "Operating Income"],
			selectedMeasureName: "Net Sales",
			ceoPayRatio: { ceo: 74294811, medianEmployee: 139483, ratio: 533 },
			insiderTradingPolicyAdopted: true,
		};
		replies(() => ({ json: JSON.stringify(proxy) }));
		const result = await getProxy({ cik: "320193", years: 1 });
		expect(requests[0]?.url.search).toBe("?years=1");
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.data.executives[0]?.name).toBe("Tim Cook");
		expect(result.data.ceoPayRatio?.ratio).toBe(533);
	});

	it("joins tickers upper-cased for the comparison", async () => {
		replies(() => ({ json: JSON.stringify({ rows: [] }) }));
		await compareCompensation({ tickers: ["aapl", " msft "], years: 2 });
		expect(requests[0]?.url.search).toBe("?tickers=AAPL%2CMSFT&years=2");
	});

	it("reports a timeout as a reason", async () => {
		globalThis.fetch = ((_: URL | RequestInfo, init?: RequestInit) =>
			new Promise((_, reject) => {
				init?.signal?.addEventListener("abort", () => {
					const error = new Error("aborted");
					error.name = "AbortError";
					reject(error);
				});
			})) as typeof fetch;
		const original = EDGAR.timeoutMs;
		const result = await Promise.race([
			searchCompanies({ query: "apple" }),
			new Promise<{ ok: false; reason: string }>((resolve) =>
				setTimeout(
					() => resolve({ ok: false, reason: "test timed out first" }),
					original + 500,
				),
			),
		]);
		expect(result.ok).toBe(false);
	}, 60_000);
});
