import { Suspense } from "react";
import { AgentBuilderShell } from "@/components/agent-builder/agent-builder-shell";
import { HydrateClient } from "@/lib/trpc/hydrate";
import { getServerQueryClient, getServerTrpc } from "@/lib/trpc/server";

export default function AgentBuilderLayout({
	children,
}: Readonly<{ children: React.ReactNode }>) {
	return (
		<AgentBuilderShell>
			<Suspense fallback={null}>
				<PrefetchedAgentChatNav />
			</Suspense>
			{children}
		</AgentBuilderShell>
	);
}

async function PrefetchedAgentChatNav() {
	const trpc = getServerTrpc();
	const queryClient = getServerQueryClient();

	await Promise.all([
		queryClient.prefetchQuery(trpc.conversations.builderList.queryOptions()),
		queryClient.prefetchQuery(trpc.agents.list.queryOptions()),
	]);

	return <HydrateClient>{null}</HydrateClient>;
}
