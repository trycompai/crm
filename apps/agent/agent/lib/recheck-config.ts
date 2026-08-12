const DAY_MS = 24 * 60 * 60 * 1000;

export const RECHECK = {
	championDays: 14,
	namedDays: 90,
	emptyDays: 365,
	baselineDays: 30,
	minDays: 1,
	maxDays: 730,
	defaultBudget: 4,
} as const;

export const JOB_CHANGE = {
	ownerTaskDueDays: 2,
} as const;

export function daysFromNow(days: number, from = Date.now()): Date {
	return new Date(from + days * DAY_MS);
}
