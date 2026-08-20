"use client";

import type { SortDirection, TableQueryState } from "@crm/ui/lib/table-query";
import type { SavedViewFilters } from "@crm/validation/saved-view";
import type { Nullable, Values } from "nuqs";
import { useQueryStates } from "nuqs";
import { z } from "zod";
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
	currentView: SavedViewFilters;
	applyView: (view: SavedViewFilters) => void;
};

const FIELD_FILTER_PREFIX = "field:";

const fieldFiltersValueSchema = z.record(z.string(), z.array(z.string()));

const queryValueSchema = z.union([
	z.string(),
	z.number(),
	z.boolean(),
	z.array(z.string()),
	fieldFiltersValueSchema,
	z.null(),
]);

type QueryValue = z.infer<typeof queryValueSchema>;

const rawValuesSchema = z
	.object({
		q: z.string().default(""),
		sort: z.string().default(""),
		dir: z.string().default("asc"),
		page: z.number().default(1),
		fields: fieldFiltersValueSchema.default({}),
		archived: z.boolean().default(false),
	})
	.catchall(queryValueSchema);

type RawUpdate = Record<string, QueryValue | undefined>;

const stringSchema = z.string();
const stringArraySchema = z.array(z.string());

function asString(value: QueryValue, fallback = ""): string {
	const result = stringSchema.safeParse(value);
	return result.success ? result.data : fallback;
}

function asStringArray(value: QueryValue): string[] {
	const result = stringArraySchema.safeParse(value);
	return result.success ? result.data : [];
}

export function useTableQuery<TTab extends string, TFacet extends string>(
	searchParams: ListSearchParams<TTab, TFacet>,
): TableQuery<TTab, TFacet> {
	const { parsers, config, toInput } = searchParams;
	const { defaultDir, pageSize, tabId, facetIds } = config;

	const [rawState, rawSetState] = useQueryStates(parsers);
	const values = rawValuesSchema.parse(rawState);

	type NuqsValues = Partial<Nullable<Values<typeof parsers>>>;

	function setValues(update: Partial<RawUpdate>): Promise<void> {
		return rawSetState(update as NuqsValues).then(() => undefined);
	}

	const q = values.q;
	const sort = values.sort;
	const dir = values.dir === "desc" ? "desc" : "asc";
	const rawPage = values.page;
	const page = rawPage > 0 ? rawPage : 1;
	const fields = values.fields;
	const archived = values.archived;
	const tab = tabId ? asString(values[tabId]) : "all";

	const filters: Record<string, string[]> = {};
	if (tabId) filters[tabId] = [tab];
	for (const id of facetIds ?? []) {
		filters[id] = asStringArray(values[id]);
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
			rawSetState((old) => {
				const current = rawValuesSchema.parse(old);
				const nextDir: SortDirection = current.dir === "asc" ? "desc" : "asc";
				const update: RawUpdate =
					current.sort === id
						? { dir: nextDir, page: 1 }
						: { sort: id, dir: defaultDir, page: 1 };
				return update as NuqsValues;
			}),
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
		q,
		sort,
		dir,
		page: rawPage,
		fields,
		archived,
		...Object.fromEntries(
			[...(tabId ? [tabId] : []), ...(facetIds ?? [])].map((id) => [
				id,
				id === tabId ? tab : (filters[id] ?? []),
			]),
		),
	} as ListSearchValues<TTab, TFacet>);

	const setArchived = (value: boolean) =>
		setValues({ archived: value, page: 1 });

	const currentView: SavedViewFilters = { q, sort, dir, archived, filters };

	const applyView = (view: SavedViewFilters) => {
		const update: RawUpdate = {
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
			} else if (key === tabId) {
				update[key] = selected[0] ?? "all";
			} else {
				update[key] = selected;
			}
		}
		update.fields = nextFields;

		setValues(update);
	};

	return { query, input, setArchived, currentView, applyView };
}
