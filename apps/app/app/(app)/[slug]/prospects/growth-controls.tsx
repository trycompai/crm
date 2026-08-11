"use client";

import Renew from "@carbon/icons-react/es/Renew";
import Search from "@carbon/icons-react/es/Search";
import StopOutline from "@carbon/icons-react/es/StopOutline";
import { Button } from "@crm/ui/components/button";
import { Icon } from "@crm/ui/components/icon";
import {
	StatusIndicator,
	type StatusTone,
} from "@crm/ui/components/status-indicator";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useTRPC } from "@/lib/trpc/client";
import type { RouterOutputs } from "@/lib/trpc/types";

type LeadDiscoveryRun = RouterOutputs["outreach"]["leadDiscoveryRuns"][number];

export function FindMoreLeadsButton() {
	const trpc = useTRPC();
	const queryClient = useQueryClient();
	const status = useQuery({
		...trpc.outreach.supplyStatus.queryOptions(),
		refetchInterval: (query) =>
			query.state.data?.discovery || query.state.data?.researchOpen
				? 3_000
				: false,
	});
	const findMore = useMutation(
		trpc.outreach.findMore.mutationOptions({
			onSuccess: async (result) => {
				await invalidateLeadDiscovery(queryClient, trpc);
				toast.success(
					result.executionPaused
						? "Lead discovery run planned with execution paused."
						: "Lead discovery queued.",
				);
			},
			onError: (error) => toast.error(error.message),
		}),
	);
	const researchOpen = status.data?.researchOpen ?? 0;
	const discovery = status.data?.discovery;
	const activeDiscovery = discovery && discovery.state !== "paused";
	const blocked = Boolean(
		activeDiscovery || researchOpen > 0 || findMore.isPending,
	);
	const label = discovery
		? discovery.state === "paused"
			? "Plan another run"
			: "Finding leads..."
		: researchOpen > 0
			? `${researchOpen} research queued`
			: "Find 25 more leads";

	return (
		<Button
			variant="default"
			size="sm"
			disabled={blocked}
			onClick={() =>
				findMore.mutate({
					count: 25,
					countryCodes: ["AU", "GB", "US"],
					cohortName: "Landscaping operators",
					budgetUsd: 0,
					clientRequestId: crypto.randomUUID(),
				})
			}
		>
			<Icon icon={Search} />
			{label}
		</Button>
	);
}

export function LeadDiscoveryRunsPanel() {
	const trpc = useTRPC();
	const queryClient = useQueryClient();
	const runs = useQuery({
		...trpc.outreach.leadDiscoveryRuns.queryOptions(),
		refetchInterval: (query) =>
			query.state.data?.some((run) => run.canCancel) ? 5_000 : false,
	});
	const cancelRun = useMutation(
		trpc.outreach.cancelLeadDiscovery.mutationOptions({
			onSuccess: async (result) => {
				await invalidateLeadDiscovery(queryClient, trpc);
				toast.success(
					`Lead discovery run cancelled. Receipt ${result.receipt.id}.`,
				);
			},
			onError: (error) => toast.error(error.message),
		}),
	);
	const retryRun = useMutation(
		trpc.outreach.retryLeadDiscovery.mutationOptions({
			onSuccess: async (result) => {
				await invalidateLeadDiscovery(queryClient, trpc);
				toast.success(
					`Lead discovery retry planned. Receipt ${result.receipt.id}.`,
				);
			},
			onError: (error) => toast.error(error.message),
		}),
	);
	const latestRuns = runs.data ?? [];

	return (
		<div className="overflow-hidden rounded-md border bg-border">
			<div className="flex flex-wrap items-center justify-between gap-3 bg-background px-4 py-3">
				<div>
					<p className="font-medium text-sm">Find More Leads runs</p>
					<p className="text-muted-foreground text-xs">
						{latestRuns.length} local runs · provider execution disabled
					</p>
				</div>
				<StatusIndicator tone="warning" label="Default paused" size="sm" />
			</div>
			<div className="grid gap-px md:grid-cols-2 xl:grid-cols-3">
				{latestRuns.length === 0 ? (
					<div className="bg-background px-4 py-3 text-muted-foreground text-sm">
						No local lead discovery runs yet.
					</div>
				) : (
					latestRuns.map((run) => (
						<LeadDiscoveryRunCard
							key={run.id}
							run={run}
							cancelPending={cancelRun.isPending}
							retryPending={retryRun.isPending}
							onCancel={() =>
								cancelRun.mutate({
									taskId: run.id,
									clientRequestId: crypto.randomUUID(),
								})
							}
							onRetry={() =>
								retryRun.mutate({
									taskId: run.id,
									clientRequestId: crypto.randomUUID(),
								})
							}
						/>
					))
				)}
			</div>
		</div>
	);
}

export function GrowthPulse() {
	const trpc = useTRPC();
	const status = useQuery({
		...trpc.outreach.supplyStatus.queryOptions(),
		refetchInterval: 5_000,
	});
	const performance = useQuery({
		...trpc.outreach.performance.queryOptions(),
		refetchInterval: 15_000,
	});
	const researching = status.data?.researchOpen ?? 0;
	const promoted = status.data?.prospects.PROMOTED ?? 0;
	const approvedRoutes = status.data?.approvedRoutes ?? 0;
	const sendEligible = status.data?.sendEligible ?? 0;
	const gate = outreachGate({
		agentMailReady: status.data?.agentMailReady ?? false,
		approvedRoutes,
		blockedRoutes: status.data?.blockedRoutes ?? 0,
		sendEligible,
		sendingPaused: status.data?.sendingPaused ?? true,
	});

	return (
		<div className="grid gap-px overflow-hidden rounded-md border bg-border sm:grid-cols-2 lg:grid-cols-5">
			<div className="bg-background px-4 py-3">
				<p className="text-muted-foreground text-xs">Research queue</p>
				<p className="mt-1 font-medium tabular-nums">{researching}</p>
			</div>
			<div className="bg-background px-4 py-3">
				<div className="flex items-center justify-between gap-2">
					<p className="text-muted-foreground text-xs">Outreach gate</p>
					<StatusIndicator tone={gate.tone} label={gate.label} />
				</div>
				<p className="mt-1 font-medium tabular-nums">{sendEligible}</p>
				<p className="text-muted-foreground text-xs">
					{approvedRoutes} approved routes · {promoted} in CRM
				</p>
			</div>
			{(performance.data ?? []).map((variant) => (
				<div key={variant.variant} className="bg-background px-4 py-3">
					<div className="flex items-center justify-between gap-2">
						<p className="text-muted-foreground text-xs">
							Variant {variant.variant}
						</p>
						<StatusIndicator
							tone={variant.replies > 0 ? "success" : "neutral"}
							label={
								variant.replyRate === null
									? "No sends"
									: `${Math.round(variant.replyRate * 100)}% replies`
							}
						/>
					</div>
					<p className="mt-1 text-xs tabular-nums">
						{variant.assigned} assigned · {variant.sent} sent ·{" "}
						{variant.replies} replied
					</p>
				</div>
			))}
		</div>
	);
}

function LeadDiscoveryRunCard({
	run,
	cancelPending,
	retryPending,
	onCancel,
	onRetry,
}: {
	run: LeadDiscoveryRun;
	cancelPending: boolean;
	retryPending: boolean;
	onCancel: () => void;
	onRetry: () => void;
}) {
	const state = runState(run);
	const gaps = run.requiredGates.map((gate) => ({
		...gate,
		count: run.gapCounts[gate.key] ?? 0,
	}));
	const latestReceipt = run.receipts[0] ?? null;

	return (
		<div className="flex min-w-0 flex-col gap-3 bg-background px-4 py-3">
			<div className="flex items-start justify-between gap-3">
				<div className="min-w-0">
					<p className="truncate font-medium text-sm">{run.cohortName}</p>
					<p className="text-muted-foreground text-xs">
						{run.targetCount} targets · {run.targetRegions.join(", ")}
					</p>
				</div>
				<StatusIndicator tone={state.tone} label={state.label} size="sm" />
			</div>
			<div className="grid grid-cols-4 gap-px overflow-hidden rounded-sm border bg-border text-xs">
				<div className="bg-background px-3 py-2">
					<p className="text-muted-foreground">Found</p>
					<p className="mt-1 font-medium tabular-nums">{run.foundCount}</p>
				</div>
				<div className="bg-background px-3 py-2">
					<p className="text-muted-foreground">Budget</p>
					<p className="mt-1 font-medium tabular-nums">
						{formatUsd(run.budgetUsd)}
					</p>
				</div>
				<div className="bg-background px-3 py-2">
					<p className="text-muted-foreground">Estimate</p>
					<p className="mt-1 font-medium tabular-nums">
						{formatUsd(run.estimatedCostUsd)}
					</p>
				</div>
				<div className="bg-background px-3 py-2">
					<p className="text-muted-foreground">Actual</p>
					<p className="mt-1 font-medium tabular-nums">
						{formatUsd(run.actualCostUsd)}
					</p>
				</div>
			</div>
			<div>
				<div className="flex items-center justify-between text-xs">
					<span className="text-muted-foreground">Progress</span>
					<span className="font-medium tabular-nums">{run.progress}%</span>
				</div>
				<div className="mt-1 h-1.5 overflow-hidden rounded-sm bg-muted">
					<div
						className="h-full bg-primary"
						style={{ width: `${run.progress}%` }}
					/>
				</div>
			</div>
			<div className="flex flex-wrap gap-2">
				<StatusIndicator
					tone={run.executionPaused ? "warning" : "success"}
					label={run.executionPaused ? "Execution paused" : "Execution ready"}
					size="sm"
				/>
				<StatusIndicator
					tone={run.providerExecutionDisabled ? "warning" : "success"}
					label={
						run.providerExecutionDisabled
							? "Provider disabled"
							: "Provider enabled"
					}
					size="sm"
				/>
				<StatusIndicator
					tone={run.approvalRequestId ? "info" : "neutral"}
					label={run.approvalRequestId ? "Approval proposed" : "No approval"}
					size="sm"
				/>
			</div>
			<div className="grid gap-1 text-xs">
				{gaps.map((gap) => (
					<div key={gap.key} className="flex justify-between gap-3">
						<span className="min-w-0 truncate text-muted-foreground">
							{gap.label}
						</span>
						<span className="shrink-0 font-medium tabular-nums">
							{gap.count}
						</span>
					</div>
				))}
			</div>
			<div className="text-muted-foreground text-xs">
				{latestReceipt
					? `${receiptLabel(latestReceipt.operationKey)} · ${latestReceipt.id}`
					: "No receipt recorded"}
			</div>
			<div className="flex gap-2">
				<Button
					type="button"
					variant="outline"
					size="sm"
					disabled={!run.canCancel || cancelPending}
					aria-label={`Cancel lead discovery run ${run.id}`}
					onClick={onCancel}
				>
					<Icon icon={StopOutline} />
					Cancel
				</Button>
				<Button
					type="button"
					variant="outline"
					size="sm"
					disabled={!run.canRetry || retryPending}
					aria-label={`Retry lead discovery run ${run.id}`}
					onClick={onRetry}
				>
					<Icon icon={Renew} />
					Retry
				</Button>
			</div>
		</div>
	);
}

function invalidateLeadDiscovery(
	queryClient: ReturnType<typeof useQueryClient>,
	trpc: ReturnType<typeof useTRPC>,
) {
	return Promise.all([
		queryClient.invalidateQueries({
			queryKey: trpc.outreach.supplyStatus.queryKey(),
		}),
		queryClient.invalidateQueries({
			queryKey: trpc.outreach.leadDiscoveryRuns.queryKey(),
		}),
	]);
}

function runState(run: LeadDiscoveryRun): { label: string; tone: StatusTone } {
	if (run.state === "WAITING_FOR_APPROVAL") {
		return { label: "Paused", tone: "warning" };
	}
	if (run.state === "LEASED") return { label: "Running", tone: "info" };
	if (run.state === "QUEUED") return { label: "Queued", tone: "info" };
	if (run.state === "SUCCEEDED") return { label: "Complete", tone: "success" };
	if (run.state === "CANCELLED") return { label: "Cancelled", tone: "neutral" };
	if (run.state === "FAILED") return { label: "Failed", tone: "error" };
	return { label: "Unknown", tone: "error" };
}

function formatUsd(value: string) {
	const amount = Number(value);
	if (!Number.isFinite(amount)) return "$0.00";
	return new Intl.NumberFormat("en-US", {
		style: "currency",
		currency: "USD",
	}).format(amount);
}

function receiptLabel(operationKey: string | null) {
	if (operationKey === "outreach.lead-discovery.cancel")
		return "Cancel receipt";
	if (operationKey === "outreach.lead-discovery.retry") return "Retry receipt";
	return "Plan receipt";
}

function outreachGate(input: {
	agentMailReady: boolean;
	approvedRoutes: number;
	blockedRoutes: number;
	sendEligible: number;
	sendingPaused: boolean;
}): { label: string; tone: StatusTone } {
	if (input.sendingPaused) return { label: "Sends paused", tone: "warning" };
	if (!input.agentMailReady)
		return { label: "AgentMail unavailable", tone: "warning" };
	if (input.sendEligible > 0) return { label: "Send enabled", tone: "success" };
	if (input.approvedRoutes > 0 && input.blockedRoutes >= input.approvedRoutes) {
		return { label: "Routes suppressed", tone: "error" };
	}
	return { label: "No approved routes", tone: "neutral" };
}
