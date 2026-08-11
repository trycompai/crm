"use client";

import ArrowRight from "@carbon/icons-react/es/ArrowRight";
import Calendar from "@carbon/icons-react/es/Calendar";
import Checkmark from "@carbon/icons-react/es/Checkmark";
import Play from "@carbon/icons-react/es/Play";
import Task from "@carbon/icons-react/es/Task";
import Time from "@carbon/icons-react/es/Time";
import WarningAlt from "@carbon/icons-react/es/WarningAlt";
import { Badge } from "@crm/ui/components/badge";
import { Button } from "@crm/ui/components/button";
import {
	Card,
	CardDescription,
	CardHeader,
	CardPanel,
	CardPanelEmpty,
	CardTitle,
} from "@crm/ui/components/card";
import {
	Empty,
	EmptyContent,
	EmptyDescription,
	EmptyHeader,
	EmptyMedia,
	EmptyTitle,
} from "@crm/ui/components/empty";
import type { CarbonIcon } from "@crm/ui/components/icon";
import { Icon } from "@crm/ui/components/icon";
import { Spinner } from "@crm/ui/components/spinner";
import {
	StatusIndicator,
	type StatusTone,
} from "@crm/ui/components/status-indicator";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { parseAsString, useQueryState } from "nuqs";
import { useCallback } from "react";
import { useTRPC } from "@/lib/trpc/client";
import type { RouterOutputs } from "@/lib/trpc/types";
import { useWorkspaceUrl } from "@/lib/use-workspace-url";
import { ApprovalFocusSheet } from "./approval-focus-sheet";
import { todayFocusHistory } from "./today-search-params";

type TodayData = RouterOutputs["today"]["get"];
type TodaySectionKey = keyof TodayData["sections"];
export type TodayRow = TodayData["sections"]["doNext"]["rows"][number];

type SectionDefinition = {
	key: TodaySectionKey;
	title: string;
	description: string;
	icon: CarbonIcon;
};

const SECTION_DEFINITIONS: readonly SectionDefinition[] = [
	{
		key: "doNext",
		title: "Do next",
		description: "Operator-owned work ready to move.",
		icon: Task,
	},
	{
		key: "needsApproval",
		title: "Needs approval",
		description: "Governed actions waiting for a decision.",
		icon: Checkmark,
	},
	{
		key: "waiting",
		title: "Waiting",
		description: "Work paused for its next review point.",
		icon: Time,
	},
	{
		key: "blockedOrFailed",
		title: "Blocked or failed",
		description: "Items that need diagnosis or an unblock.",
		icon: WarningAlt,
	},
	{
		key: "running",
		title: "Running",
		description: "Work and agent activity in progress.",
		icon: Play,
	},
	{
		key: "incidents",
		title: "Incidents",
		description: "Unresolved operational attention points.",
		icon: Calendar,
	},
];

const STATE_TONES: Record<string, StatusTone> = {
	OPEN: "info",
	IN_PROGRESS: "primary",
	WAITING: "warning",
	BLOCKED: "error",
	FAILED: "error",
	UNKNOWN: "error",
	RUNNING: "primary",
	LEASED: "primary",
	PENDING: "warning",
};

function stateLabel(state: string): string {
	return state
		.toLocaleLowerCase()
		.replaceAll("_", " ")
		.replace(/(^| )\S/g, (letter) => letter.toUpperCase());
}

function rowSubject(row: TodayRow): string {
	return row.subject?.label ?? `${stateLabel(row.kind)} ${row.id}`;
}

function rowDetail(row: TodayRow): string {
	return [row.primaryAction, row.reason].filter(Boolean).join(" · ");
}

export function TodayDesk() {
	const trpc = useTRPC();
	const workspaceUrl = useWorkspaceUrl();
	const [approvalId, setApprovalId] = useQueryState("approval", parseAsString);
	const today = useQuery({
		...trpc.today.get.queryOptions({ limit: 25 }),
		placeholderData: (previous) => previous,
		refetchInterval: 15_000,
	});

	const openApproval = useCallback(
		(id: string) =>
			void setApprovalId(id, { history: todayFocusHistory(true) }),
		[setApprovalId],
	);
	const closeApproval = useCallback(
		() => void setApprovalId(null, { history: todayFocusHistory(false) }),
		[setApprovalId],
	);

	if (!today.data && today.isPending) return <TodayLoading />;
	if (!today.data && today.isError) {
		return (
			<Empty>
				<EmptyHeader>
					<EmptyMedia variant="icon">
						<Icon icon={WarningAlt} />
					</EmptyMedia>
					<EmptyTitle>Today could not load</EmptyTitle>
					<EmptyDescription>
						The operating desk is unavailable. Try again when the API is
						reachable.
					</EmptyDescription>
				</EmptyHeader>
				<EmptyContent>
					<Button type="button" onClick={() => void today.refetch()}>
						Try again
					</Button>
				</EmptyContent>
			</Empty>
		);
	}

	if (!today.data) return null;

	return (
		<>
			<div
				className="flex flex-col gap-4"
				aria-busy={today.isFetching}
				data-today-desk
			>
				<span className="sr-only" aria-live="polite">
					{today.isFetching ? "Refreshing Today" : "Today is current"}
				</span>
				<div className="grid gap-4 @2xl/page-content:grid-cols-2 @5xl/page-content:grid-cols-3">
					{SECTION_DEFINITIONS.map((definition) => (
						<TodaySectionCard
							key={definition.key}
							definition={definition}
							section={today.data.sections[definition.key]}
							workspaceUrl={workspaceUrl}
							onApproval={openApproval}
						/>
					))}
				</div>
			</div>
			<ApprovalFocusSheet
				key={approvalId ?? "closed"}
				approvalId={approvalId}
				onClose={closeApproval}
			/>
		</>
	);
}

function TodayLoading() {
	return (
		<div className="flex min-h-64 items-center justify-center" aria-busy="true">
			<Spinner size="lg" />
		</div>
	);
}

export function TodaySectionCard({
	definition,
	section,
	workspaceUrl,
	onApproval,
}: {
	definition: SectionDefinition;
	section: TodayData["sections"][TodaySectionKey];
	workspaceUrl: (path?: string) => string;
	onApproval: (id: string) => void;
}) {
	return (
		<Card className="min-w-0">
			<CardHeader>
				<div className="flex items-center gap-2">
					<Icon icon={definition.icon} />
					<CardTitle>{definition.title}</CardTitle>
					<Badge variant="secondary" className="ml-auto tabular-nums">
						{section.total}
					</Badge>
				</div>
				<CardDescription>{definition.description}</CardDescription>
			</CardHeader>
			<CardPanel>
				{section.rows.length === 0 ? (
					<CardPanelEmpty>{emptyMessage(definition.key)}</CardPanelEmpty>
				) : (
					<div className="flex flex-col gap-1">
						{section.rows.map((row) => (
							<TodayRowView
								key={`${row.kind}:${row.id}`}
								row={row}
								workspaceUrl={workspaceUrl}
								onApproval={onApproval}
							/>
						))}
					</div>
				)}
			</CardPanel>
		</Card>
	);
}

function emptyMessage(key: TodaySectionKey): string {
	return {
		doNext: "Nothing needs doing right now.",
		needsApproval: "No decisions are waiting.",
		waiting: "Nothing is waiting for review.",
		blockedOrFailed: "No blocked or failed work.",
		running: "Nothing is running.",
		incidents: "No unresolved incidents.",
	}[key];
}

export function TodayRowView({
	row,
	workspaceUrl,
	onApproval,
}: {
	row: TodayRow;
	workspaceUrl: (path?: string) => string;
	onApproval: (id: string) => void;
}) {
	const content = (
		<span className="flex min-w-0 flex-1 flex-col gap-1 text-left">
			<span className="flex min-w-0 items-center gap-2">
				<StatusIndicator
					tone={STATE_TONES[row.state] ?? "neutral"}
					label={stateLabel(row.state)}
					size="sm"
				/>
				<span className="truncate font-medium">{rowSubject(row)}</span>
			</span>
			<span className="truncate text-muted-foreground text-xs">
				{rowDetail(row)}
			</span>
		</span>
	);

	if (row.kind === "work") {
		return (
			<Button
				asChild
				variant="ghost"
				size="sm"
				className="h-auto min-h-12 w-full justify-start gap-3 px-2 py-2"
				data-today-row-kind="work"
			>
				<Link
					href={workspaceUrl(`/work?work=${encodeURIComponent(row.id)}`)}
					prefetch
					aria-label={`Open work: ${rowSubject(row)}`}
				>
					{content}
					<Icon icon={ArrowRight} data-icon="inline-end" />
				</Link>
			</Button>
		);
	}

	if (row.kind === "approval") {
		return (
			<Button
				variant="ghost"
				size="sm"
				className="h-auto min-h-12 w-full justify-start gap-3 px-2 py-2"
				onClick={() => onApproval(row.id)}
				data-today-row-kind="approval"
				aria-label={`Review approval: ${rowSubject(row)}`}
			>
				{content}
				<Icon icon={ArrowRight} data-icon="inline-end" />
			</Button>
		);
	}

	return (
		<div
			className="flex min-h-12 items-center gap-3 px-2 py-2"
			data-today-row-kind={row.kind}
		>
			{content}
		</div>
	);
}
