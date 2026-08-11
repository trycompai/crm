import { createListSearchParams } from "@/components/data-table/list-search-params";

export const serviceSearchParams = createListSearchParams({
	defaultSort: "updatedAt",
	defaultDir: "desc",
	facetIds: ["status", "priority", "matchState", "queue", "customer"] as const,
});
