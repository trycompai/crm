const DAY_MS = 86_400_000;

export const STALLED_DEAL = {
	kind: "stalled-deal",
	inactiveDays: 14,
	maxPerRun: 100,
	source: "stalled-deal",
	subjectPrefix: "Re-engage:",
} as const;

export type StalledDealInput = {
	lastActivityAt: Date | null;
	createdAt: Date;
	now: Date;
	inactiveDays?: number;
};

export function stallCutoff(
	now: Date,
	inactiveDays: number = STALLED_DEAL.inactiveDays,
): Date {
	return new Date(now.getTime() - Math.max(inactiveDays, 0) * DAY_MS);
}

export function activityAnchor(
	lastActivityAt: Date | null,
	createdAt: Date,
): Date {
	return lastActivityAt ?? createdAt;
}

export function daysInactive(input: StalledDealInput): number {
	const anchor = activityAnchor(input.lastActivityAt, input.createdAt);
	return Math.max(
		0,
		Math.floor((input.now.getTime() - anchor.getTime()) / DAY_MS),
	);
}

export function isStalledDeal(input: StalledDealInput): boolean {
	const inactiveDays = input.inactiveDays ?? STALLED_DEAL.inactiveDays;
	const anchor = activityAnchor(input.lastActivityAt, input.createdAt);
	return anchor.getTime() <= stallCutoff(input.now, inactiveDays).getTime();
}

export function stallReason(dealName: string, days: number): string {
	const label = dealName.trim() || "Untitled deal";
	if (days <= 0) {
		return `${label} has no recent activity.`;
	}
	return `${label} has had no activity for ${days} day${days === 1 ? "" : "s"}.`;
}

export function stallTaskSubject(dealName: string): string {
	const label = dealName.trim() || "Untitled deal";
	return `${STALLED_DEAL.subjectPrefix} ${label}`;
}
