import { createListSearchParams } from "@/components/data-table/list-search-params";

export const recipientsSearchParams = createListSearchParams({
	defaultSort: "sentAt",
	defaultDir: "desc",
	facetIds: ["state"] as const,
});

export const enrolmentsSearchParams = createListSearchParams({
	defaultSort: "enrolledAt",
	defaultDir: "desc",
	facetIds: ["phase"] as const,
});
