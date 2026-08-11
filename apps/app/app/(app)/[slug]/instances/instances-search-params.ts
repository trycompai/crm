import { createListSearchParams } from "@/components/data-table/list-search-params";

export const instancesSearchParams = createListSearchParams({
	defaultSort: "updatedAt",
	defaultDir: "desc",
	facetIds: ["status", "environment", "provider"] as const,
});
