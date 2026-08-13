"use client";

import { Button } from "@crm/ui/components/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@crm/ui/components/card";
import { Spinner } from "@crm/ui/components/spinner";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { toast } from "sonner";
import { CampaignStatus } from "@/app/(app)/[slug]/(marketing)/marketing/campaign-status";
import { LocalDateTime } from "@/components/local-date-time";
import { useTRPC } from "@/lib/trpc/client";
import { useWorkspaceUrl } from "@/lib/use-workspace-url";

const WHEN: Intl.DateTimeFormatOptions = {
	month: "short",
	day: "numeric",
	hour: "2-digit",
	minute: "2-digit",
};

export function WaitingForYou() {
	const trpc = useTRPC();
	const queryClient = useQueryClient();
	const workspaceUrl = useWorkspaceUrl();

	const pending = useQuery(trpc.marketingCampaigns.pending.queryOptions());

	const refresh = () =>
		Promise.all([
			queryClient.invalidateQueries({
				queryKey: trpc.marketingCampaigns.pending.queryKey(),
			}),
			queryClient.invalidateQueries({
				queryKey: trpc.marketingCampaigns.list.pathKey(),
			}),
		]);

	const approve = useMutation(
		trpc.marketingCampaigns.approve.mutationOptions({
			onSuccess: async () => {
				await refresh();
				toast.success("Approved. It is live from the next tick.");
			},
			onError: (error) => toast.error(error.message),
		}),
	);

	const reject = useMutation(
		trpc.marketingCampaigns.reject.mutationOptions({
			onSuccess: async () => {
				await refresh();
				toast.success("Sent back to draft. Nothing went out.");
			},
			onError: (error) => toast.error(error.message),
		}),
	);

	const rows = pending.data ?? [];
	if (rows.length === 0) return null;

	return (
		<Card>
			<CardHeader>
				<CardTitle>Waiting for you</CardTitle>
				<CardDescription>
					The agent staged {rows.length === 1 ? "this" : "these"}.
				</CardDescription>
			</CardHeader>
			<CardContent className="gap-0 p-0">
				{rows.map((row) => (
					<div
						key={row.id}
						className="flex flex-col gap-2 border-b p-4 last:border-b-0 md:p-6"
					>
						<div className="flex items-center gap-2">
							<Link
								href={workspaceUrl(`/marketing/campaigns/${row.id}`)}
								className="truncate font-medium text-sm hover:underline"
								prefetch
							>
								{row.name}
							</Link>
							<span className="shrink-0 rounded-sm border px-1.5 py-px text-muted-foreground text-xs">
								{row.kind === "DRIP" ? "Sequence" : "Blast"}
							</span>
							<span className="shrink-0 text-xs">
								<CampaignStatus status="PENDING_APPROVAL" />
							</span>
						</div>

						<p className="text-muted-foreground text-xs">{row.note}</p>

						<p className="text-muted-foreground text-xs">
							{row.segment?.name ?? "No segment"} · {row.nodes} step
							{row.nodes === 1 ? "" : "s"} ·{" "}
							{row.at ? (
								<>
									proposed for <LocalDateTime date={row.at} options={WHEN} />
								</>
							) : (
								"as soon as you approve"
							)}
						</p>

						<div className="flex items-center gap-2 pt-1">
							<Button
								size="sm"
								disabled={approve.isPending}
								onClick={() => approve.mutate({ id: row.id })}
							>
								{approve.isPending ? <Spinner /> : null}
								Approve
							</Button>
							<Button
								variant="outline"
								size="sm"
								disabled={reject.isPending}
								onClick={() => reject.mutate({ id: row.id })}
							>
								Send back to draft
							</Button>
						</div>
					</div>
				))}
			</CardContent>
		</Card>
	);
}
