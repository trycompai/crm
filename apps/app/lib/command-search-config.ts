import { QUICK_SEARCH } from "@crm/validation/search-config";

const SECOND_MS = 1_000;

export const COMMAND_SEARCH = {
	query: { ...QUICK_SEARCH.query, debounceMs: 0.15 * SECOND_MS },
	results: QUICK_SEARCH.results,
	recents: { limit: 5 },
} as const;
