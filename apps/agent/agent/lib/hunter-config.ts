const SECOND_MS = 1_000;

export const HUNTER = {
	api: {
		baseUrl: "https://api.hunter.io/v2",
		timeoutMs: 20 * SECOND_MS,
	},
	minScore: 50,
	maxSources: 5,
} as const;
