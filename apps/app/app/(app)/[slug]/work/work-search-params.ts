import { createListSearchParams } from "@/components/data-table/list-search-params";

export const workSearchParams = createListSearchParams({
	defaultSort: "updatedAt",
	defaultDir: "desc",
	facetIds: ["state", "queue", "assignee", "due", "subjectType"] as const,
});
