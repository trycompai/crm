import { createListSearchParams } from "@/components/data-table/list-search-params";

export const segmentsSearchParams = createListSearchParams({
	defaultSort: "updatedAt",
	defaultDir: "desc",
});
