"use client";

import { useQueryState } from "nuqs";
import { PageShellDescription, PageShellTitle } from "@/components/page-shell";
import { SEARCH_PARAM } from "@/lib/search-param-keys";
import { overviewParsers } from "./overview-search-params";

export function OverviewGreetingFallback() {
	return (
		<>
			<PageShellTitle>Welcome back</PageShellTitle>
			<PageShellDescription>
				What you have closed, what is still in play, and what needs you today.
			</PageShellDescription>
		</>
	);
}

export function OverviewGreeting() {
	const [scope] = useQueryState(
		SEARCH_PARAM.overview.scope,
		overviewParsers[SEARCH_PARAM.overview.scope],
	);

	return (
		<>
			<PageShellTitle>Welcome back</PageShellTitle>
			<PageShellDescription>
				{scope === "me"
					? "What you have closed, what is still in play, and what needs you today."
					: "What the team has closed, what is still in play, and what needs you today."}
			</PageShellDescription>
		</>
	);
}
