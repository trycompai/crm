"use client";

import Search from "@carbon/icons-react/es/Search";
import { Button } from "@crm/ui/components/button";
import { Icon } from "@crm/ui/components/icon";
import {
	StatusIndicator,
	type StatusTone,
} from "@crm/ui/components/status-indicator";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useTRPC } from "@/lib/trpc/client";

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
				await queryClient.invalidateQueries({
					queryKey: trpc.outreach.supplyStatus.queryKey(),
				});
				toast.success(
					result.queued
						? "Lead discovery queued."
						: "A lead discovery run is already active.",
				);
			},
			onError: (error) => toast.error(error.message),
		}),
	);
	const researchOpen = status.data?.researchOpen ?? 0;
	const discovery = status.data?.discovery;
	const blocked = Boolean(discovery || researchOpen > 0 || findMore.isPending);
	const label = discovery
		? "Finding leads…"
		: researchOpen > 0
			? `${researchOpen} research queued`
			: "Find 25 more leads";

	return (
		<Button
			variant="default"
			size="sm"
			disabled={blocked}
			onClick={() =>
				findMore.mutate({ count: 25, countryCodes: ["AU", "GB", "US"] })
			}
		>
			<Icon icon={Search} />
			{label}
		</Button>
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
