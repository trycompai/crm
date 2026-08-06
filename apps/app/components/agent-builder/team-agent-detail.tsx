"use client";

import ChevronDown from "@carbon/icons-react/es/ChevronDown";
import ChevronUp from "@carbon/icons-react/es/ChevronUp";
import Download from "@carbon/icons-react/es/Download";
import OverflowMenuVertical from "@carbon/icons-react/es/OverflowMenuVertical";
import Pause from "@carbon/icons-react/es/Pause";
import Play from "@carbon/icons-react/es/Play";
import TrashCan from "@carbon/icons-react/es/TrashCan";
import {
	AlertDialog,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "@crm/ui/components/alert-dialog";
import {
	AsyncButtonContent,
	useAsyncAction,
} from "@crm/ui/components/async-action";
import { Button } from "@crm/ui/components/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@crm/ui/components/dropdown-menu";
import { Icon } from "@crm/ui/components/icon";
import { cn } from "@crm/ui/lib/utils";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { type ReactNode, useState } from "react";
import { toast } from "sonner";
import {
	PageShell,
	PageShellActions,
	PageShellContent,
	PageShellDescription,
	PageShellHeader,
	PageShellHeading,
	PageShellTitle,
} from "@/components/page-shell";
import { useTRPC } from "@/lib/trpc/client";
import type { RouterOutputs } from "@/lib/trpc/types";
import { useWorkspaceUrl } from "@/lib/use-workspace-url";
import { AgentScopeBadges } from "./agent-scope-badges";

type AgentTab = "overview" | "runs" | "activity";
type AgentDetail = RouterOutputs["agents"]["byId"];
type ReviewVersion = AgentDetail["reviewVersion"];
type Runs = RouterOutputs["agents"]["history"];
type Activity = RouterOutputs["agents"]["activity"];
type RunRow = Omit<Runs[number], "events"> & {
	events: Array<{
		id: string;
		type: string;
		data: unknown;
		emittedAt: string;
	}>;
};
type ActivityRow = Omit<Activity[number], "before" | "after"> & {
	before: unknown;
	after: unknown;
};
const DATE_FORMATTER = new Intl.DateTimeFormat("en-US", {
	month: "short",
	day: "numeric",
	hour: "numeric",
	minute: "2-digit",
	second: "2-digit",
	timeZone: "UTC",
	timeZoneName: "short",
});
const TIME_FORMATTER = new Intl.DateTimeFormat("en-US", {
	hour: "2-digit",
	minute: "2-digit",
	second: "2-digit",
	hour12: false,
	timeZone: "UTC",
});

export function TeamAgentDetail({
	agentId,
	initialAgent,
	initialRuns,
	initialActivity,
}: {
	agentId: string;
	initialAgent: AgentDetail;
	initialRuns: Runs;
	initialActivity: Activity;
}) {
	const trpc = useTRPC();
	const queryClient = useQueryClient();
	const [tab, setTab] = useState<AgentTab>(() =>
		initialAgent.status === "DRAFT" ? "overview" : "runs",
	);
	const agent = useQuery({
		...trpc.agents.byId.queryOptions({ id: agentId }),
		initialData: initialAgent,
	});
	const runs = useQuery({
		...trpc.agents.history.queryOptions({ id: agentId, limit: 50 }),
		initialData: initialRuns,
		refetchInterval: (query) =>
			query.state.data?.some((run) =>
				["QUEUED", "RUNNING", "WAITING_FOR_APPROVAL"].includes(run.status),
			)
				? 2500
				: false,
	});
	const activity = useQuery({
		...trpc.agents.activity.queryOptions({ id: agentId, limit: 100 }),
		initialData: initialActivity,
	});
	const invalidate = () =>
		Promise.all([
			queryClient.invalidateQueries({ queryKey: trpc.agents.byId.pathKey() }),
			queryClient.invalidateQueries({ queryKey: trpc.agents.list.pathKey() }),
			queryClient.invalidateQueries({
				queryKey: trpc.agents.activity.pathKey(),
			}),
		]);
	const runNow = useMutation(
		trpc.agents.runNow.mutationOptions({
			onSuccess: async () => {
				await Promise.all([
					invalidate(),
					queryClient.invalidateQueries({
						queryKey: trpc.agents.history.pathKey(),
					}),
				]);
				setTab("runs");
				toast.success("Agent run queued.");
			},
			onError: (error) => toast.error(error.message),
		}),
	);
	const pause = useMutation(
		trpc.agents.pause.mutationOptions({
			onSuccess: invalidate,
			onError: (error) => toast.error(error.message),
		}),
	);
	const resume = useMutation(
		trpc.agents.resume.mutationOptions({
			onSuccess: invalidate,
			onError: (error) => toast.error(error.message),
		}),
	);
	const runAction = useAsyncAction({
		action: () =>
			runNow.mutateAsync({
				id: agentId,
				clientRequestId: crypto.randomUUID(),
			}),
	});
	const pauseAction = useAsyncAction({
		action: () => pause.mutateAsync({ id: agentId }),
	});
	const resumeAction = useAsyncAction({
		action: () => resume.mutateAsync({ id: agentId }),
	});

	if (agent.isError) {
		return (
			<PageShell>
				<PageShellHeader>
					<PageShellHeading>
						<PageShellTitle>Agent unavailable</PageShellTitle>
						<PageShellDescription>{agent.error.message}</PageShellDescription>
					</PageShellHeading>
				</PageShellHeader>
			</PageShell>
		);
	}

	const data = agent.data ?? initialAgent;
	const isDraft = data.status === "DRAFT";
	const reviewManifest = recordOf(
		(
			data.reviewVersion as unknown as {
				manifest: unknown;
			} | null
		)?.manifest,
	);
	const displayedName = isDraft
		? textOf(reviewManifest.name, data.name)
		: data.name;
	const displayedDescription = isDraft
		? textOf(
				reviewManifest.description,
				data.description ?? "A durable team automation.",
			)
		: (data.description ?? "A durable team automation.");
	const displayedVersionNumber =
		data.currentVersion?.number ?? data.reviewVersion?.number;
	const nextRun = data.triggers.find((trigger) => trigger.enabled)?.nextRunAt;

	return (
		<PageShell className="min-h-0">
			<PageShellHeader className="[&>div]:grid-cols-1 sm:[&>div]:grid-cols-[minmax(0,1fr)_auto]">
				<PageShellHeading>
					<PageShellTitle className="wrap-break-word">
						{displayedName}
					</PageShellTitle>
					<PageShellDescription className="wrap-break-word leading-6">
						<span className="block">{displayedDescription}</span>
						<span className="mt-2 block text-xs">
							Created by {data.createdBy.name} ·{" "}
							{isDraft ? "Private draft" : "Team agent"} · Version{" "}
							{displayedVersionNumber ?? "—"}
						</span>
					</PageShellDescription>
				</PageShellHeading>
				<PageShellActions className="col-start-1 row-start-3 justify-self-start sm:col-start-2 sm:row-start-1 sm:justify-self-end">
					<div className="flex min-w-0 flex-col items-start gap-2 sm:items-end">
						<span className="text-muted-foreground text-xs">
							{isDraft ? "Visibility" : "Next run"}
						</span>
						<span className="font-mono text-sm">
							{isDraft
								? "Private draft"
								: nextRun
									? formatDate(nextRun)
									: "Manual only"}
						</span>
						<div className="mt-1 flex flex-wrap gap-2">
							{isDraft && data.canManage ? (
								<DraftAgentActions
									agentId={data.id}
									name={displayedName}
									version={data.reviewVersion}
								/>
							) : (
								<Button
									variant="outline"
									disabled={data.status !== "LIVE" || runAction.pending}
									aria-busy={runAction.pending}
									onClick={() => runAction.run()}
								>
									<AsyncButtonContent
										status={runAction.status}
										pendingLabel="Queueing"
										successLabel="Queued"
										errorLabel="Try again"
									>
										<Icon icon={Play} data-icon="inline-start" />
										Run now
									</AsyncButtonContent>
								</Button>
							)}
							{!isDraft && data.canManage && data.status === "LIVE" ? (
								<Button
									variant="outline"
									disabled={pauseAction.pending}
									aria-busy={pauseAction.pending}
									onClick={() => pauseAction.run()}
								>
									<AsyncButtonContent
										status={pauseAction.status}
										pendingLabel="Pausing"
										successLabel="Paused"
										errorLabel="Try again"
									>
										<Icon icon={Pause} data-icon="inline-start" />
										Pause
									</AsyncButtonContent>
								</Button>
							) : null}
							{!isDraft && data.canManage && data.status === "PAUSED" ? (
								<Button
									variant="outline"
									disabled={resumeAction.pending}
									aria-busy={resumeAction.pending}
									onClick={() => resumeAction.run()}
								>
									<AsyncButtonContent
										status={resumeAction.status}
										pendingLabel="Resuming"
										successLabel="Resumed"
										errorLabel="Try again"
									>
										<Icon icon={Play} data-icon="inline-start" />
										Resume
									</AsyncButtonContent>
								</Button>
							) : null}
							{!isDraft && data.canManage ? (
								<DeleteAgentAction agentId={data.id} name={data.name} />
							) : null}
						</div>
					</div>
				</PageShellActions>
			</PageShellHeader>

			<PageShellContent className="min-h-0">
				<div
					role="tablist"
					aria-label="Agent details"
					className="flex h-9 min-w-0 items-end gap-5 overflow-x-auto border-b sm:gap-6"
				>
					<TabButton
						tab="overview"
						active={tab === "overview"}
						onClick={() => setTab("overview")}
					>
						Overview
					</TabButton>
					<TabButton
						tab="runs"
						active={tab === "runs"}
						onClick={() => setTab("runs")}
					>
						Runs{" "}
						<span className="font-mono text-muted-foreground">
							{data.runCount}
						</span>
					</TabButton>
					<TabButton
						tab="activity"
						active={tab === "activity"}
						onClick={() => setTab("activity")}
					>
						Activity{" "}
						<span className="font-mono text-muted-foreground">
							{activity.data?.length ?? 0}
						</span>
					</TabButton>
				</div>

				{tab === "overview" ? (
					<div
						role="tabpanel"
						id="agent-overview-panel"
						aria-labelledby="agent-overview-tab"
					>
						<AgentOverview agent={data} />
					</div>
				) : null}
				{tab === "runs" ? (
					<div
						role="tabpanel"
						id="agent-runs-panel"
						aria-labelledby="agent-runs-tab"
					>
						<AgentRuns runs={runs.data ?? []} />
					</div>
				) : null}
				{tab === "activity" ? (
					<div
						role="tabpanel"
						id="agent-activity-panel"
						aria-labelledby="agent-activity-tab"
					>
						<AgentActivity activity={activity.data ?? []} />
					</div>
				) : null}
			</PageShellContent>
		</PageShell>
	);
}

function DraftAgentActions({
	agentId,
	name,
	version,
}: {
	agentId: string;
	name: string;
	version: ReviewVersion;
}) {
	const trpc = useTRPC();
	const queryClient = useQueryClient();
	const workspaceUrl = useWorkspaceUrl();
	const deployable =
		version?.status === "READY" || version?.status === "DEPLOYED";
	const deploy = useMutation(
		trpc.agents.deploy.mutationOptions({
			onSuccess: async () => {
				await Promise.all([
					queryClient.invalidateQueries({
						queryKey: trpc.agents.byId.pathKey(),
					}),
					queryClient.invalidateQueries({
						queryKey: trpc.agents.list.pathKey(),
					}),
					queryClient.invalidateQueries({
						queryKey: trpc.agents.activity.pathKey(),
					}),
					queryClient.invalidateQueries({
						queryKey: trpc.conversations.builderById.pathKey(),
					}),
					queryClient.invalidateQueries({
						queryKey: trpc.conversations.builderList.pathKey(),
					}),
				]);
				toast.success("Agent deployed to the team.");
			},
			onError: (error) => toast.error(error.message),
		}),
	);
	const deployAction = useAsyncAction({
		action: async () => {
			if (!version || !deployable) return;
			await deploy.mutateAsync({
				id: agentId,
				versionId: version.id,
				clientRequestId: crypto.randomUUID(),
			});
		},
	});

	return (
		<>
			{version?.sourceConversationId ? (
				<Button variant="outline" asChild>
					<Link
						href={workspaceUrl(`/chat/${version.sourceConversationId}`)}
						transitionTypes={["nav-back"]}
					>
						Change details
					</Link>
				</Button>
			) : null}
			<Button
				disabled={!deployable || deployAction.pending}
				aria-busy={deployAction.pending}
				onClick={() => deployAction.run()}
			>
				<AsyncButtonContent
					status={deployAction.status}
					pendingLabel="Deploying"
					successLabel="Deployed"
					errorLabel="Try again"
				>
					Deploy agent
				</AsyncButtonContent>
			</Button>
			<DeleteAgentAction agentId={agentId} name={name} />
		</>
	);
}

function DeleteAgentAction({
	agentId,
	name,
}: {
	agentId: string;
	name: string;
}) {
	const trpc = useTRPC();
	const queryClient = useQueryClient();
	const router = useRouter();
	const workspaceUrl = useWorkspaceUrl();
	const [confirming, setConfirming] = useState(false);
	const remove = useMutation(
		trpc.agents.remove.mutationOptions({
			onSuccess: async () => {
				await Promise.all([
					queryClient.invalidateQueries({
						queryKey: trpc.agents.list.pathKey(),
					}),
					queryClient.invalidateQueries({
						queryKey: trpc.agents.byId.pathKey(),
						refetchType: "none",
					}),
				]);
				setConfirming(false);
				toast.success(`${name} was deleted.`);
				router.replace(workspaceUrl("/agents"));
			},
			onError: (error) => toast.error(error.message),
		}),
	);
	const removeAction = useAsyncAction({
		action: () => remove.mutateAsync({ id: agentId }),
	});

	return (
		<>
			<DropdownMenu>
				<DropdownMenuTrigger asChild>
					<Button
						variant="ghost"
						size="icon-sm"
						disabled={removeAction.pending}
					>
						<Icon icon={OverflowMenuVertical} />
						<span className="sr-only">More agent actions</span>
					</Button>
				</DropdownMenuTrigger>
				<DropdownMenuContent align="end">
					<DropdownMenuItem
						variant="destructive"
						onSelect={() => setConfirming(true)}
					>
						<Icon icon={TrashCan} />
						Delete agent
					</DropdownMenuItem>
				</DropdownMenuContent>
			</DropdownMenu>

			<AlertDialog
				open={confirming}
				onOpenChange={(open) => {
					if (!removeAction.pending) setConfirming(open);
				}}
			>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>Delete {name}?</AlertDialogTitle>
						<AlertDialogDescription>
							This removes it from the team agent list, disables its triggers,
							and cancels queued runs. Its run and action history stays in the
							audit log. A run already in progress may finish.
						</AlertDialogDescription>
					</AlertDialogHeader>

					<AlertDialogFooter>
						<AlertDialogCancel disabled={removeAction.pending}>
							Cancel
						</AlertDialogCancel>
						<Button
							variant="destructive"
							disabled={removeAction.pending}
							aria-busy={removeAction.pending}
							onClick={() => removeAction.run()}
						>
							<AsyncButtonContent
								status={removeAction.status}
								pendingLabel="Deleting"
								successLabel="Deleted"
								errorLabel="Try again"
							>
								Delete agent
							</AsyncButtonContent>
						</Button>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</>
	);
}

function TabButton({
	tab,
	active,
	onClick,
	children,
}: {
	tab: AgentTab;
	active: boolean;
	onClick: () => void;
	children: React.ReactNode;
}) {
	return (
		<button
			id={`agent-${tab}-tab`}
			type="button"
			role="tab"
			aria-selected={active}
			aria-controls={`agent-${tab}-panel`}
			onClick={onClick}
			className={cn(
				"flex h-8 items-center gap-2 border-b-2 border-transparent text-muted-foreground text-sm outline-none hover:text-foreground focus-visible:text-foreground",
				active && "border-ring font-medium text-foreground",
			)}
		>
			{children}
		</button>
	);
}

function AgentOverview({ agent }: { agent: AgentDetail }) {
	const agentVersions = agent as unknown as {
		currentVersion: unknown;
		reviewVersion: unknown;
	};
	const version = recordOf(
		agentVersions.currentVersion ?? agentVersions.reviewVersion,
	);
	const manifest = recordOf(version.manifest);
	const sandbox = recordOf(version.sandboxPolicy);
	const trigger = recordOf(manifest.trigger);
	const actions = Array.isArray(manifest.actions)
		? manifest.actions.map(recordOf)
		: [];
	const actionSummaries = actions
		.map((action) =>
			textOf(action.summary, textOf(action.type, "Configured action")),
		)
		.filter(Boolean);
	const access = Array.isArray(manifest.access)
		? manifest.access.filter(
				(item): item is string =>
					typeof item === "string" && Boolean(item.trim()),
			)
		: [];

	return (
		<div className="overflow-hidden rounded-lg border bg-card">
			<DetailRow label="Status" value={agent.status} />
			<DetailRow label="Model" value={textOf(version.modelId, "—")} />
			<DetailRow
				label="Execution"
				value={textOf(
					sandbox.summary,
					"Isolated sandbox · deny-all network · bounded CRM tools",
				)}
			/>
			<DetailRow
				label="Scope"
				value={textOf(
					recordOf(manifest.dataScope).summary,
					"Bounded CRM access",
				)}
			/>
			<DetailRow
				label="Triggers"
				value={
					agent.triggers.map((trigger) => trigger.name).join(" · ") ||
					textOf(trigger.summary, "Manual only")
				}
			/>
			<DetailRow
				label="Actions"
				value={actionSummaries.join(" · ") || "No external actions"}
			/>
			<DetailRow
				label="Access"
				value={
					<AgentScopeBadges
						scopes={access}
						fallback="Bounded CRM read access"
					/>
				}
			/>
		</div>
	);
}

function DetailRow({ label, value }: { label: string; value: ReactNode }) {
	return (
		<div className="flex min-h-11 flex-col items-start gap-1 border-t px-4 py-3 first:border-t-0 sm:flex-row sm:items-center sm:gap-5 sm:px-5 sm:py-2">
			<span className="text-muted-foreground text-xs sm:w-36 sm:shrink-0">
				{label}
			</span>
			<div className="min-w-0 max-w-full flex-1 wrap-break-word text-sm">
				{value}
			</div>
		</div>
	);
}

function AgentRuns({ runs }: { runs: Runs }) {
	const [outcome, setOutcome] = useState("ALL");
	const [expanded, setExpanded] = useState<string | null>(null);
	const visible = runs.filter(
		(run) => outcome === "ALL" || run.status === outcome,
	);
	const runNumbers = new Map(
		runs.map((run, index) => [run.id, runs.length - index]),
	);

	return (
		<div className="flex min-w-0 flex-col gap-4 sm:gap-6">
			<div className="flex min-h-7 items-center justify-start sm:justify-end">
				<select
					value={outcome}
					onChange={(event) => setOutcome(event.target.value)}
					aria-label="Filter run outcomes"
					className="h-7 rounded-md border bg-muted px-2.5 font-medium text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
				>
					<option value="ALL">All outcomes</option>
					<option value="SUCCEEDED">Succeeded</option>
					<option value="FAILED">Failed</option>
					<option value="RUNNING">Running</option>
					<option value="QUEUED">Queued</option>
					<option value="WAITING_FOR_APPROVAL">Waiting for approval</option>
					<option value="CANCELLED">Cancelled</option>
				</select>
			</div>

			{visible.map((run) => (
				<div
					key={run.id}
					className="min-w-0 overflow-hidden rounded-lg border bg-card"
				>
					<button
						type="button"
						onClick={() =>
							setExpanded((current) => (current === run.id ? null : run.id))
						}
						className="flex min-h-14 w-full min-w-0 flex-col items-stretch gap-3 px-4 py-3 text-left outline-none hover:bg-muted/40 focus-visible:bg-muted/40 sm:flex-row sm:items-center sm:justify-between sm:gap-5 sm:px-5 sm:py-2"
					>
						<span className="min-w-0 flex-1">
							<span className="flex flex-wrap items-center gap-x-3 gap-y-1">
								<span className="font-semibold text-sm">
									Run #{String(runNumbers.get(run.id)).padStart(3, "0")}
								</span>
								<span
									className={cn(
										"text-muted-foreground text-xs",
										run.status === "FAILED" && "text-destructive",
									)}
								>
									{humanStatus(run.status)}
								</span>
							</span>
							<span className="mt-1 block wrap-break-word font-mono text-muted-foreground text-xs leading-5 sm:mt-0">
								{humanStatus(run.triggerType)} · {formatDate(run.createdAt)} ·
								Version {run.version.number}
							</span>
						</span>
						<span className="flex min-w-0 items-center justify-between gap-3 font-mono text-muted-foreground text-xs sm:shrink-0 sm:justify-start sm:gap-4">
							<span>{duration(run.startedAt, run.finishedAt)}</span>
							<span>
								{run.actions.length} external{" "}
								{run.actions.length === 1 ? "action" : "actions"}
							</span>
							<Icon
								icon={expanded === run.id ? ChevronUp : ChevronDown}
								className="size-3.5"
							/>
						</span>
					</button>

					{expanded === run.id ? (
						<ExpandedRun run={run as unknown as RunRow} />
					) : null}
				</div>
			))}

			{visible.length === 0 ? (
				<p className="py-12 text-center text-muted-foreground text-sm">
					No runs match this outcome.
				</p>
			) : null}
		</div>
	);
}

function ExpandedRun({ run }: { run: RunRow }) {
	const events = run.events.filter(
		(event) => event.type !== "message.appended",
	);
	const condensedEvents = run.events.length - events.length;

	return (
		<div className="min-w-0 border-t">
			<div className="grid grid-cols-2 gap-x-4 gap-y-3 border-b bg-background px-4 py-3 sm:min-h-[58px] sm:grid-cols-4 sm:items-center sm:gap-0 sm:px-5 sm:py-2">
				<RunMeta label="Trigger" value={humanStatus(run.triggerType)} />
				<RunMeta
					label="Initiated by"
					value={run.initiatedBy?.name ?? "Eve scheduler"}
				/>
				<RunMeta label="Model" value={run.modelId ?? "Gateway default"} />
				<RunMeta label="Version" value={String(run.version.number)} last />
			</div>

			<div>
				{events.map((event) => (
					<div
						key={event.id}
						className="grid min-h-8 min-w-0 grid-cols-[68px_minmax(0,1fr)] items-start gap-x-3 border-t px-4 py-2 first:border-t-0 sm:flex sm:items-center sm:gap-5 sm:px-5 sm:py-1.5"
					>
						<span className="shrink-0 font-mono text-muted-foreground text-xs sm:w-[78px]">
							{formatTime(event.emittedAt)}
						</span>
						<span className="min-w-0 flex-1 wrap-break-word text-sm">
							{eventLabel(event.type, event.data)}
						</span>
						<span className="hidden shrink-0 font-mono text-muted-foreground text-xs sm:inline">
							event
						</span>
					</div>
				))}
				{run.actions.map((action) => (
					<div
						key={action.id}
						className="grid min-h-12 min-w-0 grid-cols-[68px_minmax(0,1fr)] items-start gap-x-3 gap-y-1 border-t px-4 py-3 sm:flex sm:gap-5 sm:px-5"
					>
						<span className="shrink-0 font-mono text-muted-foreground text-xs sm:w-[78px]">
							{formatTime(
								action.completedAt ?? action.startedAt ?? action.plannedAt,
							)}
						</span>
						<span className="min-w-0 flex-1">
							<span className="block wrap-break-word text-sm">
								{action.summary}
							</span>
							<span className="block wrap-break-word text-muted-foreground text-xs">
								{action.provider} · {humanStatus(action.status)}
								{action.targetLabel ? ` · ${action.targetLabel}` : ""}
							</span>
						</span>
						<span className="col-start-2 min-w-0 wrap-break-word font-mono text-muted-foreground text-xs sm:col-auto sm:shrink-0">
							{action.externalId ?? action.id.slice(0, 12)}
						</span>
					</div>
				))}
				{condensedEvents > 0 ? (
					<div className="flex min-h-9 items-center border-t px-4 py-2 text-muted-foreground text-xs sm:px-5">
						{condensedEvents} streaming{" "}
						{condensedEvents === 1 ? "update" : "updates"} condensed
					</div>
				) : null}
			</div>
		</div>
	);
}

function RunMeta({
	label,
	value,
	last = false,
}: {
	label: string;
	value: string;
	last?: boolean;
}) {
	return (
		<span
			className={cn(
				"flex min-w-0 flex-col gap-0.5 sm:flex-1",
				last && "sm:max-w-44",
			)}
		>
			<span className="text-muted-foreground text-xs">{label}</span>
			<span className="wrap-break-word text-sm sm:truncate">{value}</span>
		</span>
	);
}

function AgentActivity({ activity }: { activity: Activity }) {
	const [kind, setKind] = useState("ALL");
	const rows = activity as unknown as ActivityRow[];
	const visible = rows.filter(
		(event) => kind === "ALL" || event.type.startsWith(kind),
	);

	return (
		<div className="flex min-w-0 flex-col gap-4 sm:gap-6">
			<div className="flex min-h-7 flex-wrap items-center justify-start gap-2 sm:justify-end sm:gap-3">
				<select
					value={kind}
					onChange={(event) => setKind(event.target.value)}
					aria-label="Filter activity"
					className="h-7 rounded-md border bg-muted px-2.5 font-medium text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
				>
					<option value="ALL">All changes</option>
					<option value="agent.">Agent changes</option>
					<option value="run.">Run requests</option>
				</select>
				<Button
					variant="outline"
					size="sm"
					onClick={() => exportJson("agent-activity.json", visible)}
				>
					<Icon icon={Download} data-icon="inline-start" />
					Export
				</Button>
			</div>

			<div className="min-w-0 overflow-hidden rounded-lg border bg-card">
				<div className="hidden h-9 items-center border-b bg-background px-5 text-muted-foreground text-xs sm:flex">
					<span className="w-[166px] shrink-0">Time</span>
					<span className="min-w-0 flex-1">Change</span>
					<span className="w-[140px] shrink-0">Actor</span>
					<span className="w-[118px] shrink-0 text-right">Request</span>
				</div>
				{visible.map((event) => (
					<div
						key={event.id}
						className="flex min-h-11 min-w-0 flex-col items-start gap-2 border-t px-4 py-3 first:border-t-0 sm:flex-row sm:items-center sm:gap-0 sm:px-5"
					>
						<span className="shrink-0 font-mono text-muted-foreground text-xs sm:w-[166px]">
							{formatDate(event.emittedAt)}
						</span>
						<span className="min-w-0 flex-1">
							<span className="block wrap-break-word text-sm">
								{event.summary}
							</span>
							{changeDetail(event.before, event.after) ? (
								<span className="block max-w-full whitespace-pre-wrap wrap-break-word font-mono text-muted-foreground text-xs">
									{changeDetail(event.before, event.after)}
								</span>
							) : null}
						</span>
						<span className="min-w-0 wrap-break-word text-xs sm:w-[140px] sm:shrink-0 sm:text-sm">
							<span className="text-muted-foreground sm:hidden">Actor · </span>
							{event.actorUser?.name ?? event.actorId ?? event.actorType}
						</span>
						<span className="min-w-0 wrap-break-word font-mono text-muted-foreground text-xs sm:w-[118px] sm:shrink-0 sm:text-right">
							<span className="font-sans sm:hidden">Request · </span>
							{event.requestId?.slice(0, 12) ?? "—"}
						</span>
					</div>
				))}
			</div>
		</div>
	);
}

function recordOf(value: unknown): Record<string, unknown> {
	return value && typeof value === "object" && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: {};
}

function textOf(value: unknown, fallback: string): string {
	return typeof value === "string" && value.trim() ? value : fallback;
}

function humanStatus(value: string): string {
	return value
		.toLowerCase()
		.replace(/_/g, " ")
		.replace(/^./, (character) => character.toUpperCase());
}

function formatDate(value: string): string {
	return DATE_FORMATTER.format(new Date(value));
}

function formatTime(value: string): string {
	return TIME_FORMATTER.format(new Date(value));
}

function duration(startedAt: string | null, finishedAt: string | null): string {
	if (!startedAt) return "—";
	if (!finishedAt) return "In progress";

	const milliseconds =
		new Date(finishedAt).getTime() - new Date(startedAt).getTime();
	return `${Math.max(0, milliseconds / 1000).toFixed(1)}s`;
}

function eventLabel(type: string, data: unknown): string {
	const payload = recordOf(data);
	return textOf(payload.summary, humanStatus(type.replace(/\./g, " ")));
}

function changeDetail(before: unknown, after: unknown): string | null {
	if (!before && !after) return null;
	const previous = JSON.stringify(before);
	const next = JSON.stringify(after);
	return previous && next ? `${previous} → ${next}` : next || previous;
}

function exportJson(name: string, value: unknown) {
	const url = URL.createObjectURL(
		new Blob([JSON.stringify(value, null, 2)], { type: "application/json" }),
	);
	const anchor = document.createElement("a");
	anchor.href = url;
	anchor.download = name;
	anchor.click();
	URL.revokeObjectURL(url);
}
