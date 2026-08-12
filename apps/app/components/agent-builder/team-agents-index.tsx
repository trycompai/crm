"use client";

import ArrowRight from "@carbon/icons-react/es/ArrowRight";
import Bot from "@carbon/icons-react/es/Bot";
import { Icon } from "@crm/ui/components/icon";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useTRPC } from "@/lib/trpc/client";
import type { RouterOutputs } from "@/lib/trpc/types";
import { useWorkspaceUrl } from "@/lib/use-workspace-url";

type Agents = RouterOutputs["agents"]["list"];
type Fleet = RouterOutputs["agents"]["observability"];

export function TeamAgentsIndex({ initialAgents }: { initialAgents: Agents }) {
	const trpc = useTRPC();
	const workspaceUrl = useWorkspaceUrl();
	const agents = useQuery({
		...trpc.agents.list.queryOptions(),
		initialData: initialAgents,
	});
	const fleet = useQuery(trpc.agents.observability.queryOptions());
	const rows = agents.data ?? initialAgents;

	return (
		<>
			{fleet.data ? <FleetHealth fleet={fleet.data} /> : null}
			{rows.length ? (
				<div className="overflow-hidden rounded-lg border bg-card">
					{rows.map((agent) => (
						<Link
							key={agent.id}
							href={workspaceUrl(`/agents/${agent.id}`)}
							transitionTypes={["nav-forward"]}
							className="flex min-h-16 min-w-0 items-start gap-3 border-t px-4 py-4 outline-none first:border-t-0 hover:bg-muted/50 focus-visible:bg-muted/50 sm:items-center sm:gap-4 sm:px-5 sm:py-3"
						>
							<span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
								<Icon icon={Bot} />
							</span>
							<span className="min-w-0 flex-1">
								<span className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
									<span className="min-w-0 wrap-break-word font-medium text-sm sm:truncate">
										{agent.name}
									</span>
									{agent.lifecycleRole ? (
										<span className="shrink-0 rounded-md bg-muted px-1.5 py-0.5 font-medium text-muted-foreground text-xs capitalize">
											{agent.lifecycleRole}
										</span>
									) : null}
									<span className="shrink-0 text-muted-foreground text-xs">
										{agent.status.toLowerCase()}
									</span>
								</span>
								<span className="mt-1 block wrap-break-word text-muted-foreground text-xs sm:mt-0 sm:truncate">
									{agent.description ?? "No description"}
								</span>
								<span className="mt-2 block font-mono text-muted-foreground text-xs sm:hidden">
									{agent.runCount} runs
								</span>
							</span>
							<span className="hidden shrink-0 font-mono text-muted-foreground text-xs sm:inline">
								{agent.runCount} runs
							</span>
							<Icon
								icon={ArrowRight}
								className="size-4 text-muted-foreground"
							/>
						</Link>
					))}
				</div>
			) : (
				<div className="flex min-h-64 flex-col items-center justify-center rounded-lg border border-dashed px-6 text-center">
					<Icon icon={Bot} className="size-6 text-muted-foreground" />
					<h2 className="mt-4 font-medium text-sm">No team agents yet</h2>
					<p className="mt-1 text-muted-foreground text-xs">
						Create one from a private chat, then review its access before
						deploying it.
					</p>
					<Link
						href={workspaceUrl("/chat")}
						className="mt-4 text-primary text-xs hover:underline"
					>
						Open chat
					</Link>
				</div>
			)}
		</>
	);
}

function FleetHealth({ fleet }: { fleet: Fleet }) {
	const open = Object.values(fleet.openRunsByStatus).reduce(
		(sum: number, count: number) => sum + count,
		0,
	);

	return (
		<div className="mb-4 overflow-hidden rounded-lg border bg-card">
			<div className="border-b px-4 py-3 sm:px-5">
				<h2 className="font-medium text-sm">Fleet health (24h)</h2>
				<p className="mt-0.5 text-muted-foreground text-xs">
					Run status, action quality, and token cost for team agents. Aggregate
					counts only.
				</p>
			</div>
			<div className="grid grid-cols-2 gap-3 px-4 py-3 sm:grid-cols-4 sm:gap-4 sm:px-5">
				<Stat label="Runs" value={String(fleet.consumption.runs)} />
				<Stat label="Open now" value={String(open)} />
				<Stat
					label="Failed"
					value={String(fleet.quality.failed)}
					warn={fleet.quality.failed > 0}
				/>
				<Stat
					label="Dependency fails"
					value={String(fleet.quality.dependencyFailures)}
					warn={fleet.quality.dependencyFailures > 0}
				/>
				<Stat
					label="Cancelled"
					value={`${fleet.quality.cancelled}${
						fleet.quality.cancelAfterAction > 0
							? ` (${fleet.quality.cancelAfterAction} after action)`
							: ""
					}`}
				/>
				<Stat
					label="Input tokens"
					value={fleet.consumption.inputTokens.toLocaleString("en-US")}
				/>
				<Stat
					label="Output tokens"
					value={fleet.consumption.outputTokens.toLocaleString("en-US")}
				/>
				<Stat label="Cost" value={`$${fleet.consumption.costUsd.toFixed(4)}`} />
			</div>
			{Object.keys(fleet.runsByLifecycleRole).length > 0 ? (
				<div className="border-t px-4 py-3 font-mono text-muted-foreground text-xs sm:px-5">
					Roles ·{" "}
					{Object.entries(fleet.runsByLifecycleRole)
						.map(([role, count]) => `${role} ${count}`)
						.join(" · ")}
				</div>
			) : null}
		</div>
	);
}

function Stat({
	label,
	value,
	warn = false,
}: {
	label: string;
	value: string;
	warn?: boolean;
}) {
	return (
		<div className="min-w-0">
			<div className="text-muted-foreground text-xs">{label}</div>
			<div
				className={`mt-0.5 truncate font-mono text-sm ${
					warn ? "text-destructive" : ""
				}`}
			>
				{value}
			</div>
		</div>
	);
}
