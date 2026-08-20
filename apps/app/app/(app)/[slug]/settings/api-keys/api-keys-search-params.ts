import { createListSearchParams } from "@/components/data-table/list-search-params";

export const apiKeysSearchParams = createListSearchParams({
	defaultSort: "createdAt",
	defaultDir: "desc",
});
