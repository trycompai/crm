import type { Metadata } from "next";
import { Suspense } from "react";
import { AgentBuilderHome } from "@/components/agent-builder/agent-builder-home";
import { AgentBuilderHomeFallback } from "@/components/agent-builder/agent-builder-route-fallback";
import { requireSession } from "@/lib/session";
import { HydrateClient } from "@/lib/trpc/hydrate";
import { getServerQueryClient, getServerTrpc } from "@/lib/trpc/server";

export const metadata: Metadata = { title: "Chat" };

export default function ChatPage() {
	return (
		<Suspense fallback={<AgentBuilderHomeFallback />}>
			<ChatHome />
		</Suspense>
	);
}

async function ChatHome() {
	const trpc = getServerTrpc();
	const queryClient = getServerQueryClient();

	const [session] = await Promise.all([
		requireSession(),
		queryClient.prefetchQuery(
			trpc.conversations.builderResources.queryOptions({ q: "" }),
		),
		queryClient.prefetchQuery(trpc.google.status.queryOptions()),
	]);

	return (
		<HydrateClient>
			<AgentBuilderHome name={session.user.name} />
		</HydrateClient>
	);
}
