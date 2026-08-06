import { Suspense } from "react";
import {
	AgentBuilderShell,
	AgentBuilderSidebarFallback,
} from "@/components/agent-builder/agent-builder-shell";
import { AgentBuilderSidebar } from "@/components/agent-builder/agent-builder-sidebar";
import { HydrateClient } from "@/lib/trpc/hydrate";
import { getServerQueryClient, getServerTrpc } from "@/lib/trpc/server";

export default function AgentBuilderLayout({
	children,
}: Readonly<{ children: React.ReactNode }>) {
	return (
		<AgentBuilderShell
			sidebar={
				<Suspense fallback={<AgentBuilderSidebarFallback />}>
					<PrefetchedAgentBuilderSidebar />
				</Suspense>
			}
		>
			{children}
		</AgentBuilderShell>
	);
}

async function PrefetchedAgentBuilderSidebar() {
	const trpc = getServerTrpc();
	const queryClient = getServerQueryClient();
	const conversationsQuery = trpc.conversations.builderList.queryOptions();
	const agentsQuery = trpc.agents.list.queryOptions();

	const [conversations, agents] = await Promise.all([
		queryClient.fetchQuery(conversationsQuery),
		queryClient.fetchQuery(agentsQuery),
	]);
	const updatedAt = Math.min(
		queryClient.getQueryState(conversationsQuery.queryKey)?.dataUpdatedAt ?? 0,
		queryClient.getQueryState(agentsQuery.queryKey)?.dataUpdatedAt ?? 0,
	);

	return (
		<HydrateClient>
			<AgentBuilderSidebar
				className="hidden w-[213px] flex-none border-r md:flex"
				initialData={{ conversations, agents, updatedAt }}
			/>
		</HydrateClient>
	);
}
