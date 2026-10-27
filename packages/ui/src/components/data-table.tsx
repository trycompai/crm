"use client";

import { Button } from "@crm/ui/components/button";
import { Checkbox } from "@crm/ui/components/checkbox";
import {
	Command,
	CommandEmpty,
	CommandGroup,
	CommandInput,
	CommandItem,
	CommandList,
} from "@crm/ui/components/command";
import {
	DropdownMenu,
	DropdownMenuCheckboxItem,
	DropdownMenuContent,
	DropdownMenuGroup,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuRadioGroup,
	DropdownMenuRadioItem,
	DropdownMenuSeparator,
	DropdownMenuSub,
	DropdownMenuSubContent,
	DropdownMenuSubTrigger,
	DropdownMenuTrigger,
} from "@crm/ui/components/dropdown-menu";
import { useOverflowTooltip } from "@crm/ui/components/overflow-tooltip";
import { SkeletonLine } from "@crm/ui/components/skeleton-lines";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@crm/ui/components/table";
import { TablePagination } from "@crm/ui/components/table-pagination";
import { useMountEffect } from "@crm/ui/hooks/use-mount-effect";
import type { TableSelection } from "@crm/ui/hooks/use-table-selection";
import { ROW_ACCENT } from "@crm/ui/lib/row-accent";
import type { TableQueryState } from "@crm/ui/lib/table-query";
import { cn } from "@crm/ui/lib/utils";
import {
	ArrowDownIcon,
	ArrowUpDownIcon,
	ArrowUpIcon,
	ChevronDownIcon,
	ChevronRightIcon,
	Columns3Icon,
	LayoutListIcon,
	ListFilterIcon,
} from "lucide-react";
import { parseAsArrayOf, parseAsString, useQueryState } from "nuqs";
import {
	Fragment,
	type ReactNode,
	useDeferredValue,
	useId,
	useState,
} from "react";

export type ColumnWidth =
	| "px"
	| "12"
	| "14"
	| "24"
	| "28"
	| "32"
	| "36"
	| "40"
	| "42"
	| "44"
	| "56"
	| "64";

export type TableSize = "sm" | "md" | "lg" | "xl" | "2xl";

export type DataTableColumn<TRow> = {
	id: string;
	header: ReactNode;
	cell: (row: TRow) => ReactNode;
	label?: string;
	sortable?: boolean;
	width?: ColumnWidth | { sm: ColumnWidth };
	align?: "left" | "right" | "center";
	hideable?: boolean;
	defaultHidden?: boolean;
	hideBelow?: TableSize;
	lines?: 1 | 2;
};

export type DataTableFacet = {
	id: string;
	label: string;
	options: { value: string; label: string }[];
	searchable?: boolean;
	search?: string;
	onSearchChange?: (search: string) => void;
	stale?: boolean;
	empty?: ReactNode;
};

export type DataTableTabs = {
	id: string;
	label?: string;
	allLabel?: string;
	options: { value: string; label: string }[];
};

export type DataTableExpandable<TRow, TSub> = {
	isExpandable: (row: TRow) => boolean;
	getSubRows: (row: TRow) => TSub[];
	getSubRowId: (sub: TSub, row: TRow) => string;
	renderSubCell: (sub: TSub, columnId: string, row: TRow) => ReactNode;
	onSubRowClick?: (sub: TSub, row: TRow) => void;
};

export type DataTableSelection<TRow> = {
	state: TableSelection;
	actions: ReactNode;
	rowLabel?: (row: TRow) => string;
};

export type DataTableProps<TRow, TSub> = {
	query: TableQueryState;
	columns: DataTableColumn<TRow>[];
	getRowId: (row: TRow) => string;
	rows: TRow[];
	total: number;
	facetCounts?: Record<string, Record<string, number>>;
	loading?: boolean;
	facets?: DataTableFacet[];
	tabs?: DataTableTabs;
	onRowClick?: (row: TRow, orderedRows: readonly TRow[]) => void;
	onRowHover?: (row: TRow) => void;
	expandable?: DataTableExpandable<TRow, TSub>;
	selection?: DataTableSelection<TRow>;
	actions?: ReactNode;
	leadingActions?: ReactNode;
	search?: ReactNode;
	meta?: ReactNode;
	empty?: ReactNode;
	label?: string;
	className?: string;
};

type ColumnLayout = Pick<
	DataTableColumn<unknown>,
	"width" | "align" | "hideBelow" | "lines"
>;

function columnLayout({ width, align, hideBelow }: ColumnLayout) {
	return {
		"data-align": align,
		"data-hide-below": hideBelow,
		"data-width": typeof width === "string" ? width : undefined,
		"data-width-sm": typeof width === "object" ? width.sm : undefined,
	};
}

const COLUMN_LAYOUT_CLASS = cn(
	"data-[align=center]:text-center data-[align=right]:text-right data-[align=right]:tabular-nums",
	"data-[hide-below=sm]:hidden @xl/table:data-[hide-below=sm]:table-cell",
	"data-[hide-below=md]:hidden @3xl/table:data-[hide-below=md]:table-cell",
	"data-[hide-below=lg]:hidden @4xl/table:data-[hide-below=lg]:table-cell",
	"data-[hide-below=xl]:hidden @5xl/table:data-[hide-below=xl]:table-cell",
	"data-[hide-below=2xl]:hidden @6xl/table:data-[hide-below=2xl]:table-cell",
	"data-[width=px]:w-px data-[width=12]:w-12 data-[width=14]:w-14 data-[width=24]:w-24 data-[width=28]:w-28 data-[width=32]:w-32",
	"data-[width=36]:w-36 data-[width=40]:w-40 data-[width=42]:w-42 data-[width=44]:w-44 data-[width=56]:w-56 data-[width=64]:w-64",
	"@xl/table:data-[width-sm=px]:w-px @xl/table:data-[width-sm=12]:w-12 @xl/table:data-[width-sm=14]:w-14 @xl/table:data-[width-sm=24]:w-24 @xl/table:data-[width-sm=28]:w-28 @xl/table:data-[width-sm=32]:w-32",
	"@xl/table:data-[width-sm=36]:w-36 @xl/table:data-[width-sm=40]:w-40 @xl/table:data-[width-sm=42]:w-42 @xl/table:data-[width-sm=44]:w-44 @xl/table:data-[width-sm=56]:w-56 @xl/table:data-[width-sm=64]:w-64",
);

const COLUMN_HEAD_CLASS = cn(
	"h-10 overflow-hidden px-3 font-medium text-13 text-muted-foreground",
	COLUMN_LAYOUT_CLASS,
);

const COLUMN_CELL_CLASS = cn("overflow-hidden px-3", COLUMN_LAYOUT_CLASS);

const TABLE_CLASS =
	"table-fixed [&_td:first-child]:pl-4 [&_th:first-child]:pl-4 [&_td:last-child]:pr-4 [&_th:last-child]:pr-4";

const TABLE_CONTAINER_CLASS =
	"min-h-0 overflow-auto rounded-md bg-card shadow-border";

const TABLE_HEADER_CLASS =
	"sticky top-0 z-10 bg-card [&_th]:bg-card [&_tr]:border-0 [&_tr]:shadow-divider";

function TableFrame({
	label,
	overlay,
	children,
}: {
	label?: string;
	overlay: ReactNode;
	children: ReactNode;
}) {
	return (
		<section
			aria-label={label}
			data-slot="table-frame"
			onKeyUp={(event) => {
				if (event.key === "Tab") delete event.currentTarget.dataset.pointer;
			}}
			onPointerDown={(event) => {
				event.currentTarget.dataset.pointer = "";
			}}
			className={cn(
				"relative w-full outline-hidden focus-visible:not-data-pointer:outline-2 focus-visible:not-data-pointer:outline-solid focus-visible:not-data-pointer:outline-offset-0 focus-visible:not-data-pointer:outline-ring [&>[data-slot=table-container]]:overflow-visible",
				TABLE_CONTAINER_CLASS,
				overlay && "min-h-80",
			)}
			tabIndex={0}
		>
			{children}
			{overlay}
		</section>
	);
}

const TABLE_EMPTY_OVERLAY_CLASS =
	"absolute inset-0 flex items-center justify-center px-4 py-8 text-center";

const LOADING_ROW_COUNT = 5;

const NARROW_TABLE_COLUMNS = 3;

function LoadingRows({
	columns,
	selectable,
	expandable,
}: {
	columns: (ColumnLayout & { id: string })[];
	selectable: boolean;
	expandable: boolean;
}) {
	const detailColumn = Math.max(
		0,
		columns.findIndex((column) => !column.width),
	);

	return Array.from({ length: LOADING_ROW_COUNT }, (_, index) => (
		<TableRow
			className="hover:bg-transparent"
			data-slot="table-loading-row"
			key={index}
		>
			{selectable ? (
				<TableCell
					className={cn("w-10 px-3 py-3", COLUMN_LAYOUT_CLASS)}
					data-hide-below="sm"
				/>
			) : null}
			{expandable ? <TableCell className="w-10 px-3 py-3" /> : null}
			{columns.map((column, position) => (
				<TableCell
					key={column.id}
					{...columnLayout(column)}
					className={cn(COLUMN_CELL_CLASS, "py-3")}
				>
					<div
						className="flex min-h-5 flex-col justify-center gap-2 data-[align=right]:items-end"
						data-align={column.align}
					>
						<SkeletonLine width={column.width === "px" ? "24" : "two-thirds"} />
						{(column.lines ?? (position === detailColumn ? 2 : 1)) === 2 ? (
							<SkeletonLine size="sm" width="40" />
						) : null}
					</div>
				</TableCell>
			))}
		</TableRow>
	));
}

function columnLabel<TRow>(column: DataTableColumn<TRow>): string {
	if (column.label) return column.label;
	return typeof column.header === "string" ? column.header : column.id;
}

function SortIndicator({
	active,
	dir,
}: {
	active: boolean;
	dir: "asc" | "desc";
}) {
	return (
		<span className="text-muted-foreground">
			{active ? (
				dir === "asc" ? (
					<ArrowUpIcon size={12} />
				) : (
					<ArrowDownIcon size={12} />
				)
			) : (
				<ArrowUpDownIcon
					size={12}
					className="opacity-0 transition-opacity group-hover/button:opacity-40 group-focus-visible/button:opacity-40"
				/>
			)}
		</span>
	);
}

function toggle(selected: string[], value: string, checked: boolean): string[] {
	return checked ? [...selected, value] : selected.filter((v) => v !== value);
}

function FacetCount({
	counts,
	value,
}: {
	counts?: Record<string, number>;
	value: string;
}) {
	if (counts === undefined) return null;

	return (
		<span className="ml-2 shrink-0 text-13 text-muted-foreground tabular-nums">
			{counts[value] ?? 0}
		</span>
	);
}

function FacetSubmenu({
	facet,
	selected,
	counts,
	onChange,
}: {
	facet: DataTableFacet;
	selected: string[];
	counts?: Record<string, number>;
	onChange: (values: string[]) => void;
}) {
	return (
		<DropdownMenuSub>
			<DropdownMenuSubTrigger>
				<span className="flex-1">{facet.label}</span>
				{selected.length > 0 && (
					<span className="tabular-nums opacity-60">({selected.length})</span>
				)}
			</DropdownMenuSubTrigger>
			<DropdownMenuSubContent
				className={cn(
					"max-h-72 min-w-52 overflow-hidden",
					facet.searchable && "p-0",
				)}
				sideOffset={4}
			>
				{facet.searchable ? (
					<Command
						shouldFilter={facet.onSearchChange === undefined}
						className="max-h-72"
					>
						<CommandInput
							placeholder={`Search ${facet.label.toLowerCase()}…`}
							value={facet.search}
							onValueChange={facet.onSearchChange}
							onKeyDown={(event) => event.stopPropagation()}
						/>
						<CommandList>
							<CommandEmpty>{facet.empty ?? "Nothing matches."}</CommandEmpty>
							<CommandGroup>
								{facet.options.map((option) => {
									const checked = selected.includes(option.value);
									return (
										<CommandItem
											key={option.value}
											value={option.label}
											disabled={facet.stale}
											data-checked={checked}
											onSelect={() =>
												onChange(toggle(selected, option.value, !checked))
											}
										>
											<Checkbox
												checked={checked}
												className="pointer-events-none"
											/>
											<span className="flex-1 truncate">{option.label}</span>
											<FacetCount counts={counts} value={option.value} />
										</CommandItem>
									);
								})}
							</CommandGroup>
						</CommandList>
					</Command>
				) : (
					<div className="max-h-72 overflow-x-hidden overflow-y-auto">
						{selected.length > 0 && (
							<>
								<DropdownMenuGroup>
									<DropdownMenuItem onSelect={() => onChange([])}>
										Clear
									</DropdownMenuItem>
								</DropdownMenuGroup>
								<DropdownMenuSeparator />
							</>
						)}
						<DropdownMenuGroup>
							{facet.options.map((option) => {
								const checked = selected.includes(option.value);
								return (
									<DropdownMenuCheckboxItem
										key={option.value}
										checked={checked}
										onSelect={(event) => event.preventDefault()}
										onCheckedChange={(next) =>
											onChange(toggle(selected, option.value, next))
										}
									>
										<span className="flex-1 truncate">{option.label}</span>
										<FacetCount counts={counts} value={option.value} />
									</DropdownMenuCheckboxItem>
								);
							})}
						</DropdownMenuGroup>
					</div>
				)}
			</DropdownMenuSubContent>
		</DropdownMenuSub>
	);
}

function ReturnToPage({
	page,
	setPage,
}: {
	page: number;
	setPage: (page: number) => Promise<void>;
}) {
	useMountEffect(() => {
		void setPage(page);
	});

	return null;
}

function SelectionBar<TRow>({
	selection,
	selecting,
}: {
	selection: DataTableSelection<TRow>;
	selecting: boolean;
}) {
	return (
		<div
			aria-hidden={!selecting}
			className={cn(
				"col-start-1 row-start-1 flex h-9 items-center gap-2 self-start",
				!selecting && "invisible",
			)}
			inert={!selecting}
		>
			<span className="truncate text-13 text-muted-foreground">
				<span className="font-medium text-foreground tabular-nums">
					{selection.state.count}
				</span>{" "}
				selected
			</span>
			<div className="ml-auto flex items-center gap-2">
				{selection.actions}
				<Button
					variant="ghost"
					size="sm"
					onClick={() => selection.state.clear()}
				>
					Clear
				</Button>
			</div>
		</div>
	);
}

function CellControl({ children }: { children: ReactNode }) {
	return (
		<span className="inline-flex h-5 items-center">
			{"​"}
			{children}
		</span>
	);
}

export function DataTable<TRow, TSub = unknown>({
	query,
	columns,
	getRowId,
	rows,
	total,
	facetCounts,
	loading = false,
	facets,
	tabs,
	onRowClick,
	onRowHover,
	expandable,
	selection,
	actions,
	leadingActions,
	search,
	meta,
	empty,
	label,
	className,
}: DataTableProps<TRow, TSub>) {
	const [expandedIds, setExpandedIds] = useQueryState(
		"expand",
		parseAsArrayOf(parseAsString).withDefault([]),
	);
	const expanded = new Set(expandedIds);
	const defaultHiddenIds = columns
		.filter((column) => column.defaultHidden)
		.map((column) => column.id);
	const [hidden, setHidden] = useQueryState(
		"hide",
		parseAsArrayOf(parseAsString).withDefault(defaultHiddenIds),
	);
	const [filtersOpen, setFiltersOpen] = useState(false);
	const filtersId = useId();

	const hideable = columns.filter((column) => column.hideable !== false);
	const visibleColumns = columns.filter(
		(column) => !hidden.includes(column.id),
	);
	const sortableColumns = columns.filter((column) => column.sortable);

	const tabCounts = tabs ? facetCounts?.[tabs.id] : undefined;
	const activeTabOption =
		query.tab === "all"
			? undefined
			: tabs?.options.find((option) => option.value === query.tab);
	const activeTabLabel = activeTabOption
		? activeTabOption.label
		: (tabs?.allLabel ?? "All");

	const deferredRows = useDeferredValue(rows);
	const anyExpandable =
		expandable != null &&
		deferredRows.some((row) => expandable.isExpandable(row));
	const selecting = selection != null && selection.state.count > 0;

	const pageSize = query.pageSize;
	const totalPages = Math.max(1, Math.ceil(total / pageSize));
	const pageIsPastEnd = !loading && query.page > totalPages;

	const availableFacets = (facets ?? []).filter(
		(facet) =>
			facet.options.length > 0 ||
			facet.searchable ||
			(query.filters[facet.id]?.length ?? 0) > 0,
	);

	const hasFilterControls =
		tabs != null ||
		(facets?.length ?? 0) > 0 ||
		sortableColumns.length > 0 ||
		anyExpandable ||
		hideable.length > 0 ||
		actions != null ||
		leadingActions != null;
	const activeFacetFilterCount = availableFacets.filter(
		(facet) => (query.filters[facet.id]?.length ?? 0) > 0,
	).length;
	const activeFilterCount =
		(tabs && query.tab !== "all" ? 1 : 0) + activeFacetFilterCount;

	const overflow = useOverflowTooltip();

	const showEmpty = deferredRows.length === 0 && !loading;
	const showHeadings = deferredRows.length > 0 || loading;
	const wide =
		visibleColumns.filter((column) => column.hideBelow === undefined).length >
		NARROW_TABLE_COLUMNS;

	return (
		<div
			className={cn(
				"@container/table flex min-h-0 flex-1 flex-col gap-3",
				className,
			)}
		>
			{pageIsPastEnd ? (
				<ReturnToPage
					key={totalPages}
					page={totalPages}
					setPage={query.setPage}
				/>
			) : null}
			<div className="grid">
				{selection ? (
					<SelectionBar selecting={selecting} selection={selection} />
				) : null}
				<div
					aria-hidden={selecting || undefined}
					className={cn(
						"col-start-1 row-start-1 flex flex-col gap-2 lg:flex-row lg:flex-wrap lg:items-center lg:justify-between",
						selecting && "invisible",
					)}
					inert={selecting}
				>
					{search}
					{hasFilterControls && (
						<Button
							type="button"
							variant="outline"
							className="w-full justify-between sm:hidden"
							aria-expanded={filtersOpen}
							aria-controls={filtersId}
							onClick={() => setFiltersOpen((open) => !open)}
						>
							<span className="flex items-center gap-2">
								<ListFilterIcon />
								Table options
								{activeFilterCount > 0 && (
									<span className="tabular-nums opacity-60">
										({activeFilterCount})
									</span>
								)}
							</span>
							<ChevronDownIcon
								className={cn(
									"shrink-0 opacity-60 transition-transform",
									filtersOpen && "rotate-180",
								)}
							/>
						</Button>
					)}
					<div
						id={filtersId}
						className={cn(
							"flex-col gap-2 lg:contents",
							filtersOpen ? "flex" : "hidden sm:flex",
						)}
					>
						{leadingActions}

						<div className="grid grid-cols-1 gap-2 sm:flex sm:flex-wrap sm:items-center lg:ml-auto">
							{tabs && (
								<DropdownMenu>
									<DropdownMenuTrigger asChild>
										<Button
											type="button"
											variant="outline"
											className="justify-start sm:justify-center"
										>
											<LayoutListIcon data-icon="inline-start" />
											{tabs.label ?? "View"}
											<span className="truncate opacity-60">
												{activeTabLabel}
											</span>
										</Button>
									</DropdownMenuTrigger>
									<DropdownMenuContent align="start" className="min-w-52">
										<DropdownMenuRadioGroup
											value={query.tab}
											onValueChange={(value) => query.setTab(value)}
										>
											<DropdownMenuRadioItem value="all">
												<span className="flex-1">{tabs.allLabel ?? "All"}</span>
											</DropdownMenuRadioItem>
											{tabs.options.map((option) => {
												return (
													<DropdownMenuRadioItem
														key={option.value}
														value={option.value}
														disabled={
															tabCounts?.[option.value] === 0 &&
															query.tab !== option.value
														}
													>
														<span className="flex-1">{option.label}</span>
													</DropdownMenuRadioItem>
												);
											})}
										</DropdownMenuRadioGroup>
									</DropdownMenuContent>
								</DropdownMenu>
							)}
							{(facets?.length ?? 0) > 0 && (
								<DropdownMenu>
									<DropdownMenuTrigger asChild>
										<Button
											variant="outline"
											disabled={availableFacets.length === 0}
											className="justify-start sm:justify-center"
										>
											<ListFilterIcon data-icon="inline-start" />
											Filters
											{activeFacetFilterCount > 0 && (
												<span className="tabular-nums opacity-60">
													({activeFacetFilterCount})
												</span>
											)}
										</Button>
									</DropdownMenuTrigger>
									<DropdownMenuContent align="start" className="min-w-48">
										{availableFacets.map((facet) => (
											<FacetSubmenu
												key={facet.id}
												counts={facetCounts?.[facet.id]}
												facet={facet}
												selected={query.filters[facet.id] ?? []}
												onChange={(values) => query.setFilter(facet.id, values)}
											/>
										))}
									</DropdownMenuContent>
								</DropdownMenu>
							)}
							{(sortableColumns.length > 0 || anyExpandable) && (
								<DropdownMenu>
									<DropdownMenuTrigger asChild>
										<Button
											variant="outline"
											className="justify-start sm:justify-center"
										>
											<ArrowUpDownIcon data-icon="inline-start" />
											Sort
										</Button>
									</DropdownMenuTrigger>
									<DropdownMenuContent align="end" className="min-w-48">
										<DropdownMenuRadioGroup
											value={query.sort}
											onValueChange={query.setSort}
										>
											<DropdownMenuLabel>Sort by</DropdownMenuLabel>
											{anyExpandable && (
												<DropdownMenuRadioItem value="detail">
													Detail
												</DropdownMenuRadioItem>
											)}
											{sortableColumns.map((column) => (
												<DropdownMenuRadioItem
													key={column.id}
													value={column.id}
												>
													{columnLabel(column)}
												</DropdownMenuRadioItem>
											))}
										</DropdownMenuRadioGroup>
										<DropdownMenuSeparator />
										<DropdownMenuRadioGroup
											value={query.dir}
											onValueChange={(value) =>
												query.setDir(value === "desc" ? "desc" : "asc")
											}
										>
											<DropdownMenuRadioItem value="asc">
												Ascending
											</DropdownMenuRadioItem>
											<DropdownMenuRadioItem value="desc">
												Descending
											</DropdownMenuRadioItem>
										</DropdownMenuRadioGroup>
									</DropdownMenuContent>
								</DropdownMenu>
							)}
							{hideable.length > 0 && (
								<DropdownMenu>
									<DropdownMenuTrigger asChild>
										<Button
											variant="outline"
											className="justify-start sm:justify-center"
										>
											<Columns3Icon data-icon="inline-start" />
											Columns
											<span className="tabular-nums opacity-60">
												(
												{
													visibleColumns.filter(
														(column) => column.hideable !== false,
													).length
												}
												)
											</span>
										</Button>
									</DropdownMenuTrigger>
									<DropdownMenuContent align="end" className="min-w-48">
										<DropdownMenuGroup>
											<DropdownMenuLabel>Toggle columns</DropdownMenuLabel>
											{hideable.map((column) => (
												<DropdownMenuCheckboxItem
													key={column.id}
													checked={!hidden.includes(column.id)}
													onSelect={(event) => event.preventDefault()}
													onCheckedChange={(checked) =>
														setHidden((prev) => {
															const set = new Set(prev);
															if (checked) set.delete(column.id);
															else set.add(column.id);
															return [...set];
														})
													}
												>
													{columnLabel(column)}
												</DropdownMenuCheckboxItem>
											))}
										</DropdownMenuGroup>
									</DropdownMenuContent>
								</DropdownMenu>
							)}
							{actions}
						</div>
					</div>
				</div>
			</div>

			<TableFrame
				label={label}
				overlay={
					showEmpty ? (
						<div className={TABLE_EMPTY_OVERLAY_CLASS}>
							{typeof empty === "string" || empty == null ? (
								<p className="text-muted-foreground">
									{empty ?? "No results found."}
								</p>
							) : (
								empty
							)}
						</div>
					) : null
				}
			>
				<Table
					{...overflow.handlers}
					aria-busy={loading || undefined}
					className={cn(TABLE_CLASS, wide && "min-w-lg")}
				>
					{showHeadings ? (
						<TableHeader className={TABLE_HEADER_CLASS}>
							<TableRow>
								{selection && (
									<TableHead
										className={cn("h-10 w-10 px-3", COLUMN_LAYOUT_CLASS)}
										data-hide-below="sm"
									>
										{deferredRows.length > 0 && (
											<CellControl>
												<Checkbox
													checked={
														selection.state.allSelected
															? true
															: selection.state.someSelected
																? "indeterminate"
																: false
													}
													onCheckedChange={(checked) =>
														selection.state.toggleAll(checked === true)
													}
													aria-label="Select every row on this page"
												/>
											</CellControl>
										)}
									</TableHead>
								)}
								{anyExpandable && (
									<TableHead className="h-10 w-10 px-3">
										<span className="sr-only">Detail</span>
									</TableHead>
								)}
								{visibleColumns.map((column) => {
									const isActive = query.sort === column.id;
									return (
										<TableHead
											key={column.id}
											{...columnLayout(column)}
											className={COLUMN_HEAD_CLASS}
											aria-sort={
												isActive
													? query.dir === "asc"
														? "ascending"
														: "descending"
													: undefined
											}
										>
											{column.sortable ? (
												<Button
													variant="ghost"
													size="xs"
													onClick={() => query.toggleSort(column.id)}
													className={cn(
														"-ml-2 font-medium text-13 text-muted-foreground hover:text-foreground",
														column.align === "right" &&
															"-mr-2 ml-0 flex-row-reverse",
														column.align === "center" && "mx-auto",
													)}
												>
													{column.header}
													<SortIndicator active={isActive} dir={query.dir} />
												</Button>
											) : (
												column.header
											)}
										</TableHead>
									);
								})}
							</TableRow>
						</TableHeader>
					) : null}
					<TableBody>
						{loading && deferredRows.length === 0 ? (
							<LoadingRows
								columns={visibleColumns}
								expandable={anyExpandable}
								selectable={!!selection}
							/>
						) : null}
						{deferredRows.map((row) => {
							const id = getRowId(row);
							const canExpand = expandable?.isExpandable(row) ?? false;
							const isOpen = canExpand && expanded.has(id);
							const isSelected = selection?.state.has(id) ?? false;
							const clickable = canExpand || !!onRowClick;
							const handleClick = () => {
								if (canExpand) {
									setExpandedIds((prev) => {
										const set = new Set(prev ?? []);
										if (set.has(id)) set.delete(id);
										else set.add(id);
										const next = [...set];
										return next.length > 0 ? next : null;
									});
								} else {
									onRowClick?.(row, deferredRows);
								}
							};
							return (
								<Fragment key={id}>
									<TableRow
										data-state={isSelected ? "selected" : undefined}
										aria-expanded={canExpand ? isOpen : undefined}
										onClick={clickable ? handleClick : undefined}
										onMouseEnter={
											onRowHover ? () => onRowHover(row) : undefined
										}
										onFocus={onRowHover ? () => onRowHover(row) : undefined}
										className={cn(clickable && ROW_ACCENT)}
									>
										{selection && (
											<TableCell
												className={cn("w-10 px-3 py-3", COLUMN_LAYOUT_CLASS)}
												data-hide-below="sm"
												onClick={(event) => event.stopPropagation()}
											>
												<CellControl>
													<Checkbox
														checked={isSelected}
														onCheckedChange={(checked) =>
															selection.state.toggle(id, checked === true)
														}
														aria-label={
															selection.rowLabel
																? `Select ${selection.rowLabel(row)}`
																: "Select row"
														}
													/>
												</CellControl>
											</TableCell>
										)}
										{anyExpandable && (
											<TableCell className="w-10 px-3 py-3 text-center text-muted-foreground">
												{canExpand && (
													<ChevronRightIcon
														size={16}
														className={cn(
															"inline-block transition-transform",
															isOpen && "rotate-90",
														)}
													/>
												)}
											</TableCell>
										)}
										{visibleColumns.map((column) => (
											<TableCell
												key={column.id}
												{...columnLayout(column)}
												className={cn(COLUMN_CELL_CLASS, "py-3")}
											>
												{column.cell(row)}
											</TableCell>
										))}
									</TableRow>
									{isOpen &&
										expandable?.getSubRows(row).map((sub) => {
											const subClickable = !!expandable.onSubRowClick;
											return (
												<TableRow
													key={expandable.getSubRowId(sub, row)}
													onClick={
														subClickable
															? () => expandable.onSubRowClick?.(sub, row)
															: undefined
													}
													className={cn(
														"bg-muted/30",
														subClickable && ROW_ACCENT,
													)}
												>
													{selection && (
														<TableCell
															className={cn(
																"w-10 px-3 py-2.5",
																COLUMN_LAYOUT_CLASS,
															)}
															data-hide-below="sm"
														/>
													)}
													{anyExpandable && (
														<TableCell className="w-10 px-3 py-2.5" />
													)}
													{visibleColumns.map((column) => (
														<TableCell
															key={column.id}
															{...columnLayout(column)}
															className={cn(COLUMN_CELL_CLASS, "py-2.5")}
														>
															{expandable.renderSubCell(sub, column.id, row)}
														</TableCell>
													))}
												</TableRow>
											);
										})}
								</Fragment>
							);
						})}
					</TableBody>
				</Table>
			</TableFrame>
			{overflow.tooltip}

			<TablePagination
				page={query.page}
				totalPages={totalPages}
				pageSize={pageSize}
				total={total}
				onPageChange={(page) => void query.setPage(page)}
				loading={loading}
				meta={meta}
			/>
		</div>
	);
}
