import { createListSearchParams } from "@/components/data-table/list-search-params";

export const marketingSearchParams = createListSearchParams({
	defaultSort: "updatedAt",
	defaultDir: "desc",
	facetIds: ["status", "channel", "owner"] as const,
});
