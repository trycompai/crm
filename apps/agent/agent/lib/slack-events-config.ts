const SECOND_MS = 1_000;
const MINUTE_MS = 60 * SECOND_MS;
const HOUR_MS = 60 * MINUTE_MS;

export const SLACK_EVENTS = {
	batch: 20,
	maxTextChars: 2_000,
	leaseMs: MINUTE_MS,
	retryUndeliveredForMs: 5 * MINUTE_MS,
	retryHeldForMs: 24 * HOUR_MS,
} as const;
