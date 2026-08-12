"use client";

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
import { SaveBarViewport } from "@crm/ui/components/save-bar";
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
import { AgentCapabilities, type Capabilities } from "./agent-capabilities";
import { AgentCode } from "./agent-code";
import { AgentRunsDrawer } from "./agent-runs-drawer";

type AgentDetail = RouterOutputs["agents"]["byId"];
type ReviewVersion = AgentDetail["reviewVersion"];
type Runs = RouterOutputs["agents"]["history"];
type Activity = RouterOutputs["agents"]["activity"];
const DATE_FORMATTER = new Intl.DateTimeFormat("en-US", {
	month: "short",
	day: "numeric",
	hour: "numeric",
	minute: "2-digit",
	second: "2-digit",
	timeZone: "UTC",
	timeZoneName: "short",
});
const _TIME_FORMATTER = new Intl.DateTimeFormat("en-US", {
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
	const workspaceUrl = useWorkspaceUrl();
	const [runsOpen, setRunsOpen] = useState(false);
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
			queryClient.invalidateQueries({
				queryKey: trpc.agents.history.pathKey(),
			}),
		]);
	const runNow = useMutation(
		trpc.agents.runNow.mutationOptions({
			onSuccess: async () => {
				await invalidate();
				setRunsOpen(true);
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
	const retryRun = useMutation(
		trpc.agents.retryRun.mutationOptions({
			onSuccess: async () => {
				await invalidate();
				toast.success("Run queued again.");
			},
			onError: (error) => toast.error(error.message),
		}),
	);
	const cancelRun = useMutation(
		trpc.agents.cancelRun.mutationOptions({
			onSuccess: async (result) => {
				await invalidate();
				toast.success(
					result.cancelled ? "Run stopped." : "That run had already finished.",
				);
			},
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
	const enabledTriggers = data.triggers.filter((trigger) => trigger.enabled);
	const canRunManually =
		enabledTriggers.length === 0 ||
		enabledTriggers.some((trigger) => trigger.type !== "EVENT");
	const nextRun =
		enabledTriggers.length === 1 ? enabledTriggers[0]?.nextRunAt : null;
	const triggerSummary =
		enabledTriggers.map((trigger) => trigger.name).join(" · ") || "Manual only";

	return (
		<PageShell className="min-h-0" contained>
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
							{isDraft ? "Visibility" : "Trigger"}
						</span>
						<span className="font-mono text-sm">
							{isDraft
								? "Private draft"
								: nextRun
									? formatDate(nextRun)
									: triggerSummary}
						</span>
						<div className="mt-1 flex flex-wrap gap-2">
							<Button onClick={() => setRunsOpen(true)} variant="outline">
								Runs
								<span className="font-mono text-muted-foreground">
									{data.runCount}
								</span>
							</Button>
							<Button asChild variant="outline">
								<Link href={workspaceUrl("/chat")}>Open in chat</Link>
							</Button>
							{isDraft && data.canManage ? (
								<DraftAgentActions
									agentId={data.id}
									name={displayedName}
									version={data.reviewVersion}
								/>
							) : canRunManually ? (
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
							) : null}
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
				<div className="-mx-1 min-h-0 flex-1 overflow-y-auto px-1 pb-1">
					<AgentOverview agent={data} />
				</div>
			</PageShellContent>

			<AgentRunsDrawer
				activity={activity.data ?? []}
				agentId={agentId}
				cancelling={cancelRun.isPending}
				onCancel={(runId) => cancelRun.mutate({ id: agentId, runId })}
				onOpenChange={setRunsOpen}
				onRetry={(runId) =>
					retryRun.mutate({
						id: agentId,
						runId,
						clientRequestId: crypto.randomUUID(),
					})
				}
				open={runsOpen}
				retryingRunId={
					retryRun.isPending ? retryRun.variables?.runId : undefined
				}
				runs={runs.data ?? []}
			/>
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
						queryKey: trpc.agents.files.pathKey(),
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

function AgentOverview({ agent }: { agent: AgentDetail }) {
	const detail = agent as unknown as { capabilities?: Capabilities };
	const capabilities = detail.capabilities;
	const deployed = agent.currentVersion !== null;
	const canEdit = agent.canManage && deployed;

	if (!capabilities) {
		return (
			<p className="text-muted-foreground text-sm">
				This agent has no deployed version yet.
			</p>
		);
	}

	return (
		<SaveBarViewport>
			<div className="flex flex-col gap-9">
				{deployed ? null : (
					<p className="text-muted-foreground text-sm">
						This is a draft. Deploy it to the team before you change what it can
						do.
					</p>
				)}
				<AgentCapabilities
					agentId={agent.id}
					canManage={canEdit}
					capabilities={capabilities}
				/>
				<AgentCode agentId={agent.id} canManage={canEdit} />
			</div>
		</SaveBarViewport>
	);
}

function _DetailRow({ label, value }: { label: string; value: ReactNode }) {
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

function recordOf(value: unknown): Record<string, unknown> {
	return value && typeof value === "object" && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: {};
}

function textOf(value: unknown, fallback: string): string {
	return typeof value === "string" && value.trim() ? value : fallback;
}

function formatDate(value: string): string {
	return DATE_FORMATTER.format(new Date(value));
}
