const SECOND_MS = 1_000;
const MINUTE_MS = 60 * SECOND_MS;

export const STALLED_DEALS = {
	auto: { everyMs: 15 * MINUTE_MS, cacheKey: "stalled-deals:auto" },
} as const;
