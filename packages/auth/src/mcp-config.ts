const SECOND_MS = 1_000;
const MINUTE_MS = 60 * SECOND_MS;
const HOUR_MS = 60 * MINUTE_MS;

export const MCP_AUTH = {
	request: {
		timeoutMs: 10 * SECOND_MS,
		maxBodyBytes: 64 * 1_024,
	},
	state: {
		expiresMs: HOUR_MS,
	},
	token: {
		refreshMarginMs: MINUTE_MS,
		unknownExpiryMs: 5 * MINUTE_MS,
	},
} as const;
