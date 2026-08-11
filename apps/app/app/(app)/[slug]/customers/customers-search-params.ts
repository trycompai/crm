import { createListSearchParams } from "@/components/data-table/list-search-params";

export const customersSearchParams = createListSearchParams({
	defaultSort: "updatedAt",
	defaultDir: "desc",
	facetIds: ["status", "onboardingStatus", "owner"] as const,
});
