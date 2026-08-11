import type { RouterInputs } from "@/lib/trpc/types";

type MarketingListInput = RouterInputs["marketing"]["list"];

const MARKETING_STATUSES = [
	"all",
	"DRAFT",
	"ACTIVE",
	"PAUSED",
	"COMPLETED",
	"ARCHIVED",
] as const satisfies readonly NonNullable<MarketingListInput["status"]>[];

const MARKETING_SORTS = [
	"updatedAt",
	"name",
	"status",
	"channel",
	"startsAt",
	"budget",
] as const satisfies readonly NonNullable<MarketingListInput["sort"]>[];

const DIRECTIONS = ["asc", "desc"] as const satisfies readonly NonNullable<
	MarketingListInput["dir"]
>[];

export type MarketingSearchValues = {
	q: string;
	sort: string;
	dir: string;
	page: number;
	pageSize: number;
	status: string;
	channel: string;
	owner: string;
};

function oneOf<T extends string>(
	value: string,
	allowed: readonly T[],
	fallback: T,
): T {
	return allowed.some((candidate) => candidate === value)
		? (allowed.find((candidate) => candidate === value) ?? fallback)
		: fallback;
}

export function toMarketingListInput(
	values: MarketingSearchValues,
): MarketingListInput {
	return {
		q: values.q.trim(),
		sort: oneOf(values.sort, MARKETING_SORTS, "updatedAt"),
		dir: oneOf(values.dir, DIRECTIONS, "desc"),
		page: values.page > 0 ? values.page : 1,
		pageSize: values.pageSize,
		status: oneOf(values.status, MARKETING_STATUSES, "all"),
		channel: values.channel.trim() || "all",
		owner: values.owner.trim() || "all",
	};
}

export function marketingFocusHistory(open: boolean): "push" | "replace" {
	return open ? "push" : "replace";
}
