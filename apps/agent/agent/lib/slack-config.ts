const SECOND_MS = 1_000;
const MINUTE_MS = 60 * SECOND_MS;

export const SLACK = {
	request: {
		timeoutMs: 15 * SECOND_MS,
		maxAttempts: 3,
		retryUnitMs: SECOND_MS,
	},

	channel: {
		maxNameChars: 80,
	},

	inventory: {
		pageSize: 200,
		channelTypes: "public_channel,private_channel",
		staleMs: 15 * MINUTE_MS,
	},
} as const;
