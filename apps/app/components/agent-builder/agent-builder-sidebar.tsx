"use client";

import { useAppShellNav } from "@crm/ui/components/app-shell";
import {
	AppSidebarGroup,
	AppSidebarItem,
	AppSidebarSection,
	AppSidebarSkeleton,
} from "@crm/ui/components/app-sidebar";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
	BotIcon,
	CircleCheckIcon,
	LoaderCircleIcon,
	PlusIcon,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { type ChatDateGroup, chatDateGroup } from "@/lib/chat-date-group";
import { useTRPC } from "@/lib/trpc/client";
import type { RouterOutputs } from "@/lib/trpc/types";
import { useHydrated } from "@/lib/use-hydrated";
import { useWorkspaceUrl } from "@/lib/use-workspace-url";
import { DeleteChatAction } from "./delete-chat-action";

type Conversation = RouterOutputs["conversations"]["builderList"][number];

export function AgentChatNav() {
	const pathname = usePathname();
	const workspaceUrl = useWorkspaceUrl();
	const trpc = useTRPC();
	const queryClient = useQueryClient();
	const hydrated = useHydrated();
	const nav = useAppShellNav();
	const conversations = useQuery({
		...trpc.conversations.builderList.queryOptions(),
		refetchInterval: (query) =>
			query.state.data?.some((conversation) => conversation.state === "working")
				? 2500
				: 30_000,
	});
	const agents = useQuery({
		...trpc.agents.list.queryOptions(),
		refetchInterval: 60_000,
	});
	const markRead = useMutation(
		trpc.conversations.markRead.mutationOptions({
			onSuccess: () =>
				queryClient.invalidateQueries({
					queryKey: trpc.conversations.builderList.pathKey(),
				}),
		}),
	);

	const newChatHref = workspaceUrl("/chat");
	const agentsHref = workspaceUrl("/agents");
	const loading = !hydrated || conversations.isPending || agents.isPending;
	const groups = loading
		? []
		: groupConversations(conversations.data ?? [], conversations.dataUpdatedAt);
	const teamAgents = loading ? [] : (agents.data ?? []);

	return (
		<AppSidebarSection
			label="Chat"
			back={<Link href={workspaceUrl()} transitionTypes={["nav-back"]} />}
		>
			<AppSidebarGroup>
				<AppSidebarItem
					icon={PlusIcon}
					label="New chat"
					active={pathname === newChatHref}
				>
					<Link href={newChatHref} />
				</AppSidebarItem>
			</AppSidebarGroup>

			{loading ? <AppSidebarSkeleton rows={3} /> : null}

			{groups.map((group) => (
				<AppSidebarGroup key={group.label} label={group.label} stacked>
					{group.items.map((conversation) => {
						const href = workspaceUrl(`/chat/${conversation.id}`);
						const active = pathname === href;
						const title = conversation.title ?? "Untitled chat";
						return (
							<AppSidebarItem
								key={conversation.id}
								label={title}
								active={active}
								indicator={<ConversationState state={conversation.state} />}
								action={
									<DeleteChatAction
										conversationId={conversation.id}
										title={title}
										trigger="close"
										returnToChatList={active}
										onDeleted={active ? nav.close : undefined}
									/>
								}
								onClick={() => {
									if (conversation.unread) {
										markRead.mutate({ id: conversation.id });
									}
								}}
							>
								<Link href={href} />
							</AppSidebarItem>
						);
					})}
				</AppSidebarGroup>
			))}

			{!loading && groups.length === 0 ? (
				<p className="px-4.5 py-2 text-13 text-muted-foreground">
					No chats in the last 7 days.
				</p>
			) : null}

			<AppSidebarGroup label="Team agents">
				<AppSidebarItem
					icon={BotIcon}
					label="All agents"
					active={pathname === agentsHref}
					indicator={loading ? null : <span>{teamAgents.length}</span>}
				>
					<Link href={agentsHref} transitionTypes={["nav-lateral"]} />
				</AppSidebarItem>
				{teamAgents.map((agent) => {
					const href = workspaceUrl(`/agents/${agent.id}`);
					return (
						<AppSidebarItem
							key={agent.id}
							label={agent.name}
							active={pathname === href}
							inset
						>
							<Link href={href} />
						</AppSidebarItem>
					);
				})}
			</AppSidebarGroup>
		</AppSidebarSection>
	);
}

function ConversationState({ state }: { state: Conversation["state"] }) {
	if (state === "working") {
		return <LoaderCircleIcon aria-label="Working" className="animate-spin" />;
	}

	if (state === "unread") {
		return (
			<span
				role="img"
				aria-label="Unread"
				className="mx-1 size-1.5 rounded-full bg-brand"
			/>
		);
	}

	if (state === "deployed") {
		return <CircleCheckIcon aria-label="Deployed" className="text-brand" />;
	}

	return null;
}

function groupConversations(conversations: Conversation[], now: number) {
	if (!now) return [];

	const labels: ChatDateGroup[] = ["Today", "Yesterday", "Last 7 days"];
	const items = new Map<ChatDateGroup, Conversation[]>(
		labels.map((label) => [label, []]),
	);

	for (const conversation of conversations) {
		const label = chatDateGroup(conversation.lastMessageAt, now);
		if (label) items.get(label)?.push(conversation);
	}

	return labels
		.map((label) => ({ label, items: items.get(label) ?? [] }))
		.filter((group) => group.items.length > 0);
}
