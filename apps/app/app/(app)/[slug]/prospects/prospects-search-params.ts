import { createListSearchParams } from "@/components/data-table/list-search-params";

export const prospectsSearchParams = createListSearchParams({
	defaultSort: "fitScore",
	defaultDir: "desc",
	facetIds: ["countryCode", "status", "routeStatus", "contact"] as const,
});
