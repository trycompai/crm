const SECOND_MS = 1_000;

export const EDGAR = {
	env: {
		url: "EDGAR_URL",
		secret: "EDGAR_SECRET",
	},
	timeoutMs: 45 * SECOND_MS,
	search: {
		defaultLimit: 10,
		maxLimit: 25,
	},
	filings: {
		defaultLimit: 20,
		maxLimit: 100,
	},
	owners: {
		minPercent: 5,
		defaultLimit: 20,
		maxLimit: 50,
	},
	insiders: {
		defaultLimit: 20,
		maxLimit: 100,
	},
	compensation: {
		years: 3,
		maxYears: 5,
		maxTickers: 10,
	},
	browseUrl: "https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=",
} as const;
