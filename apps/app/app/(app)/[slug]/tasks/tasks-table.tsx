"use client";

import { Checkbox } from "@crm/ui/components/checkbox";
import {
	DataTable,
	type DataTableColumn,
	type DataTableFacet,
} from "@crm/ui/components/data-table";
import { EmptyCellValue } from "@crm/ui/components/empty-cell";
import { StatusIndicator } from "@crm/ui/components/status-indicator";
import { isDayBefore } from "@crm/ui/lib/format";
import { cn } from "@crm/ui/lib/utils";
import { useMutation, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { CompanyCell } from "@/components/crm/company-cell";
import { contactName } from "@/components/crm/contact-name";
import { OwnerCell } from "@/components/crm/owner-cell";
import { RecordLink } from "@/components/crm/record-sheet/record-link";
import { usePrefetchRecord } from "@/components/crm/record-sheet/record-prefetch";
import {
	type RecordRef,
	useOpenRecord,
} from "@/components/crm/record-sheet/record-stack";
import { TASK_DUE_OPTIONS } from "@/components/crm/task-window";
import { ListSearch } from "@/components/data-table/list-search";
import { useTableQuery } from "@/components/data-table/use-table-query";
import {
	LocalDay,
	LocalRelativeDay,
	LocalRelativeTime,
} from "@/components/local-date-time";
import { useViewerDay } from "@/components/viewer-day";
import { useCrmCache } from "@/lib/trpc/cache";
import { useTRPC } from "@/lib/trpc/client";
import type { RouterOutputs } from "@/lib/trpc/types";
import { tasksSearchParams } from "./tasks-search-params";

type TaskRow = RouterOutputs["activities"]["tasks"]["rows"][number];

function taskRecord(row: TaskRow): RecordRef | null {
	if (row.deal) return { kind: "deal", id: row.deal.id };
	if (row.contact) return { kind: "contact", id: row.contact.id };
	if (row.company) return { kind: "company", id: row.company.id };
	return null;
}

function DoneCell({ row }: { row: TaskRow }) {
	const cache = useCrmCache();
	const trpc = useTRPC();

	const complete = useMutation(
		trpc.activities.complete.mutationOptions({
			onSuccess: () => cache.activity(),
			onError: (error) => toast.error(error.message),
		}),
	);

	const done = row.completedAt !== null;

	return (
		<Checkbox
			checked={done}
			disabled={complete.isPending}
			aria-label={done ? "Mark as not done" : "Mark as done"}
			onClick={(event) => event.stopPropagation()}
			onCheckedChange={() => complete.mutate({ id: row.id, completed: !done })}
		/>
	);
}

const COLUMNS: DataTableColumn<TaskRow>[] = [
	{
		id: "done",
		header: "",
		srLabel: "Done",
		hideable: false,
		width: "w-10",
		cell: (row) => <DoneCell row={row} />,
	},
	{
		id: "subject",
		header: "Task",
		sortable: true,
		hideable: false,
		width: "w-[30%]",
		cell: (row) => (
			<span
				className={cn(
					"truncate font-medium",
					row.completedAt !== null && "text-muted-foreground line-through",
				)}
			>
				{row.subject}
			</span>
		),
	},
	{
		id: "company",
		header: "Company",
		sortable: true,
		width: "w-[18%]",
		cell: (row) => <CompanyCell company={row.company} />,
	},
	{
		id: "contact",
		header: "Contact",
		width: "w-[16%]",
		hideBelow: "lg",
		cell: (row) =>
			row.contact ? (
				<RecordLink kind="contact" id={row.contact.id}>
					{contactName(row.contact)}
				</RecordLink>
			) : (
				<EmptyCellValue />
			),
	},
	{
		id: "deal",
		header: "Deal",
		width: "w-[16%]",
		hideBelow: "lg",
		cell: (row) =>
			row.deal ? (
				<RecordLink kind="deal" id={row.deal.id}>
					{row.deal.name}
				</RecordLink>
			) : (
				<EmptyCellValue />
			),
	},
	{
		id: "createdBy",
		header: "Added by",
		sortable: true,
		width: "w-[14%]",
		hideBelow: "md",
		cell: (row) => <OwnerCell owner={row.createdBy} />,
	},
	{
		id: "dueAt",
		header: "Due",
		sortable: true,
		align: "right",
		width: "w-[12%]",
		cell: (row) => <DueCell row={row} />,
	},
	{
		id: "createdAt",
		header: "Added",
		label: "Added date",
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
];

function DueCell({ row }: { row: TaskRow }) {
	const today = useViewerDay();
	if (!row.dueAt) return <EmptyCellValue />;

	if (row.completedAt === null && isDayBefore(row.dueAt, today)) {
		return (
			<StatusIndicator
				tone="error"
				label={<LocalRelativeDay date={row.dueAt} />}
			/>
		);
	}

	return (
		<span className="text-muted-foreground">
			<LocalDay date={row.dueAt} />
		</span>
	);
}

export function TasksTable() {
	const openRecord = useOpenRecord();
	const trpc = useTRPC();
	const prefetchRecord = usePrefetchRecord();
	const today = useViewerDay();
	const { query, input } = useTableQuery(tasksSearchParams);

	const tasks = useQuery({
		...trpc.activities.tasks.queryOptions({ ...input, today }),
		placeholderData: (previous) => previous,
	});
	const users = useQuery(trpc.users.list.queryOptions());

	const rows = tasks.data?.rows ?? [];
	const facetCounts = tasks.data?.facetCounts;

	const facets: DataTableFacet[] = [
		{
			id: "due",
			label: "Due",
			options: TASK_DUE_OPTIONS.flatMap((option) =>
				(facetCounts?.due?.[option.value] ?? 0) > 0
					? [{ value: option.value, label: option.label }]
					: [],
			),
		},
		{
			id: "createdBy",
			label: "Added by",
			options: (users.data ?? []).flatMap((user) =>
				(facetCounts?.createdBy?.[user.id] ?? 0) > 0
					? [{ value: user.id, label: user.name }]
					: [],
			),
		},
	];

	return (
		<DataTable
			query={query}
			search={<ListSearch placeholder="Search tasks by what, who or where…" />}
			columns={COLUMNS}
			rows={rows}
			total={tasks.data?.total ?? 0}
			facetCounts={facetCounts}
			facets={facets}
			tabs={{
				id: "status",
				allLabel: "All tasks",
				options: [
					{ value: "open", label: "Open" },
					{ value: "done", label: "Done" },
				],
			}}
			getRowId={(row) => row.id}
			loading={tasks.isFetching}
			onRowHover={(row) => {
				const record = taskRecord(row);
				if (record) prefetchRecord(record);
			}}
			onRowClick={(row) => {
				const record = taskRecord(row);
				if (record) openRecord(record);
			}}
			empty="No tasks match this view."
		/>
	);
}
