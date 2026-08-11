"use client";

import { Button } from "@crm/ui/components/button";
import {
	DataTable,
	type DataTableColumn,
	type DataTableFacet,
} from "@crm/ui/components/data-table";
import { StatusIndicator } from "@crm/ui/components/status-indicator";
import { useTableSelection } from "@crm/ui/hooks/use-table-selection";
import { useSuspenseQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { EnrichmentIndicator } from "@/components/crm/enrichment-status";
import {
	PROSPECT_COUNTRY_LABELS,
	PROSPECT_ROUTE_LABELS,
	PROSPECT_STATUS_LABELS,
	prospectRouteTone,
	prospectStatusTone,
} from "@/components/crm/prospect-labels";
import { prospectNextAction } from "@/components/crm/prospect-next-action";
import { ProspectResearchButton } from "@/components/crm/prospect-research-button";
import { usePrefetchRecord } from "@/components/crm/record-sheet/record-prefetch";
import { useOpenRecord } from "@/components/crm/record-sheet/record-stack";
import { ListSearch } from "@/components/data-table/list-search";
import { useTableQuery } from "@/components/data-table/use-table-query";
import { LocalRelativeTime } from "@/components/local-date-time";
import { ENRICHMENT_POLL_MS, isEnriching } from "@/lib/enrichment-status";
import { useTRPC } from "@/lib/trpc/client";
import type { RouterOutputs } from "@/lib/trpc/types";
import { ProspectsBulkActions } from "./prospects-bulk-actions";
import { prospectsSearchParams } from "./prospects-search-params";

type ProspectRow = RouterOutputs["prospects"]["list"]["rows"][number];

function ProspectActionCell({ row }: { row: ProspectRow }) {
	const openRecord = useOpenRecord();
	const action = prospectNextAction(row);

	if (action.kind === "research") {
		return (
			<ProspectResearchButton
				id={row.id}
				queued={row.queued}
				label={action.label}
				size="xs"
			/>
		);
	}

	if (action.kind === "working") {
		return (
			<Button variant="outline" size="xs" disabled>
				{action.label}
			</Button>
		);
	}

	const open = () => {
		if (action.kind === "start-deal" || action.kind === "manage-deals") {
			if (!row.companyId) return;
			openRecord(
				{ kind: "company", id: row.companyId },
				{
					tab: "deals",
					form: action.kind === "start-deal" ? "deal" : undefined,
				},
			);
			return;
		}

		if (action.kind === "complete-account") {
			if (!row.companyId) return;
			openRecord({ kind: "company", id: row.companyId }, { tab: "contacts" });
			return;
		}

		openRecord(
			{ kind: "prospect", id: row.id },
			{
				tab:
					action.kind === "review-draft"
						? "draft"
						: action.kind === "review-disqualification"
							? "overview"
							: "evidence",
			},
		);
	};

	return (
		<Button
			variant={action.kind === "start-deal" ? "default" : "outline"}
			size="xs"
			onClick={(event) => {
				event.stopPropagation();
				open();
			}}
		>
			{action.label}
		</Button>
	);
}

const COLUMNS: DataTableColumn<ProspectRow>[] = [
	{
		id: "company",
		header: "Company",
		sortable: true,
		hideable: false,
		width: "w-[24%]",
		cell: (row) => (
			<span className="flex min-w-0 flex-col">
				<span className="truncate font-medium">{row.companyName}</span>
				<span className="truncate text-muted-foreground text-xs">
					{row.website ?? row.location ?? "No website"}
				</span>
			</span>
		),
	},
	{
		id: "countryCode",
		header: "Market",
		width: "w-[12%]",
		hideBelow: "md",
		cell: (row) => PROSPECT_COUNTRY_LABELS[row.countryCode] ?? row.countryCode,
	},
	{
		id: "namedPerson",
		header: "Contact",
		width: "w-[22%]",
		cell: (row) =>
			row.namedPerson ? (
				<span className="flex min-w-0 flex-col">
					<span className="truncate">{row.namedPerson}</span>
					<span className="truncate text-muted-foreground text-xs">
						{row.role ?? "Role not verified"}
					</span>
				</span>
			) : (
				<StatusIndicator tone="warning" label="Person needed" />
			),
	},
	{
		id: "fitScore",
		header: "Fit",
		sortable: true,
		align: "right",
		width: "w-[7%]",
		cell: (row) => <span className="tabular-nums">{row.fitScore ?? "—"}</span>,
	},
	{
		id: "evidence",
		header: "Evidence",
		align: "right",
		width: "w-[10%]",
		hideBelow: "lg",
		cell: (row) => (
			<span className="tabular-nums">
				{row.evidenceCount} · {row.jobPostingCount} jobs
			</span>
		),
	},
	{
		id: "status",
		header: "Qualification",
		sortable: true,
		width: "w-[15%]",
		cell: (row) => (
			<StatusIndicator
				tone={prospectStatusTone(row.status)}
				label={PROSPECT_STATUS_LABELS[row.status] ?? row.status}
			/>
		),
	},
	{
		id: "routeStatus",
		header: "Route",
		sortable: true,
		width: "w-[17%]",
		hideBelow: "sm",
		cell: (row) => (
			<StatusIndicator
				tone={prospectRouteTone(row.routeStatus)}
				label={PROSPECT_ROUTE_LABELS[row.routeStatus] ?? row.routeStatus}
			/>
		),
	},
	{
		id: "nextAction",
		header: "Next move",
		width: "w-[18%]",
		cell: (row) => <ProspectActionCell row={row} />,
	},
	{
		id: "research",
		header: "Research",
		width: "w-[14%]",
		defaultHidden: true,
		cell: (row) => (
			<EnrichmentIndicator
				status={row.enrichmentStatus}
				queued={row.queued}
				title={
					row.lastResearchedAt
						? `Last researched ${new Date(row.lastResearchedAt).toLocaleDateString()}`
						: "Not researched"
				}
			/>
		),
	},
	{
		id: "updatedAt",
		header: "Updated",
		sortable: true,
		align: "right",
		width: "w-[12%]",
		defaultHidden: true,
		cell: (row) => (
			<span className="text-muted-foreground">
				<LocalRelativeTime date={row.updatedAt} />
			</span>
		),
	},
];

export function ProspectsTable() {
	const trpc = useTRPC();
	const openRecord = useOpenRecord();
	const prefetchRecord = usePrefetchRecord();
	const { query, input } = useTableQuery(prospectsSearchParams);
	const prospects = useSuspenseQuery({
		...trpc.prospects.list.queryOptions(input),
		refetchInterval: (query) =>
			query.state.data?.rows.some((row) =>
				isEnriching(row.enrichmentStatus, row.queued),
			)
				? ENRICHMENT_POLL_MS
				: false,
	});
	const rows = prospects.data.rows;
	const selection = useTableSelection(
		useMemo(() => rows.map((row) => row.id), [rows]),
	);
	const facetCounts = prospects.data?.facetCounts;

	const facets: DataTableFacet[] = [
		{
			id: "countryCode",
			label: "Market",
			options: Object.entries(PROSPECT_COUNTRY_LABELS)
				.filter(([value]) => (facetCounts?.countryCode?.[value] ?? 0) > 0)
				.map(([value, label]) => ({ value, label })),
		},
		{
			id: "status",
			label: "Qualification",
			options: Object.entries(PROSPECT_STATUS_LABELS)
				.filter(([value]) => (facetCounts?.status?.[value] ?? 0) > 0)
				.map(([value, label]) => ({ value, label })),
		},
		{
			id: "routeStatus",
			label: "Route",
			options: Object.entries(PROSPECT_ROUTE_LABELS)
				.filter(([value]) => (facetCounts?.routeStatus?.[value] ?? 0) > 0)
				.map(([value, label]) => ({ value, label })),
		},
		{
			id: "contact",
			label: "Contact",
			options: [
				{ value: "named", label: "Named person" },
				{ value: "missing", label: "Person missing" },
			],
		},
	];

	return (
		<DataTable
			query={query}
			search={<ListSearch placeholder="Search companies, people or roles…" />}
			columns={COLUMNS}
			rows={rows}
			total={prospects.data.total}
			facetCounts={facetCounts}
			facets={facets}
			selection={{
				state: selection,
				actions: (
					<ProspectsBulkActions ids={selection.ids} onDone={selection.clear} />
				),
				rowLabel: (row) => row.companyName,
			}}
			getRowId={(row) => row.id}
			loading={prospects.isFetching}
			onRowHover={(row) => prefetchRecord({ kind: "prospect", id: row.id })}
			onRowClick={(row) => openRecord({ kind: "prospect", id: row.id })}
			empty="No prospects match this view."
		/>
	);
}
