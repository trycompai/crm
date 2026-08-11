const SECOND_MS = 1_000;

export const SLACK_CONNECTION = {
	sync: { pollMs: 3 * SECOND_MS },
} as const;
