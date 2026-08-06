"use client";

import {
	DataTable,
	type DataTableColumn,
	type DataTableFacet,
} from "@crm/ui/components/data-table";
import { EmptyCellValue } from "@crm/ui/components/empty-cell";
import { useTableSelection } from "@crm/ui/hooks/use-table-selection";
import { formatMoney } from "@crm/ui/lib/format";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { CLOSING_OPTIONS } from "@/components/crm/closing-window";
import { CompanyCell } from "@/components/crm/company-cell";
import { useFieldColumns } from "@/components/crm/fields/field-columns";
import { OwnerCell } from "@/components/crm/owner-cell";
import { usePrefetchRecord } from "@/components/crm/record-sheet/record-prefetch";
import { useOpenRecord } from "@/components/crm/record-sheet/record-stack";
import { DealStageMenu } from "@/components/crm/stage-change";
import { ListSearch } from "@/components/data-table/list-search";
import { useTableQuery } from "@/components/data-table/use-table-query";
import { LocalDay, LocalRelativeTime } from "@/components/local-date-time";
import { DEAL_STAGE_OPTIONS } from "@/lib/deal-stage";
import { useTRPC } from "@/lib/trpc/client";
import type { RouterOutputs } from "@/lib/trpc/types";
import { DealsBulkActions } from "./deals-bulk-actions";
import { dealsSearchParams } from "./deals-search-params";

type DealRow = RouterOutputs["deals"]["list"]["rows"][number];

const COLUMNS: DataTableColumn<DealRow>[] = [
	{
		id: "name",
		header: "Deal",
		sortable: true,
		hideable: false,
		width: "w-[24%]",
		cell: (row) => <span className="truncate font-medium">{row.name}</span>,
	},
	{
		id: "company",
		header: "Company",
		sortable: true,
		width: "w-[18%]",
		cell: (row) => <CompanyCell company={row.company} />,
	},
	{
		id: "stage",
		header: "Stage",
		sortable: true,
		width: "w-[18%]",
		cell: (row) => <DealStageMenu dealId={row.id} stage={row.stage} />,
	},
	{
		id: "amount",
		header: "Amount",
		sortable: true,
		align: "right",
		width: "w-[12%]",
		hideBelow: "sm",
		cell: (row) =>
			row.amountCents === null ? (
				<EmptyCellValue />
			) : (
				<span className="tabular-nums">
					{formatMoney(row.amountCents, row.currency)}
				</span>
			),
	},
	{
		id: "owner",
		header: "Owner",
		sortable: true,
		width: "w-[14%]",
		hideBelow: "md",
		cell: (row) => <OwnerCell owner={row.owner} />,
	},
	{
		id: "expectedCloseDate",
		header: "Close date",
		sortable: true,
		width: "w-[12%]",
		hideBelow: "lg",
		cell: (row) =>
			row.expectedCloseDate ? (
				<span className="text-muted-foreground">
					<LocalDay date={row.expectedCloseDate} />
				</span>
			) : (
				<EmptyCellValue />
			),
	},
	{
		id: "createdAt",
		header: "Created",
		label: "Created date",
		sortable: true,
		align: "right",
		width: "w-[10%]",
		defaultHidden: true,
		cell: (row) => (
			<span className="text-muted-foreground">
				<LocalRelativeTime date={row.createdAt} />
			</span>
		),
	},
	{
		id: "lastActivity",
		header: "Last activity",
		sortable: true,
		align: "right",
		width: "w-[12%]",
		hideBelow: "lg",
		cell: (row) => (
			<span className="text-muted-foreground">
				{row.lastActivityAt ? (
					<LocalRelativeTime date={row.lastActivityAt} />
				) : (
					<EmptyCellValue />
				)}
			</span>
		),
	},
];

export function DealsTable() {
	const openRecord = useOpenRecord();
	const trpc = useTRPC();
	const prefetchRecord = usePrefetchRecord();
	const { query, input } = useTableQuery(dealsSearchParams);

	const deals = useQuery({
		...trpc.deals.list.queryOptions(input),
		placeholderData: (previous) => previous,
	});
	const users = useQuery(trpc.users.list.queryOptions());

	const rows = deals.data?.rows ?? [];
	const selection = useTableSelection(
		useMemo(() => rows.map((row) => row.id), [rows]),
	);

	const facetCounts = deals.data?.facetCounts;

	const facets: DataTableFacet[] = [
		{
			id: "owner",
			label: "Owner",
			options: (users.data ?? []).flatMap((user) =>
				(facetCounts?.owner?.[user.id] ?? 0) > 0
					? [{ value: user.id, label: user.name }]
					: [],
			),
		},
		{
			id: "stage",
			label: "Stage",
			options: DEAL_STAGE_OPTIONS.filter(
				(option) => (facetCounts?.stage?.[option.value] ?? 0) > 0,
			),
		},
		{
			id: "closing",
			label: "Closing",
			options: CLOSING_OPTIONS.flatMap((option) =>
				(facetCounts?.closing?.[option.value] ?? 0) > 0
					? [{ value: option.value, label: option.label }]
					: [],
			),
		},
	];

	const openValueCents = deals.data?.openValueCents;
	const reportingCurrency = deals.data?.reportingCurrency;
	const unconverted = deals.data?.unconverted;
	const uncounted = unconverted?.count ?? 0;
	const openPipelineCents = openValueCents ?? (uncounted > 0 ? 0 : null);

	const fieldColumns = useFieldColumns<DealRow>("DEAL");
	const columns = useMemo(() => [...COLUMNS, ...fieldColumns], [fieldColumns]);

	return (
		<DataTable
			query={query}
			search={<ListSearch placeholder="Search deals by name or company…" />}
			columns={columns}
			rows={rows}
			total={deals.data?.total ?? 0}
			facetCounts={facetCounts}
			facets={facets}
			tabs={{
				id: "status",
				allLabel: "All deals",
				options: [
					{ value: "open", label: "Open" },
					{ value: "closed", label: "Closed" },
				],
			}}
			selection={{
				state: selection,
				actions: (
					<DealsBulkActions ids={selection.ids} onDone={selection.clear} />
				),
				rowLabel: (row) => row.name,
			}}
			getRowId={(row) => row.id}
			loading={deals.isFetching}
			onRowHover={(row) => prefetchRecord({ kind: "deal", id: row.id })}
			onRowClick={(row) => openRecord({ kind: "deal", id: row.id })}
			empty="No deals match this view."
			meta={
				openPipelineCents === null ? undefined : (
					<span>
						{deals.data?.total ?? 0} deals ·{" "}
						<span className="tabular-nums">
							{formatMoney(openPipelineCents, reportingCurrency)}
						</span>{" "}
						open pipeline
						{unconverted && unconverted.count > 0 ? (
							<span className="text-muted-foreground">
								{" "}
								· {unconverted.count} not counted (no{" "}
								{unconverted.currencies.join(", ")} rate)
							</span>
						) : null}
					</span>
				)
			}
		/>
	);
}
