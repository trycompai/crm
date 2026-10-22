import { vendors } from "@crm/mcp-integrations/catalog";
import { providerBrand } from "@crm/ui/lib/provider-brand";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { AgentBuilderChat } from "@/components/agent-builder/agent-builder-chat";
import { AgentBuilderChatFallback } from "@/components/agent-builder/agent-builder-route-fallback";
import { isSharedChatToken } from "@/lib/chat-route";
import { getServerTrpcClient } from "@/lib/trpc/server";
import { nullIfMissing } from "../../missing-record";

export const metadata: Metadata = { title: "Agent chat" };

const supportedConnections = vendors.map((vendor) => ({
	slug: vendor.slug,
	name: vendor.name,
	description: vendor.presentation.description,
	brand: providerBrand(vendor.slug, vendor.name),
}));

export default function AgentChatPage({
	params,
}: {
	params: Promise<{ chatId: string }>;
}) {
	return (
		<Suspense fallback={<AgentBuilderChatFallback />}>
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
	const client = getServerTrpcClient();

	if (isSharedChatToken(chatId)) {
		const shared = await nullIfMissing(
			client.conversations.shared.query({ token: chatId }),
		);

		return (
			<AgentBuilderChat
				conversationId={chatId}
				initialData={shared}
				supportedConnections={supportedConnections}
			/>
		);
	}

	const conversation = await nullIfMissing(
		client.conversations.builderById.query({ id: chatId }),
	);

	if (!conversation) notFound();

	return (
		<AgentBuilderChat
			conversationId={chatId}
			initialData={conversation}
			supportedConnections={supportedConnections}
		/>
	);
}
