"use client";

import { Button } from "@crm/ui/components/button";
import { DataTable, type DataTableColumn } from "@crm/ui/components/data-table";
import { EmptyCellValue } from "@crm/ui/components/empty-cell";
import { ExportCsv } from "@crm/ui/components/export-csv";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useOpenRecord } from "@/components/crm/record-sheet/record-stack";
import { ListSearch } from "@/components/data-table/list-search";
import { useTableQuery } from "@/components/data-table/use-table-query";
import { LocalRelativeDate } from "@/components/local-date-time";
import { useTRPC } from "@/lib/trpc/client";
import type { RouterOutputs } from "@/lib/trpc/types";
import { enrolmentsSearchParams } from "./campaign-people-search-params";

type Row = RouterOutputs["marketingCampaigns"]["enrolments"]["rows"][number];

const PHASES = [
	{ value: "active", label: "Still walking" },
	{ value: "stuck", label: "Overdue" },
	{ value: "exited", label: "Left" },
];

function nameOf(row: Row): string {
	const person = row.contact;
	return (
		[person.firstName, person.lastName].filter(Boolean).join(" ") ||
		person.email ||
		"Somebody"
	);
}

function whereNow(row: Row): string {
	if (row.status === "EXITED") {
		return (
			row.exitReason ?? `Left: ${row.exitKind?.toLowerCase() ?? "no reason"}`
		);
	}
	return row.nodeLabel ?? "Not started";
}

export function CampaignEnrolments({ campaignId }: { campaignId: string }) {
	const trpc = useTRPC();
	const queryClient = useQueryClient();
	const openRecord = useOpenRecord();
	const { query, input } = useTableQuery(enrolmentsSearchParams);

	const phase = query.filters.phase ?? "all";

	const enrolments = useQuery({
		...trpc.marketingCampaigns.enrolments.queryOptions({
			...input,
			campaignId,
			state: phase,
		}),
		placeholderData: (previous) => previous,
	});

	const unenrol = useMutation(
		trpc.marketingCampaigns.unenrol.mutationOptions({
			onSuccess: () => {
				toast.success("Removed. Their queued emails are cancelled.");
				void queryClient.invalidateQueries({
					queryKey: trpc.marketingCampaigns.enrolments.pathKey(),
				});
				void queryClient.invalidateQueries({
					queryKey: trpc.marketingCampaigns.byId.queryKey({ id: campaignId }),
				});
			},
			onError: (error) => toast.error(error.message),
		}),
	);

	const rows = enrolments.data?.rows ?? [];

	const columns: DataTableColumn<Row>[] = [
		{
			id: "name",
			header: "Person",
			hideable: false,
			width: "w-[22%]",
			cell: (row) => (
				<span className="truncate font-medium">{nameOf(row)}</span>
			),
		},
		{
			id: "email",
			header: "Address",
			width: "w-[20%]",
			hideBelow: "md",
			cell: (row) =>
				row.contact.email ? (
					<span className="truncate text-muted-foreground">
						{row.contact.email}
					</span>
				) : (
					<EmptyCellValue />
				),
		},
		{
			id: "where",
			header: "Where they are",
			width: "w-[22%]",
			cell: (row) => <span className="truncate">{whereNow(row)}</span>,
		},
		{
			id: "nextDueAt",
			header: "Next touch",
			width: "w-[14%]",
			hideBelow: "sm",
			cell: (row) =>
				row.status !== "ACTIVE" || !row.nextDueAt ? (
					<EmptyCellValue />
				) : (
					<span
						className={row.stuck ? "text-destructive" : "text-muted-foreground"}
					>
						<LocalRelativeDate date={row.nextDueAt} />
						{row.stuck ? " · overdue" : null}
					</span>
				),
		},
		{
			id: "pass",
			header: "Pass",
			align: "right",
			width: "w-[6%]",
			hideBelow: "lg",
			cell: (row) => <span className="tabular-nums">{row.pass}</span>,
		},
		{
			id: "enrolledAt",
			header: "Entered",
			sortable: true,
			width: "w-[10%]",
			hideBelow: "md",
			cell: (row) => (
				<span className="text-muted-foreground">
					<LocalRelativeDate date={row.enrolledAt} />
				</span>
			),
		},
		{
			id: "remove",
			header: "",
			width: "w-[6%]",
			align: "right",
			hideable: false,
			cell: (row) =>
				row.status === "ACTIVE" ? (
					<Button
						variant="ghost"
						size="sm"
						disabled={unenrol.isPending}
						onClick={(event) => {
							event.stopPropagation();
							unenrol.mutate({ id: row.id });
						}}
					>
						Remove
					</Button>
				) : null,
		},
	];

	return (
		<div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto p-4">
			<DataTable
				query={query}
				search={<ListSearch placeholder="Search people…" />}
				columns={columns}
				rows={rows}
				total={enrolments.data?.total ?? 0}
				getRowId={(row) => row.id}
				facets={[{ id: "phase", label: "Phase", options: PHASES }]}
				loading={enrolments.isPending}
				actions={
					<ExportCsv
						name={`enrolments-${phase}`}
						total={enrolments.data?.total ?? 0}
						disabled={enrolments.isFetching}
						columns={[
							{ header: "Name", value: nameOf },
							{ header: "Address", value: (row: Row) => row.contact.email },
							{ header: "Status", value: (row: Row) => row.status },
							{ header: "Where they are", value: whereNow },
							{ header: "Next touch", value: (row: Row) => row.nextDueAt },
							{ header: "Overdue", value: (row: Row) => row.stuck },
							{ header: "Pass", value: (row: Row) => row.pass },
							{ header: "Entered", value: (row: Row) => row.enrolledAt },
						]}
						fetchPage={async (page, pageSize) => {
							const result = await queryClient.fetchQuery(
								trpc.marketingCampaigns.enrolments.queryOptions({
									...input,
									campaignId,
									state: phase,
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
					openRecord({ kind: "contact", id: row.contact.id })
				}
				empty="Nobody has entered this campaign yet."
				meta={
					<span className="text-muted-foreground text-xs">
						Overdue means the next touch was due more than six hours ago and has
						not gone. That is the jam to look at.
					</span>
				}
			/>
		</div>
	);
}
