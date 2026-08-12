import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { TeamAgentDetail } from "@/components/agent-builder/team-agent-detail";
import { PageShellFallback } from "@/components/page-shell";
import { getServerTrpcClient } from "@/lib/trpc/server";
import { nullIfMissing } from "../../missing-record";

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

	const client = getServerTrpcClient();

	const [agent, runs, activity] = await Promise.all([
		client.agents.byId.query({ id: agentId }).catch(nullIfMissing),
		client.agents.history
			.query({ id: agentId, limit: 50 })
			.catch(nullIfMissing),
		client.agents.activity
			.query({ id: agentId, limit: 100 })
			.catch(nullIfMissing),
	]);

	if (!agent || !runs || !activity) notFound();

	return (
		<TeamAgentDetail
			agentId={agentId}
			initialAgent={agent}
			initialRuns={runs}
			initialActivity={activity}
		/>
	);
}
