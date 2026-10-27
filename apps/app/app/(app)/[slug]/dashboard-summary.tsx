"use client";

import { Button } from "@crm/ui/components/button";
import {
	Card,
	CardAction,
	CardDescription,
	CardHeader,
	CardPanelEmpty,
	CardTitle,
} from "@crm/ui/components/card";
import { Checkbox } from "@crm/ui/components/checkbox";
import { DashboardPanel } from "@crm/ui/components/dashboard";
import { EmptyCellValue } from "@crm/ui/components/empty-cell";
import {
	EntityLogo,
	type EntityLogoTone,
} from "@crm/ui/components/entity-logo";
import { PageShellLoading } from "@crm/ui/components/page-shell";
import {
	SimpleTable,
	type SimpleTableColumn,
	SimpleTableRow,
} from "@crm/ui/components/simple-table";
import { StatusIndicator } from "@crm/ui/components/status-indicator";
import { TableCell } from "@crm/ui/components/table";
import { ValueMeter } from "@crm/ui/components/value-meter";
import { formatCount, formatMoneyCompact } from "@crm/ui/lib/format";
import { useMutation, useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useQueryState } from "nuqs";
import type { ReactNode } from "react";
import { toast } from "sonner";
import { DealStageIndicator } from "@/components/crm/deal-stage";
import { RecordLink } from "@/components/crm/record-sheet/record-link";
import { useOpenRecord } from "@/components/crm/record-sheet/record-stack";
import { LocalRelativeTime } from "@/components/local-date-time";
import { activityLabel } from "@/lib/activity-presentation";
import { dealStageChartColor } from "@/lib/deal-stage";
import { SEARCH_PARAM } from "@/lib/search-param-keys";
import { useCrmCache } from "@/lib/trpc/cache";
import { useTRPC } from "@/lib/trpc/client";
import { useWorkspaceUrl } from "@/lib/use-workspace-url";
import { overviewParsers } from "./overview-search-params";
import { SalesDashboard } from "./sales-dashboard";

const CELL = "px-3 py-2.5 align-middle";
const STAGE_CELL = "hidden @lg/simple-table:table-cell";
const SHARE_CELL = "hidden @sm/simple-table:table-cell";
const COMPANY_CELL = "hidden @md/simple-table:table-cell";
const ACTIVITY_DEAL_CELL = "hidden @2xl/simple-table:table-cell";
const WHO_CELL = "hidden @lg/simple-table:table-cell";
const OPEN_COLUMNS: SimpleTableColumn[] = [
	{ id: "deal", header: "Deal" },
	{
		id: "stage",
		header: "Stage",
		width: "w-44",
		className: STAGE_CELL,
	},
	{
		id: "share",
		srLabel: "Share of the largest",
		width: "w-24",
		className: SHARE_CELL,
	},
	{ id: "value", header: "Value", width: "w-20", align: "right" },
];
const TASK_COLUMNS: SimpleTableColumn[] = [
	{ id: "done", srLabel: "Done", width: "w-8" },
	{ id: "task", header: "Task" },
	{ id: "overdue", header: "Overdue", width: "w-24", align: "right" },
];
const ACTIVITY_COLUMNS: SimpleTableColumn[] = [
	{ id: "activity", header: "Activity" },
	{
		id: "company",
		header: "Company",
		width: "w-44",
		className: COMPANY_CELL,
	},
	{
		id: "deal",
		header: "Deal",
		width: "w-48",
		className: ACTIVITY_DEAL_CELL,
	},
	{
		id: "who",
		header: "Who",
		width: "w-32",
		className: WHO_CELL,
	},
	{ id: "when", header: "When", width: "w-20", align: "right" },
];

export function DashboardSummary() {
	const trpc = useTRPC();
	const cache = useCrmCache();
	const openRecord = useOpenRecord();
	const workspaceUrl = useWorkspaceUrl();

	const [scope] = useQueryState(
		SEARCH_PARAM.overview.scope,
		overviewParsers[SEARCH_PARAM.overview.scope],
	);

	const summaryQuery = useQuery({
		...trpc.dashboard.summary.queryOptions({ scope }),
		placeholderData: (previous) => previous,
	});

	const complete = useMutation(
		trpc.activities.complete.mutationOptions({
			onSuccess: () => cache.activity(),
			onError: (error) => toast.error(error.message),
		}),
	);

	const summary = summaryQuery.data;

	if (!summary) {
		return <PageShellLoading shape="dashboard" />;
	}

	const { biggestOpen, overdueTasks, recentActivity } = summary;

	const mine = scope === "me";
	const largestOpenCents = biggestOpen[0]?.baseAmountCents ?? 0;

	return (
		<div className="flex flex-col gap-6">
			<SalesDashboard summary={summary} />

			<div className="grid gap-6 @3xl/page-content:grid-cols-2">
				<Card className="min-w-0">
					<CardHeader>
						<CardTitle>Deals in progress</CardTitle>
						<CardDescription>
							The largest open deals, and how long each has sat in its stage
						</CardDescription>
						<CardAction>
							<Button asChild variant="outline" size="sm">
								<Link href={workspaceUrl("/deals")}>Open deals</Link>
							</Button>
						</CardAction>
					</CardHeader>
					<DashboardPanel>
						{biggestOpen.length === 0 ? (
							<CardPanelEmpty>
								Nothing open. Time to fill the pipeline.
							</CardPanelEmpty>
						) : (
							<SimpleTable
								variant="panel"
								surface="card"
								columns={OPEN_COLUMNS}
							>
								{biggestOpen.map((deal) => (
									<SimpleTableRow
										key={deal.id}
										clickable
										onClick={() =>
											openRecord(
												{ kind: "deal", id: deal.id },
												biggestOpen.map((entry) => ({
													kind: "deal",
													id: entry.id,
												})),
											)
										}
									>
										<TableCell className={CELL}>
											<DealCell
												name={deal.name}
												company={deal.company}
												meta={<LocalRelativeTime date={deal.stageChangedAt} />}
											/>
										</TableCell>
										<TableCell className={`${CELL} ${STAGE_CELL}`}>
											<DealStageIndicator stage={deal.stage} />
										</TableCell>
										<TableCell className={`${CELL} ${SHARE_CELL}`}>
											<ValueMeter
												share={
													largestOpenCents > 0
														? ((deal.baseAmountCents ?? 0) / largestOpenCents) *
															100
														: 0
												}
												color={dealStageChartColor(deal.stage)}
											/>
										</TableCell>
										<TableCell className={`${CELL} text-right tabular-nums`}>
											{deal.amountCents === null ? (
												<EmptyCellValue />
											) : (
												formatMoneyCompact(deal.amountCents, deal.currency)
											)}
										</TableCell>
									</SimpleTableRow>
								))}
							</SimpleTable>
						)}
					</DashboardPanel>
				</Card>

				<Card className="min-w-0">
					<CardHeader>
						<CardTitle>Overdue tasks</CardTitle>
						<CardDescription>
							{overdueTasks.length === 0
								? "Every task you have logged is either done or still to come"
								: `${formatCount(overdueTasks.length, "task")} past due`}
						</CardDescription>
						<CardAction>
							<Button asChild variant="outline" size="sm">
								<Link href={workspaceUrl("/tasks")}>Open tasks</Link>
							</Button>
						</CardAction>
					</CardHeader>
					<DashboardPanel>
						{overdueTasks.length === 0 ? (
							<CardPanelEmpty>Nothing overdue. Good.</CardPanelEmpty>
						) : (
							<SimpleTable
								variant="panel"
								surface="card"
								columns={TASK_COLUMNS}
							>
								{overdueTasks.map((task) => (
									<SimpleTableRow key={task.id}>
										<TableCell className={CELL}>
											<Checkbox
												checked={false}
												disabled={complete.isPending}
												aria-label="Mark as done"
												onCheckedChange={() =>
													complete.mutate({ id: task.id, completed: true })
												}
											/>
										</TableCell>
										<TableCell className={CELL}>
											<span className="flex min-w-0 flex-col">
												<span className="truncate">{task.subject}</span>
												<span className="flex min-w-0 text-muted-foreground">
													{task.deal ? (
														<RecordLink kind="deal" id={task.deal.id}>
															{task.deal.name}
														</RecordLink>
													) : task.company ? (
														<RecordLink kind="company" id={task.company.id}>
															{task.company.name}
														</RecordLink>
													) : null}
												</span>
											</span>
										</TableCell>
										<TableCell className={`${CELL} text-right`}>
											<StatusIndicator
												tone="error"
												label={
													task.dueAt ? (
														<LocalRelativeTime date={task.dueAt} />
													) : (
														"No due date"
													)
												}
											/>
										</TableCell>
									</SimpleTableRow>
								))}
							</SimpleTable>
						)}
					</DashboardPanel>
				</Card>
			</div>

			<Card className="min-w-0">
				<CardHeader>
					<CardTitle>
						{mine ? "Your recent activity" : "Recent activity"}
					</CardTitle>
					<CardDescription>
						{mine
							? "Every note, task and stage change you have logged"
							: "Every note, task and stage change across the workspace"}
					</CardDescription>
					<CardAction>
						<Button asChild variant="outline" size="sm">
							<Link href={workspaceUrl("/companies")}>All companies</Link>
						</Button>
					</CardAction>
				</CardHeader>
				<DashboardPanel>
					{recentActivity.length === 0 ? (
						<CardPanelEmpty>Nothing has happened yet.</CardPanelEmpty>
					) : (
						<SimpleTable
							variant="panel"
							surface="card"
							columns={ACTIVITY_COLUMNS}
						>
							{recentActivity.map((entry) => (
								<SimpleTableRow key={entry.id}>
									<TableCell className={CELL}>
										<span className="truncate">
											{entry.subject ?? activityLabel(entry.type)}
										</span>
									</TableCell>
									<TableCell className={`${CELL} ${COMPANY_CELL}`}>
										{entry.company ? (
											<RecordLink kind="company" id={entry.company.id}>
												{entry.company.name}
											</RecordLink>
										) : (
											<EmptyCellValue />
										)}
									</TableCell>
									<TableCell className={`${CELL} ${ACTIVITY_DEAL_CELL}`}>
										{entry.deal ? (
											<RecordLink kind="deal" id={entry.deal.id}>
												{entry.deal.name}
											</RecordLink>
										) : (
											<EmptyCellValue />
										)}
									</TableCell>
									<TableCell
										className={`${CELL} ${WHO_CELL} truncate text-muted-foreground`}
									>
										{entry.createdBy.name}
									</TableCell>
									<TableCell
										className={`${CELL} text-right text-muted-foreground`}
									>
										<LocalRelativeTime date={entry.createdAt} />
									</TableCell>
								</SimpleTableRow>
							))}
						</SimpleTable>
					)}
				</DashboardPanel>
			</Card>
		</div>
	);
}

function DealCell({
	name,
	company,
	meta,
}: {
	name: string;
	company: {
		name: string;
		iconUrl: string | null;
		iconDarkUrl: string | null;
		iconTone: string | null;
	};
	meta?: ReactNode;
}) {
	return (
		<span className="flex min-w-0 items-center gap-2">
			<EntityLogo
				src={company.iconUrl}
				darkSrc={company.iconDarkUrl}
				tone={company.iconTone as EntityLogoTone | null | undefined}
				name={company.name}
				size="sm"
			/>
			<span className="flex min-w-0 flex-col">
				<span className="truncate font-medium">{name}</span>
				<span className="flex min-w-0 items-baseline gap-x-3 text-muted-foreground">
					<span className="truncate">{company.name}</span>
					{meta ? <span className="shrink-0">{meta}</span> : null}
				</span>
			</span>
		</span>
	);
}
