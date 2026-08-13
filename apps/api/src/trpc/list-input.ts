import { z } from "zod";

export const listInput = z.object({
	q: z.string().default(""),
	sort: z.string().default(""),
	dir: z.enum(["asc", "desc"]).default("asc"),
	page: z.number().int().min(1).default(1),
	pageSize: z.number().int().min(1).max(100).default(25),
});

export type ListInput = z.infer<typeof listInput>;

export type FacetCount = Record<string, number>;

type FacetCounts = Record<string, FacetCount>;

export type ListResult<TRow> = {
	rows: TRow[];
	total: number;
	facetCounts: FacetCounts;
};

export type Page = {
	skip: number;
	take: number;
};

export function paginate(input: Pick<ListInput, "page" | "pageSize">): Page {
	return {
		skip: (input.page - 1) * input.pageSize,
		take: input.pageSize,
	};
}

export type SortDirection = ListInput["dir"];

export interface OrderByColumns<TOrderBy> {
	[column: string]: (dir: SortDirection) => TOrderBy;
}

export function resolveOrderBy<TOrderBy>(
	input: Pick<ListInput, "sort" | "dir">,
	columns: OrderByColumns<TOrderBy>,
	fallback: TOrderBy,
): TOrderBy {
	const column = columns[input.sort];
	return column ? column(input.dir) : fallback;
}

export function countsByKey<
	TKey extends string,
	TGroup extends { _count: { _all: number } } & {
		[K in TKey]?: string | null;
	},
>(groups: TGroup[], key: TKey, nullKey?: string): FacetCount {
	const counts: FacetCount = {};

	for (const group of groups) {
		const value = group[key] ?? nullKey;
		if (value == null) continue;
		counts[value] = (counts[value] ?? 0) + group._count._all;
	}

	return counts;
}

export const FACET_ALL = "all";

export const FACET_UNASSIGNED = "unassigned";

export function ownerFilter(
	value: string,
): { ownerId: string | null } | undefined {
	if (value === FACET_ALL) return undefined;
	return { ownerId: value === FACET_UNASSIGNED ? null : value };
}
