import type { RouterInputs } from "@/lib/trpc/types";

type ServiceListInput = RouterInputs["service"]["list"];

const SERVICE_STATUSES = [
	"all",
	"NEW",
	"OPEN",
	"PENDING_CUSTOMER",
	"PENDING_INTERNAL",
	"RESOLVED",
	"CLOSED",
] as const satisfies readonly NonNullable<ServiceListInput["status"]>[];

const SERVICE_PRIORITIES = [
	"all",
	"LOW",
	"NORMAL",
	"HIGH",
	"URGENT",
] as const satisfies readonly NonNullable<ServiceListInput["priority"]>[];

const SERVICE_MATCH_STATES = [
	"all",
	"UNMATCHED",
	"MATCH_PROPOSED",
	"MATCHED",
	"EXCLUDED",
] as const satisfies readonly NonNullable<ServiceListInput["matchState"]>[];

const SERVICE_SORTS = [
	"updatedAt",
	"openedAt",
	"dueAt",
	"status",
	"priority",
	"customer",
] as const satisfies readonly NonNullable<ServiceListInput["sort"]>[];

const DIRECTIONS = ["asc", "desc"] as const satisfies readonly NonNullable<
	ServiceListInput["dir"]
>[];

export type ServiceSearchValues = {
	q: string;
	sort: string;
	dir: string;
	page: number;
	pageSize: number;
	status: string;
	priority: string;
	matchState: string;
	queue: string;
	customer: string;
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

export function toServiceListInput(
	values: ServiceSearchValues,
): ServiceListInput {
	return {
		q: values.q.trim(),
		sort: oneOf(values.sort, SERVICE_SORTS, "updatedAt"),
		dir: oneOf(values.dir, DIRECTIONS, "desc"),
		page: values.page > 0 ? values.page : 1,
		pageSize: values.pageSize,
		status: oneOf(values.status, SERVICE_STATUSES, "all"),
		priority: oneOf(values.priority, SERVICE_PRIORITIES, "all"),
		matchState: oneOf(values.matchState, SERVICE_MATCH_STATES, "all"),
		queue: values.queue.trim() || "all",
		customer: values.customer.trim() || "all",
	};
}

export function serviceFocusHistory(open: boolean): "push" | "replace" {
	return open ? "push" : "replace";
}
