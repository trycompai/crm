import type { RouterInputs } from "@/lib/trpc/types";

type CustomerListInput = RouterInputs["customers"]["list"];

const CUSTOMER_STATUSES = [
	"all",
	"PROSPECT",
	"ACTIVE",
	"SUSPENDED",
	"CLOSED",
] as const satisfies readonly NonNullable<CustomerListInput["status"]>[];

const ONBOARDING_STATUSES = [
	"all",
	"DISCOVERY",
	"SYSTEMS",
	"DATA_ACCESS",
	"INGESTION",
	"READY",
	"LIVE",
] as const satisfies readonly NonNullable<
	CustomerListInput["onboardingStatus"]
>[];

const CUSTOMER_SORTS = [
	"name",
	"status",
	"company",
	"createdAt",
	"updatedAt",
	"owner",
] as const satisfies readonly NonNullable<CustomerListInput["sort"]>[];

const DIRECTIONS = ["asc", "desc"] as const satisfies readonly NonNullable<
	CustomerListInput["dir"]
>[];

export type CustomerSearchValues = {
	q: string;
	sort: string;
	dir: string;
	page: number;
	pageSize: number;
	status: string;
	onboardingStatus: string;
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

export function toCustomerListInput(
	values: CustomerSearchValues,
): CustomerListInput {
	return {
		q: values.q.trim(),
		sort: oneOf(values.sort, CUSTOMER_SORTS, "updatedAt"),
		dir: oneOf(values.dir, DIRECTIONS, "desc"),
		page: values.page > 0 ? values.page : 1,
		pageSize: values.pageSize,
		status: oneOf(values.status, CUSTOMER_STATUSES, "all"),
		onboardingStatus: oneOf(
			values.onboardingStatus,
			ONBOARDING_STATUSES,
			"all",
		),
		owner: values.owner.trim() || "all",
	};
}

export function customerFocusHistory(open: boolean): "push" | "replace" {
	return open ? "push" : "replace";
}
