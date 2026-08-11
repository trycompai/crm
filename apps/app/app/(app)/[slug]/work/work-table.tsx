"use client";

import Task from "@carbon/icons-react/es/Task";
import { Badge } from "@crm/ui/components/badge";
import { Button } from "@crm/ui/components/button";
import {
	DataTable,
	type DataTableColumn,
	type DataTableFacet,
} from "@crm/ui/components/data-table";
import { EmptyCellValue } from "@crm/ui/components/empty-cell";
import { Icon } from "@crm/ui/components/icon";
import {
	StatusIndicator,
	type StatusTone,
} from "@crm/ui/components/status-indicator";
import { useQuery } from "@tanstack/react-query";
import { parseAsString, useQueryState } from "nuqs";
import { useCallback, useMemo } from "react";
import { OwnerCell } from "@/components/crm/owner-cell";
import { ListSearch } from "@/components/data-table/list-search";
import { useTableQuery } from "@/components/data-table/use-table-query";
import {
	DetailSheet,
	DetailSheetBody,
	DetailSheetEmpty,
	DetailSheetHeader,
	DetailSheetProperties,
	DetailSheetProperty,
	DetailSheetProse,
	DetailSheetSection,
} from "@/components/detail-sheet";
import { LocalDateTime, LocalRelativeTime } from "@/components/local-date-time";
import { useTRPC } from "@/lib/trpc/client";
import type { RouterOutputs } from "@/lib/trpc/types";
import { toWorkListInput, workFocusHistory } from "@/lib/work-input";
import { workSearchParams } from "./work-search-params";

type WorkRow = RouterOutputs["work"]["list"]["rows"][number];
type WorkState = WorkRow["state"];
type WorkFocusData = {
	subject: { label: string | null; type: string };
	queue: string;
	state: WorkState;
	primaryAction: string;
	reason: string;
	evidence: unknown;
	owner: {
		id: string;
		name: string;
		email: string;
		image: string | null;
	} | null;
	urgency: string;
	dueAt: string | null;
	nextReviewAt: string | null;
	createdAt: string;
	updatedAt: string;
};

const STATE_LABELS: Record<WorkState, string> = {
	OPEN: "Open",
	IN_PROGRESS: "In progress",
	WAITING: "Waiting",
	BLOCKED: "Blocked",
	DONE: "Done",
	DISMISSED: "Dismissed",
};

const STATE_TONES: Record<WorkState, StatusTone> = {
	OPEN: "info",
	IN_PROGRESS: "primary",
	WAITING: "warning",
	BLOCKED: "error",
	DONE: "success",
	DISMISSED: "neutral",
};

const STATE_OPTIONS = Object.entries(STATE_LABELS).map(([value, label]) => ({
	value,
	label,
}));

const DUE_OPTIONS = [
	{ value: "overdue", label: "Overdue" },
	{ value: "today", label: "Due today" },
	{ value: "upcoming", label: "Upcoming" },
	{ value: "none", label: "No due date" },
];

function facetOptions(
	counts: Record<string, number> | undefined,
	labels?: Record<string, string>,
) {
	return Object.keys(counts ?? {})
		.sort()
		.map((value) => ({ value, label: labels?.[value] ?? value }));
}

function displayValue(value: unknown): string {
	if (typeof value === "string") return value;
	if (value == null) return "—";
	try {
		return JSON.stringify(value);
	} catch {
		return "—";
	}
}

function columnsForWork(
	onFocus: (id: string) => void,
): DataTableColumn<WorkRow>[] {
	return [
		{
			id: "subject",
			header: "Work",
			sortable: true,
			hideable: false,
			width: "w-[30%]",
			cell: (row) => (
				<Button
					variant="ghost"
					size="sm"
					className="-ml-2 min-w-0 max-w-full justify-start text-left font-medium"
					type="button"
					data-work-focus={row.id}
					onClick={(event) => {
						event.stopPropagation();
						onFocus(row.id);
					}}
				>
					<span className="flex min-w-0 items-center gap-2">
						<Icon icon={Task} />
						<span className="truncate">
							{row.subject.label ?? "Untitled work"}
						</span>
					</span>
				</Button>
			),
		},
		{
			id: "state",
			header: "State",
			sortable: true,
			width: "w-[15%]",
			cell: (row) => (
				<StatusIndicator
					tone={STATE_TONES[row.state]}
					label={STATE_LABELS[row.state]}
					size="sm"
				/>
			),
		},
		{
			id: "queue",
			header: "Queue",
			sortable: true,
			width: "w-[14%]",
			hideBelow: "md",
			cell: (row) => <span className="truncate">{row.queue}</span>,
		},
		{
			id: "urgency",
			header: "Urgency",
			sortable: true,
			width: "w-[14%]",
			hideBelow: "lg",
			cell: (row) => <span className="truncate">{row.urgency}</span>,
		},
		{
			id: "owner",
			header: "Owner",
			sortable: true,
			width: "w-[17%]",
			hideBelow: "md",
			cell: (row) => <OwnerCell owner={row.owner} />,
		},
		{
			id: "dueAt",
			header: "Due",
			label: "Due date",
			sortable: true,
			align: "right",
			width: "w-[14%]",
			hideBelow: "sm",
			cell: (row) =>
				row.dueAt ? (
					<span className="text-muted-foreground">
						<LocalRelativeTime date={row.dueAt} />
					</span>
				) : (
					<EmptyCellValue />
				),
		},
		{
			id: "updatedAt",
			header: "Updated",
			label: "Updated date",
			sortable: true,
			align: "right",
			width: "w-[14%]",
			defaultHidden: true,
			cell: (row) => (
				<span className="text-muted-foreground">
					<LocalRelativeTime date={row.updatedAt} />
				</span>
			),
		},
	];
}

export function WorkTable() {
	const trpc = useTRPC();
	const { query, input: rawInput } = useTableQuery(workSearchParams);
	const [focusId, setFocusId] = useQueryState("work", parseAsString);
	const input = toWorkListInput(rawInput);
	const work = useQuery({
		...trpc.work.list.queryOptions(input),
		placeholderData: (previous) => previous,
	});
	const detail = useQuery({
		...trpc.work.detail.queryOptions({ id: focusId ?? "" }),
		enabled: focusId !== null,
	});
	const users = useQuery(trpc.users.list.queryOptions());

	const focus = useCallback(
		(id: string) => void setFocusId(id, { history: workFocusHistory(true) }),
		[setFocusId],
	);
	const columns = useMemo(() => columnsForWork(focus), [focus]);

	const facetCounts = work.data?.facetCounts;
	const facets: DataTableFacet[] = useMemo(
		() => [
			{
				id: "state",
				label: "State",
				options: STATE_OPTIONS.filter(
					(option) => (facetCounts?.state?.[option.value] ?? 0) > 0,
				),
			},
			{
				id: "queue",
				label: "Queue",
				options: facetOptions(facetCounts?.queue),
			},
			{
				id: "assignee",
				label: "Owner",
				options: [
					{ value: "me", label: "My work" },
					{ value: "unassigned", label: "Unassigned" },
					...(users.data ?? []).map((user) => ({
						value: user.id,
						label: user.name,
					})),
				].filter((option) => (facetCounts?.owner?.[option.value] ?? 0) > 0),
			},
			{
				id: "due",
				label: "Due",
				options: DUE_OPTIONS,
			},
			{
				id: "subjectType",
				label: "Subject type",
				options: facetOptions(facetCounts?.subjectType),
			},
		],
		[facetCounts, users.data],
	);

	return (
		<>
			<DataTable
				query={query}
				search={
					<ListSearch
						placeholder="Search work, reason, action or queue…"
						label="Search work"
					/>
				}
				columns={columns}
				rows={work.data?.rows ?? []}
				total={work.data?.total ?? 0}
				facetCounts={facetCounts}
				facets={facets}
				getRowId={(row) => row.id}
				loading={work.isFetching}
				onRowClick={(row) => focus(row.id)}
				empty={
					work.isError
						? "Work could not be loaded. Try again."
						: "No work matches this view."
				}
			/>
			<DetailSheet
				open={focusId !== null}
				onOpenChange={(open) => {
					if (!open)
						void setFocusId(null, { history: workFocusHistory(false) });
				}}
			>
				{detail.isPending ? (
					<DetailSheetEmpty
						icon={Task}
						title="Loading work"
						description="The selected work item is loading."
					/>
				) : detail.isError || !detail.data ? (
					<DetailSheetEmpty
						icon={Task}
						title="Work unavailable"
						description="This work item could not be loaded or is no longer available."
					/>
				) : (
					<WorkFocus
						work={detail.data}
						onClose={() =>
							void setFocusId(null, { history: workFocusHistory(false) })
						}
					/>
				)}
			</DetailSheet>
		</>
	);
}

function WorkFocus({
	work,
	onClose,
}: {
	work: WorkFocusData;
	onClose: () => void;
}) {
	return (
		<>
			<DetailSheetHeader
				title={work.subject.label ?? "Untitled work"}
				description={`${work.subject.type} · ${work.queue}`}
				note={
					<StatusIndicator
						tone={STATE_TONES[work.state]}
						label={STATE_LABELS[work.state]}
						size="sm"
					/>
				}
				onClose={onClose}
			/>
			<DetailSheetBody>
				<DetailSheetSection title="Next action">
					<Badge variant="outline">{work.primaryAction}</Badge>
					<DetailSheetProse>
						Action controls are available only when the server supplies an
						explicit capability for this item.
					</DetailSheetProse>
				</DetailSheetSection>
				<DetailSheetSection title="Why this is here">
					<DetailSheetProse>{work.reason}</DetailSheetProse>
				</DetailSheetSection>
				<DetailSheetSection title="Evidence">
					<DetailSheetProse>{displayValue(work.evidence)}</DetailSheetProse>
				</DetailSheetSection>
				<DetailSheetSection title="Details">
					<DetailSheetProperties>
						<DetailSheetProperty label="Owner">
							<OwnerCell owner={work.owner} />
						</DetailSheetProperty>
						<DetailSheetProperty label="Urgency">
							{work.urgency}
						</DetailSheetProperty>
						<DetailSheetProperty label="Due">
							{work.dueAt ? (
								<LocalDateTime
									date={work.dueAt}
									options={{ dateStyle: "medium" }}
								/>
							) : (
								"—"
							)}
						</DetailSheetProperty>
						<DetailSheetProperty label="Next review">
							{work.nextReviewAt ? (
								<LocalDateTime
									date={work.nextReviewAt}
									options={{ dateStyle: "medium" }}
								/>
							) : (
								"—"
							)}
						</DetailSheetProperty>
					</DetailSheetProperties>
				</DetailSheetSection>
				<DetailSheetSection title="History">
					<DetailSheetProse>
						Created{" "}
						<LocalDateTime
							date={work.createdAt}
							options={{ dateStyle: "medium", timeStyle: "short" }}
						/>
						. Last updated{" "}
						<LocalDateTime
							date={work.updatedAt}
							options={{ dateStyle: "medium", timeStyle: "short" }}
						/>
						.
					</DetailSheetProse>
				</DetailSheetSection>
			</DetailSheetBody>
		</>
	);
}
