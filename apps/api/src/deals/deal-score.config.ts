const HOUR_MS = 60 * 60 * 1_000;
const DAY_MS = 24 * HOUR_MS;

export const DEAL_SCORE_SWEEP = {
	auto: { everyMs: DAY_MS, cacheKey: "deal-score:auto" },
} as const;
