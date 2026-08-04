import { createListSearchParams } from "@/components/data-table/list-search-params";

export const ssoSearchParams = createListSearchParams({
	defaultSort: "providerId",
	defaultDir: "asc",
});
