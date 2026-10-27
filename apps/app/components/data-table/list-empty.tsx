"use client";

import { TableEmpty } from "@crm/ui/components/table-empty";
import type { TableQueryState } from "@crm/ui/lib/table-query";
import { useQueryStates } from "nuqs";
import { NoSearchMatch } from "./list-search";
import { searchParsers } from "./list-search-params";

export function ListEmpty({
	query,
	noun,
	archived = false,
	blank,
}: {
	query: TableQueryState;
	noun: string;
	archived?: boolean;
	blank: { title: string; description: string };
}) {
	const [{ q }] = useQueryStates(searchParsers);

	if (q) return <NoSearchMatch query={q} noun={noun} />;

	if (archived) {
		return <p className="text-muted-foreground">No archived {noun}.</p>;
	}

	const filtered = Object.entries(query.filters).some(([id, values]) =>
		id === query.tabId ? query.tab !== "all" : values.length > 0,
	);

	if (filtered) {
		return (
			<p className="text-muted-foreground">No {noun} match these filters.</p>
		);
	}

	return <TableEmpty title={blank.title} description={blank.description} />;
}
