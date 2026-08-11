"use client";

import ArrowDown from "@carbon/icons-react/es/ArrowDown";
import ArrowsVertical from "@carbon/icons-react/es/ArrowsVertical";
import ArrowUp from "@carbon/icons-react/es/ArrowUp";
import ChevronDown from "@carbon/icons-react/es/ChevronDown";
import ChevronRight from "@carbon/icons-react/es/ChevronRight";
import Column from "@carbon/icons-react/es/Column";
import Filter from "@carbon/icons-react/es/Filter";
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
	DropdownMenuLabel,
	DropdownMenuRadioGroup,
	DropdownMenuRadioItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@crm/ui/components/dropdown-menu";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@crm/ui/components/popover";
import { Spinner } from "@crm/ui/components/spinner";
import { TablePagination } from "@crm/ui/components/table-pagination";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@crm/ui/components/table";
import type { TableSelection } from "@crm/ui/hooks/use-table-selection";
import { ROW_ACCENT, ROW_ACCENT_EXPANDABLE } from "@crm/ui/lib/row-accent";
import type { TableQueryState } from "@crm/ui/lib/table-query";
import { cn } from "@crm/ui/lib/utils";
import { parseAsArrayOf, parseAsString, useQueryState } from "nuqs";
import {
	type ComponentProps,
	Fragment,
	type ReactNode,
	useDeferredValue,
	useId,
	useMemo,
	useState,
} from "react";

export type DataTableColumn<TRow> = {
	id: string;
	header: ReactNode;
	cell: (row: TRow) => ReactNode;
	label?: string;
	sortable?: boolean;
	width?: string;
	align?: "left" | "right" | "center";
	headClassName?: string;
	cellClassName?: string;
	hideable?: boolean;
	defaultHidden?: boolean;
	hideBelow?: "sm" | "md" | "lg";
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
	onRowClick?: (row: TRow) => void;
	onRowHover?: (row: TRow) => void;
	expandable?: DataTableExpandable<TRow, TSub>;
	selection?: DataTableSelection<TRow>;
	actions?: ReactNode;
	leadingActions?: ReactNode;
	search?: ReactNode;
	meta?: ReactNode;
	empty?: ReactNode;
	className?: string;
	tableClassName?: string;
};

const HIDE_BELOW_CLASS = {
	sm: "hidden sm:table-cell",
	md: "hidden md:table-cell",
	lg: "hidden lg:table-cell",
} as const;

const ALIGN_CLASS = {
	left: "",
	right: "text-right",
	center: "text-center",
} as const;

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
					<ArrowUp size={12} />
				) : (
					<ArrowDown size={12} />
				)
			) : (
				<ArrowsVertical size={12} className="opacity-40" />
			)}
		</span>
	);
}

function FacetTrigger({
	label,
	...props
}: ComponentProps<typeof Button> & { label: string }) {
	return (
		<Button variant="outline" size="sm" className="justify-between" {...props}>
			<span className="truncate">{label}</span>
			<ChevronDown data-icon="inline-end" className="opacity-60" />
		</Button>
	);
}

function SearchableFacet({
	facet,
	selected,
	activeLabel,
	onSelect,
}: {
	facet: DataTableFacet;
	selected: string;
	activeLabel?: string;
	onSelect: (value: string) => void;
}) {
	const [open, setOpen] = useState(false);
	const [seen, setSeen] = useState<{ value: string; label: string } | null>(
		null,
	);

	if (activeLabel && (seen?.value !== selected || seen.label !== activeLabel)) {
		setSeen({ value: selected, label: activeLabel });
	}

	const label =
		activeLabel ??
		(seen?.value === selected ? seen.label : undefined) ??
		facet.label;

	const choose = (value: string) => {
		setOpen(false);
		facet.onSearchChange?.("");
		onSelect(value);
	};

	return (
		<Popover
			open={open}
			onOpenChange={(next) => {
				setOpen(next);
				if (!next) facet.onSearchChange?.("");
			}}
		>
			<PopoverTrigger asChild>
				<FacetTrigger label={label} />
			</PopoverTrigger>
			<PopoverContent align="start" size="fit" className="w-64">
				<Command shouldFilter={facet.onSearchChange === undefined}>
					<CommandInput
						placeholder={`Search ${facet.label.toLowerCase()}…`}
						value={facet.search}
						onValueChange={facet.onSearchChange}
					/>
					<CommandList>
						<CommandEmpty>{facet.empty ?? "Nothing matches."}</CommandEmpty>
						<CommandGroup>
							{facet.search?.trim() ? null : (
								<CommandItem
									value={facet.label}
									disabled={facet.stale}
									data-checked={selected === "all"}
									onSelect={() => choose("all")}
								>
									{facet.label}
								</CommandItem>
							)}
							{facet.options.map((option) => (
								<CommandItem
									key={option.value}
									value={option.label}
									disabled={facet.stale}
									data-checked={selected === option.value}
									onSelect={() => choose(option.value)}
								>
									<span className="truncate">{option.label}</span>
								</CommandItem>
							))}
						</CommandGroup>
					</CommandList>
				</Command>
			</PopoverContent>
		</Popover>
	);
}

export function DataTable<TRow, TSub = unknown>({
	query,
	columns,
	getRowId,
	rows,
	total,
	facetCounts,
	loading,
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
	className,
	tableClassName,
}: DataTableProps<TRow, TSub>) {
	const [expandedIds, setExpandedIds] = useQueryState(
		"expand",
		parseAsArrayOf(parseAsString).withDefault([]),
	);
	const expanded = useMemo(() => new Set(expandedIds), [expandedIds]);
	const defaultHiddenIds = useMemo(
		() => columns.filter((column) => column.defaultHidden).map((c) => c.id),
		[columns],
	);
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

	const hasFilterControls =
		tabs != null ||
		(facets?.length ?? 0) > 0 ||
		sortableColumns.length > 0 ||
		anyExpandable ||
		hideable.length > 0 ||
		actions != null ||
		leadingActions != null;
	const activeFilterCount =
		(tabs && query.tab !== "all" ? 1 : 0) +
		(facets?.filter((facet) => (query.filters[facet.id] ?? "all") !== "all")
			.length ?? 0);

	return (
		<div className={cn("flex min-h-0 flex-1 flex-col gap-3", className)}>
			{selecting && selection ? (
				<div className="flex h-8 items-center gap-2">
					<span className="truncate text-xs text-muted-foreground">
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
			) : null}
			<div
				className={cn(
					"flex flex-col gap-2 lg:flex-row lg:flex-wrap lg:items-center lg:justify-between",
					selecting && "hidden",
				)}
			>
				{search}
				{hasFilterControls && (
					<Button
						type="button"
						variant="outline"
						size="sm"
						className="w-full justify-between sm:hidden"
						aria-expanded={filtersOpen}
						aria-controls={filtersId}
						onClick={() => setFiltersOpen((open) => !open)}
					>
						<span className="flex items-center gap-2">
							<Filter />
							Filters
							{activeFilterCount > 0 && (
								<span className="tabular-nums opacity-60">
									({activeFilterCount})
								</span>
							)}
						</span>
						<ChevronDown
							className={cn(
								"shrink-0 opacity-60 transition-transform",
								filtersOpen && "rotate-180",
							)}
						/>
					</Button>
				)}
				{/* `lg:contents` so the controls join the search on one row on desktop
				    while staying a group the Filters button can collapse on mobile —
				    search itself must never be inside that collapse. */}
				<div
					id={filtersId}
					className={cn(
						"flex-col gap-2 lg:contents",
						filtersOpen ? "flex" : "hidden sm:flex",
					)}
				>
					{tabs && (
						<DropdownMenu>
							<DropdownMenuTrigger asChild>
								<Button
									type="button"
									variant="outline"
									size="sm"
									className="w-full justify-between sm:w-auto sm:min-w-44"
								>
									<span className="truncate">{activeTabLabel}</span>
									<ChevronDown className="shrink-0 opacity-60" />
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
										if (tabCounts?.[option.value] === 0) return null;
										return (
											<DropdownMenuRadioItem
												key={option.value}
												value={option.value}
											>
												<span className="flex-1">{option.label}</span>
											</DropdownMenuRadioItem>
										);
									})}
								</DropdownMenuRadioGroup>
							</DropdownMenuContent>
						</DropdownMenu>
					)}

					{leadingActions}

					<div className="grid grid-cols-1 gap-2 sm:flex sm:flex-wrap sm:items-center lg:ml-auto">
						{facets?.map((facet) => {
							const selected = query.filters[facet.id] ?? "all";
							const active = facet.options.find((o) => o.value === selected);

							if (facet.searchable) {
								return (
									<SearchableFacet
										key={facet.id}
										facet={facet}
										selected={selected}
										activeLabel={active?.label}
										onSelect={(value) => query.setFilter(facet.id, value)}
									/>
								);
							}

							return (
								<DropdownMenu key={facet.id}>
									<DropdownMenuTrigger asChild>
										<FacetTrigger label={active ? active.label : facet.label} />
									</DropdownMenuTrigger>
									<DropdownMenuContent align="start" className="min-w-44">
										<DropdownMenuRadioGroup
											value={selected}
											onValueChange={(value) => query.setFilter(facet.id, value)}
										>
											<DropdownMenuRadioItem value="all">
												{facet.label}
											</DropdownMenuRadioItem>
											{facet.options.map((option) => (
												<DropdownMenuRadioItem
													key={option.value}
													value={option.value}
												>
													{option.label}
												</DropdownMenuRadioItem>
											))}
										</DropdownMenuRadioGroup>
									</DropdownMenuContent>
								</DropdownMenu>
							);
						})}
						{(sortableColumns.length > 0 || anyExpandable) && (
							<DropdownMenu>
								<DropdownMenuTrigger asChild>
									<Button
										variant="outline"
										size="sm"
										className="justify-start sm:justify-center"
									>
										<ArrowsVertical data-icon="inline-start" />
										Sort
									</Button>
								</DropdownMenuTrigger>
								<DropdownMenuContent align="end" className="min-w-48">
									<DropdownMenuLabel>Sort by</DropdownMenuLabel>
									<DropdownMenuRadioGroup
										value={query.sort}
										onValueChange={query.setSort}
									>
										{anyExpandable && (
											<DropdownMenuRadioItem value="detail">
												Detail
											</DropdownMenuRadioItem>
										)}
										{sortableColumns.map((column) => (
											<DropdownMenuRadioItem key={column.id} value={column.id}>
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
										size="sm"
										className="justify-start sm:justify-center"
									>
										<Column data-icon="inline-start" />
										Columns
										<span className="tabular-nums opacity-60">
											({visibleColumns.length})
										</span>
									</Button>
								</DropdownMenuTrigger>
								<DropdownMenuContent align="end" className="min-w-48">
									<DropdownMenuLabel>Toggle columns</DropdownMenuLabel>
									{hideable.map((column) => (
										<DropdownMenuCheckboxItem
											key={column.id}
											checked={!hidden.includes(column.id)}
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
								</DropdownMenuContent>
							</DropdownMenu>
						)}
						{actions}
					</div>
				</div>
			</div>

			<Table
				className={cn(
					"table-fixed [&_td:first-child]:pl-4 [&_th:first-child]:pl-4 [&_td:last-child]:pr-4 [&_th:last-child]:pr-4",
					tableClassName,
				)}
				containerClassName="min-h-0 flex-1 overflow-auto rounded-lg border bg-card"
				overlay={
					deferredRows.length === 0 ? (
						<div className="absolute inset-x-0 top-11 bottom-0 flex items-center justify-center px-4 py-8 text-center text-muted-foreground">
							{loading ? <Spinner /> : (empty ?? "No results found.")}
						</div>
					) : null
				}
			>
				<TableHeader className="sticky top-0 z-10 bg-muted [&_th]:bg-muted [&_tr]:border-0 [&_tr]:shadow-[inset_0_-1px_0_var(--border)]">
					<TableRow>
						{selection && (
							<TableHead className={cn("h-11 w-10 px-3", HIDE_BELOW_CLASS.sm)}>
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
									disabled={deferredRows.length === 0}
									aria-label="Select every row on this page"
								/>
							</TableHead>
						)}
						{anyExpandable && (
							<TableHead className="h-11 w-10 px-3">
								<span className="sr-only">Detail</span>
							</TableHead>
						)}
						{visibleColumns.map((column) => {
							const isActive = query.sort === column.id;
							return (
								<TableHead
									key={column.id}
									className={cn(
										"h-11 overflow-hidden px-3 font-normal text-muted-foreground",
										column.width,
										ALIGN_CLASS[column.align ?? "left"],
										column.hideBelow && HIDE_BELOW_CLASS[column.hideBelow],
										column.headClassName,
									)}
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
												"-ml-2 font-normal text-muted-foreground hover:text-foreground",
												column.align === "right" && "-mr-2 ml-0 flex-row-reverse",
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
				<TableBody>
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
								onRowClick?.(row);
							}
						};
						return (
							<Fragment key={id}>
								<TableRow
									data-state={isSelected ? "selected" : undefined}
									onClick={clickable ? handleClick : undefined}
									onMouseEnter={onRowHover ? () => onRowHover(row) : undefined}
									onFocus={onRowHover ? () => onRowHover(row) : undefined}
									className={
										clickable
											? anyExpandable
												? ROW_ACCENT_EXPANDABLE
												: ROW_ACCENT
											: undefined
									}
								>
									{selection && (
										<TableCell
											className={cn("w-10 px-3 py-3", HIDE_BELOW_CLASS.sm)}
											onClick={(event) => event.stopPropagation()}
										>
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
										</TableCell>
									)}
									{anyExpandable && (
										<TableCell className="w-10 px-3 py-3 text-center text-muted-foreground">
											{canExpand && (
												<ChevronRight
													size={12}
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
											className={cn(
												"overflow-hidden px-3 py-3",
												column.width,
												ALIGN_CLASS[column.align ?? "left"],
												column.hideBelow && HIDE_BELOW_CLASS[column.hideBelow],
												column.cellClassName,
											)}
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
													subClickable &&
														(anyExpandable
															? ROW_ACCENT_EXPANDABLE
															: ROW_ACCENT),
												)}
											>
												{selection && (
													<TableCell
														className={cn(
															"w-10 px-3 py-2.5",
															HIDE_BELOW_CLASS.sm,
														)}
													/>
												)}
												{anyExpandable && (
													<TableCell className="w-10 px-3 py-2.5" />
												)}
												{visibleColumns.map((column) => (
													<TableCell
														key={column.id}
														className={cn(
															"overflow-hidden px-3 py-2.5 align-top",
															column.width,
															ALIGN_CLASS[column.align ?? "left"],
															column.hideBelow &&
																HIDE_BELOW_CLASS[column.hideBelow],
															column.cellClassName,
														)}
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

			<TablePagination
				page={query.page}
				totalPages={totalPages}
				pageSize={pageSize}
				total={total}
				onPageChange={(page) => query.setPage(page)}
				loading={loading}
				meta={meta}
			/>
		</div>
	);
}
