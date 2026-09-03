const SECOND_MS = 1_000;
const MINUTE_MS = 60 * SECOND_MS;

export const CONTACT_DETAILS = {
	timeoutMs: 20 * SECOND_MS,
	minConfidence: 50,
	maxSources: 5,
	order: ["hunter", "apollo", "lusha", "dropcontact", "zoominfo", "website"],

	hunter: {
		baseUrl: "https://api.hunter.io/v2",
	},

	apollo: {
		baseUrl: "https://api.apollo.io/api/v1",
		confidence: { verified: 95, likely: 70, guessed: 55, unknown: 30 },
	},

	lusha: {
		baseUrl: "https://api.lusha.com",
		confidence: { work: 85, other: 60 },
	},

	dropcontact: {
		baseUrl: "https://api.dropcontact.io",
		pollMs: 3 * SECOND_MS,
		maxPolls: 10,
		confidence: { nominative: 90, catchAll: 55, other: 40 },
	},

	zoominfo: {
		baseUrl: "https://api.zoominfo.com",
		tokenTtlMs: 55 * MINUTE_MS,
		confidence: { matched: 80 },
	},

	website: {
		paths: [
			"/",
			"/contact",
			"/team",
			"/about",
			"/equipe",
			"/notre-equipe",
			"/a-propos",
			"/mentions-legales",
			"/legal",
			"/impressum",
		],
		maxPages: 8,
		maxBytes: 512 * 1024,
		timeoutMs: 6 * SECOND_MS,
		userAgent: "crm-contact-lookup/1 (+https://github.com/trycompai/crm)",
		confidence: { named: 75, phoneOnly: 40 },
	},
} as const;
