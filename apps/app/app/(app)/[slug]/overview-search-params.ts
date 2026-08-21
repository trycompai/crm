import { createLoader, parseAsStringLiteral } from "nuqs/server";
import { SEARCH_PARAM } from "@/lib/search-param-keys";

export const OVERVIEW_SCOPES = ["me", "everyone"] as const;

export type OverviewScope = (typeof OVERVIEW_SCOPES)[number];

export const overviewParsers = {
	[SEARCH_PARAM.overview.scope]:
		parseAsStringLiteral(OVERVIEW_SCOPES).withDefault("me"),
};

export const loadOverviewSearchParams = createLoader(overviewParsers);
