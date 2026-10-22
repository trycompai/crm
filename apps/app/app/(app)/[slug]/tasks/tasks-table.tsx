"use client";

import { Checkbox } from "@crm/ui/components/checkbox";
import {
	DataTable,
	type DataTableColumn,
	type DataTableFacet,
} from "@crm/ui/components/data-table";
import { EmptyCellValue } from "@crm/ui/components/empty-cell";
import { PersonAvatar } from "@crm/ui/components/person-avatar";
import { cn } from "@crm/ui/lib/utils";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { contactName } from "@/components/crm/contact-name";
import { RecordLink } from "@/components/crm/record-sheet/record-link";
import { ListSearch } from "@/components/data-table/list-search";
import { useTableQuery } from "@/components/data-table/use-table-query";
import { LocalDay, LocalRelativeTime } from "@/components/local-date-time";
import { useCrmCache } from "@/lib/trpc/cache";
import { useTRPC } from "@/lib/trpc/client";
import type { RouterOutputs } from "@/lib/trpc/types";
import { nextTaskFocusId } from "./task-focus";
import { normalizeTasksInput, tasksSearchParams } from "./tasks-search-params";

type TaskRow = RouterOutputs["activities"]["tasks"]["rows"][number];

const DUE_OPTIONS = [
	{ value: "overdue", label: "Overdue" },
	{ value: "today", label: "Today" },
	{ value: "week", label: "This week" },
	{ value: "later", label: "Later" },
	{ value: "none", label: "No due date" },
];

export function TasksTable() {
	const trpc = useTRPC();
	const cache = useCrmCache();
	const table = useTableQuery(tasksSearchParams);
	const { query } = table;
	const input = normalizeTasksInput(table.input);
	const searchRef = useRef<HTMLInputElement>(null);
	const completionRefs = useRef(new Map<string, HTMLButtonElement>());
	const [announcement, setAnnouncement] = useState("");
	const tasks = useQuery({
		...trpc.activities.tasks.queryOptions(input),
		placeholderData: (previous) => previous,
	});
	const users = useQuery(trpc.users.list.queryOptions());
	const rows = tasks.data?.rows ?? [];

	const complete = useMutation(
		trpc.activities.complete.mutationOptions({
			onError: (error) => toast.error(error.message),
		}),
	);

	const setCompleted = (row: TaskRow, completed: boolean) => {
		const rowIds = rows.map((item) => item.id);
		const remains =
			input.status === "all" ||
			(input.status === "open" ? !completed : completed);
		const focusId = nextTaskFocusId(rowIds, row.id, remains);

		complete.mutate(
			{ id: row.id, completed },
			{
				onSuccess: async () => {
					setAnnouncement(completed ? "Task completed." : "Task reopened.");
					await cache.activity();
					requestAnimationFrame(() => {
						const target = focusId ? completionRefs.current.get(focusId) : null;
						(target ?? searchRef.current)?.focus();
					});
				},
			},
		);
	};

	const today = tasks.data?.day.today ?? "";
	const columns: DataTableColumn<TaskRow>[] = [
		{
			id: "status",
			header: <span className="sr-only">Status</span>,
			label: "Status",
			sortable: true,
			hideable: false,
			width: "w-12",
			cell: (row) => (
				<Checkbox
					ref={(element) => {
						if (element) completionRefs.current.set(row.id, element);
						else completionRefs.current.delete(row.id);
					}}
					checked={row.completedAt !== null}
					disabled={complete.isPending && complete.variables?.id === row.id}
					onCheckedChange={(checked) => setCompleted(row, checked === true)}
					aria-label={`${row.completedAt ? "Reopen" : "Complete"} ${row.subject ?? "task"}`}
				/>
			),
		},
		{
			id: "subject",
			header: "Task",
			sortable: true,
			hideable: false,
			width: "w-[34%]",
			cell: (row) =>
				row.subject ? (
					<span
						className={cn(
							"truncate font-medium",
							row.completedAt && "text-muted-foreground line-through",
						)}
					>
						{row.subject}
					</span>
				) : (
					<EmptyCellValue />
				),
		},
		{
			id: "company",
			header: "Related to",
			sortable: true,
			width: "w-[24%]",
			cell: (row) => {
				if (row.deal) {
					return (
						<RecordLink kind="deal" id={row.deal.id}>
							{row.deal.name}
						</RecordLink>
					);
				}
				if (row.contact) {
					return (
						<RecordLink kind="contact" id={row.contact.id}>
							{contactName(row.contact)}
						</RecordLink>
					);
				}
				if (row.company) {
					return (
						<RecordLink kind="company" id={row.company.id}>
							{row.company.name}
						</RecordLink>
					);
				}
				return <EmptyCellValue />;
			},
		},
		{
			id: "dueAt",
			header: "Due",
			sortable: true,
			align: "right",
			width: "w-32",
			cell: (row) =>
				row.dueAt ? (
					<span
						className={cn(
							"text-muted-foreground",
							!row.completedAt && row.dueAt < today && "text-destructive",
						)}
					>
						<LocalDay date={row.dueAt} />
					</span>
				) : (
					<EmptyCellValue />
				),
		},
		{
			id: "createdBy",
			header: "Created by",
			sortable: true,
			width: "w-44",
			hideBelow: "md",
			cell: (row) => (
				<span className="flex min-w-0 items-center gap-2">
					<PersonAvatar
						src={row.createdBy.image}
						name={row.createdBy.name}
						email={row.createdBy.email}
						size="sm"
					/>
					<span className="truncate text-muted-foreground">
						{row.createdBy.name}
					</span>
				</span>
			),
		},
		{
			id: "createdAt",
			header: "Created",
			sortable: true,
			align: "right",
			width: "w-24",
			defaultHidden: true,
			cell: (row) => (
				<span className="text-muted-foreground">
					<LocalRelativeTime date={row.createdAt} />
				</span>
			),
		},
	];

	const facetCounts = tasks.data?.facetCounts;
	const facets: DataTableFacet[] = [
		{
			id: "due",
			label: "Due",
			options: DUE_OPTIONS.filter(
				(option) => (facetCounts?.due?.[option.value] ?? 0) > 0,
			),
		},
		{
			id: "createdBy",
			label: "Created by",
			options: (users.data ?? [])
				.map((user) => ({ value: user.id, label: user.name }))
				.filter((option) => (facetCounts?.createdBy?.[option.value] ?? 0) > 0),
		},
	];

	return (
		<>
			<span className="sr-only" role="status" aria-live="polite">
				{announcement}
			</span>
			<DataTable
				query={query}
				search={<ListSearch inputRef={searchRef} placeholder="Search tasks…" />}
				columns={columns}
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
				empty="No tasks match this view."
			/>
		</>
	);
}
