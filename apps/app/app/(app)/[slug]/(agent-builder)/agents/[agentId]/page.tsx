import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { TeamAgentDetail } from "@/components/agent-builder/team-agent-detail";
import { PageShellFallback } from "@/components/page-shell";
import { HydrateClient } from "@/lib/trpc/hydrate";
import { getServerQueryClient, getServerTrpc } from "@/lib/trpc/server";

export const metadata: Metadata = { title: "Team agent" };

export default function TeamAgentPage({
	params,
}: {
	params: Promise<{ agentId: string }>;
}) {
	return (
		<Suspense fallback={<PageShellFallback />}>
			<PrefetchedTeamAgent params={params} />
		</Suspense>
	);
}

async function PrefetchedTeamAgent({
	params,
}: {
	params: Promise<{ agentId: string }>;
}) {
	const { agentId } = await params;
	if (agentId === "team") notFound();

	const trpc = getServerTrpc();
	const queryClient = getServerQueryClient();
	const agentQuery = trpc.agents.byId.queryOptions({ id: agentId });
	const runsQuery = trpc.agents.history.queryOptions({
		id: agentId,
		limit: 50,
	});
	const activityQuery = trpc.agents.activity.queryOptions({
		id: agentId,
		limit: 100,
	});

	const [agent, runs, activity] = await Promise.all([
		queryClient.fetchQuery(agentQuery),
		queryClient.fetchQuery(runsQuery),
		queryClient.fetchQuery(activityQuery),
	]);

	return (
		<HydrateClient>
			<TeamAgentDetail
				agentId={agentId}
				initialAgent={agent}
				initialRuns={runs}
				initialActivity={activity}
			/>
		</HydrateClient>
	);
}
