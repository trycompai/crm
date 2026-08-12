const DAY_MS = 86_400_000;

export const DEAL_SCORE = {
	kind: "deal-score",
	min: 0,
	max: 100,
	summaryMax: 800,
	forecastMax: 2_000,
	maxPerRun: 100,
	rescoreAfterDays: 1,
} as const;

export function clampDealScore(score: number): number {
	if (!Number.isFinite(score)) return DEAL_SCORE.min;
	return Math.min(DEAL_SCORE.max, Math.max(DEAL_SCORE.min, Math.round(score)));
}

export function isValidDealScore(score: number): boolean {
	return (
		Number.isInteger(score) &&
		score >= DEAL_SCORE.min &&
		score <= DEAL_SCORE.max
	);
}

export function blankToNull(value: string | null | undefined): string | null {
	if (value === null || value === undefined) return null;
	const trimmed = value.trim();
	return trimmed.length > 0 ? trimmed : null;
}

export function effectiveForecastContext(
	forecastContext: string | null | undefined,
	forecastContextManual: string | null | undefined,
): string | null {
	const manual = blankToNull(forecastContextManual);
	if (manual !== null) return manual;
	return blankToNull(forecastContext);
}

export function scoreRescoreCutoff(
	now: Date,
	rescoreAfterDays: number = DEAL_SCORE.rescoreAfterDays,
): Date {
	return new Date(now.getTime() - Math.max(rescoreAfterDays, 0) * DAY_MS);
}

export function needsDealScore(input: {
	dealScoredAt: Date | null;
	now: Date;
	rescoreAfterDays?: number;
}): boolean {
	if (!input.dealScoredAt) return true;
	return (
		input.dealScoredAt.getTime() <=
		scoreRescoreCutoff(input.now, input.rescoreAfterDays).getTime()
	);
}
