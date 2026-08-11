const SECOND_MS = 1_000;

export const SLACK = {
	request: {
		timeoutMs: 15 * SECOND_MS,
		maxAttempts: 3,
		retryUnitMs: SECOND_MS,
	},

	inventory: {
		pageSize: 200,
	},
} as const;
