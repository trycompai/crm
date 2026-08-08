import { createListSearchParams } from "@/components/data-table/list-search-params";

export const clientsSearchParams = createListSearchParams({
	defaultSort: "name",
	defaultDir: "asc",
	tabId: "status",
});
