import type { RouterInputs } from "@/lib/trpc/types";

type InstancesListInput = RouterInputs["instances"]["list"];

const INSTANCE_STATUSES = [
	"all",
	"DISCOVERED",
	"UNMANAGED",
	"PROVISIONING",
	"ACTIVE",
	"PAUSED",
	"DECOMMISSIONED",
	"FAILED",
] as const satisfies readonly NonNullable<InstancesListInput["status"]>[];

const INSTANCE_SORTS = [
	"updatedAt",
	"name",
	"status",
	"environment",
	"account",
] as const satisfies readonly NonNullable<InstancesListInput["sort"]>[];

const DIRECTIONS = ["asc", "desc"] as const satisfies readonly NonNullable<
	InstancesListInput["dir"]
>[];

export type InstancesSearchValues = {
	q: string;
	sort: string;
	dir: string;
	page: number;
	pageSize: number;
	status: string;
	environment: string;
	provider: string;
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

export function toInstancesListInput(
	values: InstancesSearchValues,
): InstancesListInput {
	return {
		q: values.q.trim(),
		sort: oneOf(values.sort, INSTANCE_SORTS, "updatedAt"),
		dir: oneOf(values.dir, DIRECTIONS, "desc"),
		page: values.page > 0 ? values.page : 1,
		pageSize: values.pageSize,
		status: oneOf(values.status, INSTANCE_STATUSES, "all"),
		environment: values.environment.trim() || "all",
		provider: values.provider.trim() || "all",
	};
}

export function instanceFocusHistory(open: boolean): "push" | "replace" {
	return open ? "push" : "replace";
}
