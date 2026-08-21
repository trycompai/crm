import type { SortDirection } from "@crm/ui/lib/table-query";
import {
	createLoader,
	type GenericParserBuilder,
	type LoaderFunction,
	type ParserBuilder,
	parseAsBoolean,
	parseAsInteger,
	parseAsJson,
	parseAsNativeArrayOf,
	parseAsString,
	parseAsStringLiteral,
} from "nuqs/server";
import { z } from "zod";
import {
	assertUnreservedSearchParamKeys,
	SEARCH_PARAM,
} from "@/lib/search-param-keys";

const SORT_DIRECTIONS = ["asc", "desc"] as const;

type StringParser = ParserBuilder<string> & { defaultValue: string };
type ArrayParser = GenericParserBuilder<string[]> & { defaultValue: string[] };

const fieldFiltersSchema = z.record(z.string(), z.array(z.string()));

export type FieldFilters = z.infer<typeof fieldFiltersSchema>;

export const searchParsers = {
	[SEARCH_PARAM.list.q]: parseAsString.withDefault(""),
	[SEARCH_PARAM.list.page]: parseAsInteger
		.withDefault(1)
		.withOptions({ history: "push" }),
	[SEARCH_PARAM.list.fields]: parseAsJson<FieldFilters>(
		fieldFiltersSchema.parse,
	).withDefault({}),
	[SEARCH_PARAM.list.archived]: parseAsBoolean.withDefault(false),
};

type ListParsers<TTab extends string, TFacet extends string> = {
	q: StringParser;
	sort: StringParser;
	dir: ParserBuilder<SortDirection> & { defaultValue: SortDirection };
	page: ParserBuilder<number> & { defaultValue: number };
	fields: ParserBuilder<FieldFilters> & { defaultValue: FieldFilters };
	archived: ParserBuilder<boolean> & { defaultValue: boolean };
} & { [K in TTab]: StringParser } & { [K in TFacet]: ArrayParser };

export type ListSearchValues<TTab extends string, TFacet extends string> = {
	q: string;
	sort: string;
	dir: SortDirection;
	page: number;
	fields: FieldFilters;
	archived: boolean;
} & { [K in TTab]: string } & { [K in TFacet]: string[] };

export type ListInput<TTab extends string, TFacet extends string> = {
	q: string;
	sort: string;
	dir: SortDirection;
	page: number;
	pageSize: number;
	fields: FieldFilters;
	archived: boolean;
} & { [K in TTab]: string } & { [K in TFacet]: string[] };

export type ListTableConfig<TTab extends string, TFacet extends string> = {
	defaultSort?: string;
	defaultDir?: SortDirection;
	pageSize?: number;
	tabId?: TTab;
	facetIds?: readonly TFacet[];
	facetDefaults?: Partial<Record<TFacet, string[]>>;
};

export type ListSearchParams<TTab extends string, TFacet extends string> = {
	config: ListTableConfig<TTab, TFacet> & {
		defaultSort: string;
		defaultDir: SortDirection;
		pageSize: number;
	};
	parsers: ListParsers<TTab, TFacet>;
	load: LoaderFunction<ListParsers<TTab, TFacet>>;
	toInput: (values: ListSearchValues<TTab, TFacet>) => ListInput<TTab, TFacet>;
	defaultInput: () => ListInput<TTab, TFacet>;
};

export function createListSearchParams<
	TTab extends string = never,
	TFacet extends string = never,
>(config: ListTableConfig<TTab, TFacet> = {}): ListSearchParams<TTab, TFacet> {
	const {
		defaultSort = "",
		defaultDir = "asc",
		pageSize = 25,
		tabId,
		facetIds = [],
		facetDefaults,
	} = config;

	assertUnreservedSearchParamKeys(
		[...(tabId ? [tabId] : []), ...facetIds],
		"createListSearchParams",
	);

	const tabExtras: Record<string, StringParser> = {};
	if (tabId) tabExtras[tabId] = parseAsString.withDefault("all");

	const facetExtras: Record<string, ArrayParser> = {};
	for (const id of facetIds) {
		facetExtras[id] = parseAsNativeArrayOf(parseAsString).withDefault(
			facetDefaults?.[id] ?? [],
		);
	}

	const parsers = {
		...searchParsers,
		[SEARCH_PARAM.list.sort]: parseAsString.withDefault(defaultSort),
		[SEARCH_PARAM.list.dir]:
			parseAsStringLiteral(SORT_DIRECTIONS).withDefault(defaultDir),
		...tabExtras,
		...facetExtras,
	} as ListParsers<TTab, TFacet>;

	const defaults = Object.fromEntries(
		Object.entries(parsers).map(([key, parser]) => [key, parser.defaultValue]),
	) as ListSearchValues<TTab, TFacet>;

	const toInput = (values: ListSearchValues<TTab, TFacet>) => {
		const selectedTab: Record<string, string> = {};
		if (tabId) selectedTab[tabId] = values[tabId] ?? "all";

		const selectedFacets: Record<string, string[]> = {};
		for (const id of facetIds) {
			selectedFacets[id] = values[id] ?? facetDefaults?.[id] ?? [];
		}

		return {
			q: values.q.trim(),
			sort: values.sort,
			dir: values.dir,
			page: values.page > 0 ? values.page : 1,
			pageSize,
			fields: values.fields,
			archived: values.archived,
			...selectedTab,
			...selectedFacets,
		} as ListInput<TTab, TFacet>;
	};

	return {
		config: { ...config, defaultSort, defaultDir, pageSize },
		parsers,
		load: createLoader(parsers),
		toInput,
		defaultInput: () => toInput(defaults),
	};
}
