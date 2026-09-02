const SECOND_MS = 1_000;
const MINUTE_MS = 60 * SECOND_MS;

export const SLACK = {
	sync: {
		activeMs: 30 * SECOND_MS,
		stalledAfterMs: 3 * MINUTE_MS,
	},
	channels: {
		pageSize: 50,
		maxPageSize: 100,
	},
	inventory: {
		refillAfterMs: 15 * MINUTE_MS,
	},
} as const;

export const SLACK_SYNC_STATES = ["idle", "syncing", "stalled"] as const;

export type SlackSyncState = (typeof SLACK_SYNC_STATES)[number];
