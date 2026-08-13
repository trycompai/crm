"use client";

import { DataTable, type DataTableColumn } from "@crm/ui/components/data-table";
import { EmptyCellValue } from "@crm/ui/components/empty-cell";
import { ExportCsv } from "@crm/ui/components/export-csv";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useOpenRecord } from "@/components/crm/record-sheet/record-stack";
import { ListSearch } from "@/components/data-table/list-search";
import { useTableQuery } from "@/components/data-table/use-table-query";
import { LocalRelativeDate } from "@/components/local-date-time";
import { useTRPC } from "@/lib/trpc/client";
import type { RouterOutputs } from "@/lib/trpc/types";
import { recipientsSearchParams } from "./campaign-people-search-params";

type Row = RouterOutputs["marketingCampaigns"]["recipients"]["rows"][number];

const STATES = [
	{ value: "opened", label: "Opened" },
	{ value: "clicked", label: "Clicked" },
	{ value: "replied", label: "Replied" },
	{ value: "bounced", label: "Bounced" },
	{ value: "unsubscribed", label: "Unsubscribed" },
	{ value: "skipped", label: "Skipped" },
];

const OUTCOME: Record<string, string> = {
	QUEUED: "Queued",
	SENDING: "Sending",
	SENT: "Sent",
	DELIVERED: "Delivered",
	BOUNCED: "Bounced",
	COMPLAINED: "Complained",
	FAILED: "Failed",
	SKIPPED: "Skipped",
};

function When({ at }: { at: Date | string | null }) {
	if (!at) return <EmptyCellValue />;

	return (
		<span className="text-muted-foreground">
			<LocalRelativeDate
				date={typeof at === "string" ? at : at.toISOString()}
			/>
		</span>
	);
}

const COLUMNS: DataTableColumn<Row>[] = [
	{
		id: "name",
		header: "Person",
		hideable: false,
		width: "w-[22%]",
		cell: (row) => (
			<span className="truncate font-medium">
				{row.name ?? row.recipient.address}
			</span>
		),
	},
	{
		id: "address",
		header: "Address",
		width: "w-[22%]",
		hideBelow: "md",
		cell: (row) => (
			<span className="truncate text-muted-foreground">
				{row.recipient.address}
			</span>
		),
	},
	{
		id: "touch",
		header: "Touch",
		width: "w-[14%]",
		hideBelow: "lg",
		cell: (row) =>
			row.node?.label ? (
				<span className="truncate text-muted-foreground">{row.node.label}</span>
			) : (
				<EmptyCellValue />
			),
	},
	{
		id: "status",
		header: "Outcome",
		width: "w-[12%]",
		cell: (row) => (
			<span className="truncate">
				{row.skipReason ?? OUTCOME[row.status] ?? row.status}
			</span>
		),
	},
	{
		id: "sentAt",
		header: "Sent",
		sortable: true,
		width: "w-[10%]",
		hideBelow: "md",
		cell: (row) => <When at={row.sentAt} />,
	},
	{
		id: "openedAt",
		header: "Opened",
		width: "w-[10%]",
		hideBelow: "sm",
		cell: (row) => <When at={row.openedAt} />,
	},
	{
		id: "clickedAt",
		header: "Clicked",
		width: "w-[10%]",
		hideBelow: "sm",
		cell: (row) => <When at={row.clickedAt} />,
	},
];

export function CampaignRecipients({ campaignId }: { campaignId: string }) {
	const trpc = useTRPC();
	const queryClient = useQueryClient();
	const openRecord = useOpenRecord();
	const { query, input } = useTableQuery(recipientsSearchParams);

	const state = query.filters.state ?? "all";

	const recipients = useQuery({
		...trpc.marketingCampaigns.recipients.queryOptions({
			...input,
			campaignId,
			state,
		}),
		placeholderData: (previous) => previous,
	});

	const rows = recipients.data?.rows ?? [];

	return (
		<div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto p-4">
			<DataTable
				query={query}
				search={<ListSearch placeholder="Search by address or subject…" />}
				columns={COLUMNS}
				rows={rows}
				total={recipients.data?.total ?? 0}
				facetCounts={recipients.data?.facetCounts}
				getRowId={(row) => row.id}
				facets={[{ id: "state", label: "Outcome", options: STATES }]}
				loading={recipients.isPending}
				actions={
					<ExportCsv
						name={`recipients-${state}`}
						total={recipients.data?.total ?? 0}
						disabled={recipients.isFetching}
						columns={[
							{ header: "Name", value: (row: Row) => row.name },
							{ header: "Address", value: (row: Row) => row.recipient.address },
							{ header: "Touch", value: (row: Row) => row.node?.label ?? null },
							{ header: "Subject", value: (row: Row) => row.subject },
							{
								header: "Outcome",
								value: (row: Row) => row.skipReason ?? row.status,
							},
							{ header: "Sent", value: (row: Row) => row.sentAt },
							{ header: "Opened", value: (row: Row) => row.openedAt },
							{ header: "Clicked", value: (row: Row) => row.clickedAt },
							{ header: "Replied", value: (row: Row) => row.repliedAt },
						]}
						fetchPage={async (page, pageSize) => {
							const result = await queryClient.fetchQuery(
								trpc.marketingCampaigns.recipients.queryOptions({
									...input,
									campaignId,
									state,
									page,
									pageSize,
								}),
							);
							return result.rows;
						}}
						onDone={(count, capped) =>
							toast.success(
								capped
									? `${count.toLocaleString()} rows exported. The rest are over the limit.`
									: `${count.toLocaleString()} rows exported.`,
							)
						}
						onError={(message) => toast.error(message)}
					/>
				}
				onRowClick={(row) =>
					row.contactId && openRecord({ kind: "contact", id: row.contactId })
				}
				empty="Nobody yet. This fills in as the campaign sends."
			/>
		</div>
	);
}
