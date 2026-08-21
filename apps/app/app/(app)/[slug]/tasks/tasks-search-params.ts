import { createListSearchParams } from "@/components/data-table/list-search-params";

export const tasksSearchParams = createListSearchParams({
	defaultSort: "dueAt",
	defaultDir: "asc",
	tabId: "status",
	facetIds: ["due", "createdBy"] as const,
});
