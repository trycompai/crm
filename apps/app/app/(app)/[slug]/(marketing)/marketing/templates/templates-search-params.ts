import { createListSearchParams } from "@/components/data-table/list-search-params";

export const templatesSearchParams = createListSearchParams({
	defaultSort: "updatedAt",
	defaultDir: "desc",
});
