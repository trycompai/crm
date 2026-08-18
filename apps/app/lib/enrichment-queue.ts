import { ENRICHMENT_PAGE_MAX } from "@crm/validation/enrichment-queue";

const SECOND_MS = 1_000;
const MINUTE_S = 60;
const HOUR_S = 60 * MINUTE_S;

export const NO_ELAPSED = "—";

export type QueueFooter = {
	more: number;
	action: "show-all" | "load-more" | "none";
};

export function queueFooter(input: {
	total: number;
	fetched: number;
	shown: number;
	limit: number;
}): QueueFooter {
	const more = Math.max(0, input.total - input.shown);
	if (more === 0) return { more: 0, action: "none" };

	if (input.fetched > input.shown) return { more, action: "show-all" };

	return {
		more,
		action: input.limit < ENRICHMENT_PAGE_MAX ? "load-more" : "none",
	};
}

export function formatElapsed(seconds: number): string {
	const whole = Math.max(0, Math.floor(seconds));
	const minutes = Math.floor((whole % HOUR_S) / MINUTE_S);
	const rest = whole % MINUTE_S;

	if (whole < HOUR_S) return `${minutes}:${pad(rest)}`;

	return `${Math.floor(whole / HOUR_S)}:${pad(minutes)}:${pad(rest)}`;
}

export function elapsedLabel(
	state: "running" | "queued" | "failed",
	startedAt: string | null,
	now: number,
): string {
	if (state === "queued" || startedAt === null) return NO_ELAPSED;

	const started = Date.parse(startedAt);
	if (Number.isNaN(started)) return NO_ELAPSED;

	return formatElapsed((now - started) / SECOND_MS);
}

function pad(value: number): string {
	return value.toString().padStart(2, "0");
}
