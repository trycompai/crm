import { createListSearchParams } from "@/components/data-table/list-search-params";

export const workSearchParams = createListSearchParams({
	defaultSort: "updatedAt",
	defaultDir: "desc",
	facetIds: [
		"state",
		"queue",
		"owner",
		"due",
		"urgency",
		"subjectType",
	] as const,
});
