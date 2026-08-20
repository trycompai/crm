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

export function splitSentinel(values: string[], sentinel: string) {
	const ids = values.filter((value) => value !== sentinel);
	return { ids, includesSentinel: ids.length !== values.length };
}

export function ownerFilter<
	TWhere =
		| { ownerId: { in: string[] } }
		| { ownerId: null }
		| { OR: unknown[] },
>(values: string[]): TWhere | undefined {
	if (values.length === 0) return undefined;

	const { ids, includesSentinel } = splitSentinel(values, FACET_UNASSIGNED);
	if (includesSentinel && ids.length === 0) return { ownerId: null } as TWhere;
	if (!includesSentinel) return { ownerId: { in: ids } } as TWhere;
	return { OR: [{ ownerId: { in: ids } }, { ownerId: null }] } as TWhere;
}

export function archivedFilter(archived: boolean) {
	return { archivedAt: archived ? { not: null } : null };
}

export const ACTIVITY_WINDOWS = ["7", "30", "90"] as const;

export type ActivityWindow = (typeof ACTIVITY_WINDOWS)[number];

const activityWindowSet: ReadonlySet<string> = new Set(ACTIVITY_WINDOWS);

export const activityFacetInput = z
	.array(z.string())
	.refine((values) => values.every((value) => activityWindowSet.has(value)), {
		message: `Activity must be one of: ${ACTIVITY_WINDOWS.join(", ")}.`,
	});

function activityCutoff(days: number): Date {
	return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
}

export function activityFilter(
	values: string[],
): { lastActivityAt: { gte: Date } } | undefined {
	if (values.length === 0) return undefined;
	const days = values.reduce((max, value) => Math.max(max, Number(value)), 0);
	return { lastActivityAt: { gte: activityCutoff(days) } };
}

export async function activityFacetCounts(
	countWhere: (where: { lastActivityAt: { gte: Date } }) => Promise<number>,
): Promise<FacetCount> {
	const counts = await Promise.all(
		ACTIVITY_WINDOWS.map((days) =>
			countWhere({ lastActivityAt: { gte: activityCutoff(Number(days)) } }),
		),
	);
	return Object.fromEntries(
		ACTIVITY_WINDOWS.map((days, index) => [days, counts[index]]),
	) as FacetCount;
}
