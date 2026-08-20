"use client";

import type { SortDirection, TableQueryState } from "@crm/ui/lib/table-query";
import type { SavedViewFilters } from "@crm/validation/saved-view";
import { useQueryStates } from "nuqs";
import type {
	FieldFilters,
	ListInput,
	ListSearchParams,
	ListSearchValues,
} from "./list-search-params";

export type TableQuery<TTab extends string, TFacet extends string = never> = {
	query: TableQueryState;
	input: ListInput<TTab, TFacet>;
	setArchived: (value: boolean) => void;
	/** The current view, as a snapshot a saved view can be created from. */
	currentView: SavedViewFilters;
	/** Replaces every filter, sort, search and archived toggle in one shot. */
	applyView: (view: SavedViewFilters) => void;
};

const FIELD_FILTER_PREFIX = "field:";

/**
 * `ListSearchValues<TTab, TFacet>` is precise for callers with concrete
 * literal unions, but inside this generic hook TTab/TFacet are still
 * unresolved type parameters — a mapped type over them, intersected with the
 * fixed keys (`sort`, `fields`, …), makes TS conflate the branches when a
 * fixed key could theoretically also be a generic one. So internally this
 * hook reads/writes through a fully untyped `Record<string, unknown>` and
 * casts at each access; only the public return type promises precision.
 */
type RawValues = Record<string, unknown>;

type SetValues = (
	update: Partial<RawValues> | ((prev: RawValues) => Partial<RawValues>),
) => void;

export function useTableQuery<TTab extends string, TFacet extends string>(
	searchParams: ListSearchParams<TTab, TFacet>,
): TableQuery<TTab, TFacet> {
	const { parsers, config, toInput } = searchParams;
	const { defaultDir, pageSize, tabId, facetIds, facetDefaults } = config;

	const [state, rawSetState] = useQueryStates(parsers);
	const values = state as RawValues;
	const setValues = rawSetState as unknown as SetValues;

	const q = values.q as string;
	const sort = values.sort as string;
	const dir = values.dir as SortDirection;
	const rawPage = values.page as number;
	const page = rawPage > 0 ? rawPage : 1;
	const fields = values.fields as FieldFilters;
	const tab = tabId ? (values[tabId] as string) : "all";

	const filters: Record<string, string[]> = {};
	if (tabId) filters[tabId] = [tab];
	for (const id of facetIds ?? []) {
		filters[id] =
			(values[id] as string[] | undefined) ?? facetDefaults?.[id] ?? [];
	}
	for (const [key, selected] of Object.entries(fields)) {
		filters[`${FIELD_FILTER_PREFIX}${key}`] = selected;
	}

	const query: TableQueryState = {
		sort,
		dir,
		page,
		pageSize,
		tab,
		tabId,
		filters,
		toggleSort: (id) =>
			setValues((prev) =>
				prev.sort === id
					? { dir: prev.dir === "asc" ? "desc" : "asc", page: 1 }
					: { sort: id, dir: defaultDir, page: 1 },
			),
		setSort: (id) => setValues({ sort: id, page: 1 }),
		setDir: (nextDir) => setValues({ dir: nextDir, page: 1 }),
		setPage: (next) => setValues({ page: next }),
		setTab: (value) => {
			if (!tabId) return;
			setValues({ [tabId]: value, page: 1 });
		},
		setFilter: (id, selected) => {
			if (id.startsWith(FIELD_FILTER_PREFIX)) {
				const key = id.slice(FIELD_FILTER_PREFIX.length);
				const nextFields: FieldFilters = { ...fields };
				if (selected.length === 0) delete nextFields[key];
				else nextFields[key] = selected;
				setValues({ fields: nextFields, page: 1 });
				return;
			}

			setValues({ [id]: selected, page: 1 });
		},
	};

	const input = toInput({
		...values,
		q,
		sort,
		dir,
		page: rawPage,
		fields,
	} as unknown as ListSearchValues<TTab, TFacet>);

	const setArchived = (value: boolean) =>
		setValues({ archived: value, page: 1 });

	const currentView: SavedViewFilters = {
		q,
		sort,
		dir,
		archived: values.archived as boolean,
		filters,
	};

	const applyView = (view: SavedViewFilters) => {
		const update: RawValues = {
			q: view.q,
			sort: view.sort,
			dir: view.dir,
			archived: view.archived,
			page: 1,
		};

		for (const id of facetIds ?? []) update[id] = [];

		const nextFields: FieldFilters = {};
		for (const [key, selected] of Object.entries(view.filters)) {
			if (key.startsWith(FIELD_FILTER_PREFIX)) {
				nextFields[key.slice(FIELD_FILTER_PREFIX.length)] = selected;
			} else {
				update[key] = selected;
			}
		}
		update.fields = nextFields;

		setValues(update);
	};

	return { query, input, setArchived, currentView, applyView };
}
