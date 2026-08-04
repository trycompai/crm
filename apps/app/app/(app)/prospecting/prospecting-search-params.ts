import { createListSearchParams } from "@/components/data-table/list-search-params";

export const prospectingSearchParams = createListSearchParams({
	defaultSort: "score",
	defaultDir: "desc",
	tabId: "status",
	facetIds: ["product"] as const,
});
