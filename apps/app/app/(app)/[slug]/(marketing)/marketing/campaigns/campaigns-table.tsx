"use client";

import { DataTable, type DataTableColumn } from "@crm/ui/components/data-table";
import { EmptyCellValue } from "@crm/ui/components/empty-cell";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { ListSearch } from "@/components/data-table/list-search";
import { useTableQuery } from "@/components/data-table/use-table-query";
import { LocalRelativeDate } from "@/components/local-date-time";
import { useTRPC } from "@/lib/trpc/client";
import type { RouterOutputs } from "@/lib/trpc/types";
import { useWorkspaceUrl } from "@/lib/use-workspace-url";
import { CampaignStatus } from "../campaign-status";
import { campaignsSearchParams } from "./campaigns-search-params";

type CampaignRow = RouterOutputs["marketingCampaigns"]["list"]["rows"][number];

function count(value: number, sent: number) {
	if (sent === 0) return <EmptyCellValue />;
	return <span>{value.toLocaleString()}</span>;
}

function rate(value: number, sent: number) {
	if (sent === 0) return <EmptyCellValue />;
	return (
		<span className="tabular-nums">{((value / sent) * 100).toFixed(1)}%</span>
	);
}

const COLUMNS: DataTableColumn<CampaignRow>[] = [
	{
		id: "name",
		header: "Campaign",
		sortable: true,
		hideable: false,
		width: "w-[26%]",
		cell: (row) => <span className="truncate font-medium">{row.name}</span>,
	},
	{
		id: "kind",
		header: "Kind",
		width: "w-[12%]",
		hideBelow: "md",
		cell: (row) => (
			<span className="truncate text-muted-foreground">{row.subtitle}</span>
		),
	},
	{
		id: "status",
		header: "Status",
		width: "w-[11%]",
		cell: (row) => <CampaignStatus status={row.status} />,
	},
	{
		id: "segment",
		header: "Segment",
		width: "w-[16%]",
		hideBelow: "md",
		cell: (row) =>
			row.segment ? (
				<span className="truncate text-muted-foreground">{row.segment}</span>
			) : (
				<EmptyCellValue />
			),
	},
	{
		id: "sent",
		header: "Sent",
		align: "right",
		width: "w-[8%]",
		cell: (row) => count(row.sent, row.sent),
	},
	{
		id: "openRate",
		header: "Open rate",
		label: "Open rate · inflated by Apple Mail",
		align: "right",
		width: "w-[9%]",
		hideBelow: "sm",
		cell: (row) => rate(row.opened, row.sent),
	},
	{
		id: "clickRate",
		header: "Click rate",
		align: "right",
		width: "w-[9%]",
		hideBelow: "sm",
		cell: (row) => rate(row.clicked, row.sent),
	},
	{
		id: "replyRate",
		header: "Reply rate",
		align: "right",
		width: "w-[9%]",
		hideBelow: "md",
		cell: (row) => rate(row.replied, row.sent),
	},
	{
		id: "opened",
		header: "Opened",
		align: "right",
		width: "w-[8%]",
		defaultHidden: true,
		cell: (row) => count(row.opened, row.sent),
	},
	{
		id: "clicked",
		header: "Clicked",
		align: "right",
		width: "w-[8%]",
		defaultHidden: true,
		cell: (row) => count(row.clicked, row.sent),
	},
	{
		id: "replied",
		header: "Replied",
		align: "right",
		width: "w-[8%]",
		defaultHidden: true,
		cell: (row) => count(row.replied, row.sent),
	},
	{
		id: "updatedAt",
		header: "Updated",
		sortable: true,
		align: "right",
		width: "w-[15%]",
		hideBelow: "lg",
		cell: (row) => (
			<span className="text-muted-foreground">
				{row.status === "ACTIVE" && row.activatedAt ? (
					<>
						Live since <LocalRelativeDate date={row.activatedAt} />
					</>
				) : row.scheduledAt ? (
					<LocalRelativeDate date={row.scheduledAt} />
				) : (
					<LocalRelativeDate date={row.updatedAt} />
				)}
			</span>
		),
	},
];

export function CampaignsTable() {
	const trpc = useTRPC();
	const router = useRouter();
	const workspaceUrl = useWorkspaceUrl();
	const { query, input } = useTableQuery(campaignsSearchParams);

	const kind = query.filters.kind ?? "all";
	const status = query.filters.status ?? "all";

	const campaigns = useQuery({
		...trpc.marketingCampaigns.list.queryOptions({
			...input,
			kind: kind === "all" ? "" : kind,
			status: status === "all" ? "" : status,
		}),
		placeholderData: (previous) => previous,
	});

	const rows = campaigns.data?.rows ?? [];

	return (
		<DataTable
			query={query}
			search={<ListSearch placeholder="Search name or subject…" />}
			columns={COLUMNS}
			rows={rows}
			total={campaigns.data?.total ?? 0}
			facetCounts={campaigns.data?.facetCounts}
			getRowId={(row) => row.id}
			facets={[
				{
					id: "kind",
					label: "Kind",
					options: [
						{ value: "BLAST", label: "Blasts" },
						{ value: "DRIP", label: "Sequences" },
					],
				},
				{
					id: "status",
					label: "Status",
					options: [
						{ value: "DRAFT", label: "Drafts" },
						{ value: "PENDING_APPROVAL", label: "Needs review" },
						{ value: "SCHEDULED", label: "Scheduled" },
						{ value: "ACTIVE", label: "Running" },
						{ value: "PAUSED", label: "Paused" },
						{ value: "SENT", label: "Sent" },
						{ value: "DRAINING", label: "Finishing" },
						{ value: "CANCELLED", label: "Cancelled" },
						{ value: "FAILED", label: "Failed" },
						{ value: "ARCHIVED", label: "Archived" },
					],
				},
			]}
			loading={campaigns.isPending}
			onRowClick={(row) =>
				router.push(workspaceUrl(`/marketing/campaigns/${row.id}`))
			}
			empty="No campaigns yet. A blast goes to a segment once. A sequence follows up over weeks and branches."
		/>
	);
}
