import type { Metadata } from "next";
import { Suspense } from "react";
import { AgentBuilderChat } from "@/components/agent-builder/agent-builder-chat";
import { isSharedChatToken } from "@/lib/chat-route";
import { getServerQueryClient, getServerTrpc } from "@/lib/trpc/server";

export const metadata: Metadata = { title: "Agent chat" };

export default function AgentChatPage({
	params,
}: {
	params: Promise<{ chatId: string }>;
}) {
	return (
		<Suspense fallback={<ChatFallback />}>
			<PrefetchedAgentChat params={params} />
		</Suspense>
	);
}

async function PrefetchedAgentChat({
	params,
}: {
	params: Promise<{ chatId: string }>;
}) {
	const { chatId } = await params;
	const trpc = getServerTrpc();
	const queryClient = getServerQueryClient();
	const sharedChat = isSharedChatToken(chatId);

	if (sharedChat) {
		await queryClient.prefetchQuery(
			trpc.conversations.shared.queryOptions({ token: chatId }),
		);
	} else {
		await queryClient.prefetchQuery(
			trpc.conversations.builderById.queryOptions({
				id: chatId,
			}),
		);
	}

	return <AgentBuilderChat conversationId={chatId} />;
}

function ChatFallback() {
	return (
		<main className="flex min-h-0 flex-1 items-center justify-center">
			<span className="text-muted-foreground text-sm">Opening chat…</span>
		</main>
	);
}
