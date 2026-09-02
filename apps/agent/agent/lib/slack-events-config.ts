const SECOND_MS = 1_000;
const MINUTE_MS = 60 * SECOND_MS;

export const SLACK_EVENTS = {
	batch: 20,
	maxTextChars: 2_000,
	leaseMs: MINUTE_MS,
} as const;
