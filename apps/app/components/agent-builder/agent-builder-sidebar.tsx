"use client";

import Add from "@carbon/icons-react/es/Add";
import Bot from "@carbon/icons-react/es/Bot";
import CheckmarkFilled from "@carbon/icons-react/es/CheckmarkFilled";
import CircleFilled from "@carbon/icons-react/es/CircleFilled";
import Renew from "@carbon/icons-react/es/Renew";
import { Button } from "@crm/ui/components/button";
import { Icon } from "@crm/ui/components/icon";
import { cn } from "@crm/ui/lib/utils";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { type ChatDateGroup, chatDateGroup } from "@/lib/chat-date-group";
import { useTRPC } from "@/lib/trpc/client";
import type { RouterOutputs } from "@/lib/trpc/types";
import { useHydrated } from "@/lib/use-hydrated";
import { useWorkspaceUrl } from "@/lib/use-workspace-url";
import { DeleteChatAction } from "./delete-chat-action";

type Conversation = RouterOutputs["conversations"]["builderList"][number];
type TeamAgent = RouterOutputs["agents"]["list"][number];
type SidebarData = {
	conversations: Conversation[];
	agents: TeamAgent[];
	updatedAt: number;
};

export function AgentBuilderSidebar({
	className,
	onNavigate,
	initialData,
}: {
	className?: string;
	onNavigate?: () => void;
	initialData?: SidebarData;
}) {
	const pathname = usePathname();
	const workspaceUrl = useWorkspaceUrl();
	const trpc = useTRPC();
	const queryClient = useQueryClient();
	const hydrated = useHydrated();
	const conversations = useQuery({
		...trpc.conversations.builderList.queryOptions(),
		initialData: initialData?.conversations,
		initialDataUpdatedAt: initialData?.updatedAt,
		refetchInterval: (query) =>
			query.state.data?.some((conversation) => conversation.state === "working")
				? 2500
				: 30_000,
	});
	const agents = useQuery({
		...trpc.agents.list.queryOptions(),
		initialData: initialData?.agents,
		initialDataUpdatedAt: initialData?.updatedAt,
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

	const showData = Boolean(initialData) || hydrated;
	const groupNow =
		initialData && !hydrated
			? initialData.updatedAt
			: conversations.dataUpdatedAt;
	const groups = groupConversations(
		showData ? (conversations.data ?? []) : [],
		showData ? groupNow : 0,
	);
	const teamAgents = showData ? (agents.data ?? []) : [];

	return (
		<aside className={cn("min-h-0 min-w-0 flex-col p-4 font-sans", className)}>
			<div className="flex h-7 shrink-0 items-center justify-between pl-2">
				<span className="font-medium text-xs">Chats</span>
				<Button asChild variant="ghost" size="icon-xs">
					<Link
						href={workspaceUrl("/chat")}
						aria-label="New agent chat"
						onClick={onNavigate}
					>
						<Icon icon={Add} />
					</Link>
				</Button>
			</div>

			<nav aria-label="Agent chats" className="min-h-0 flex-1 overflow-y-auto">
				{groups.map((group) => (
					<div key={group.label}>
						<div className="flex h-8 items-end pb-1 pl-2 font-medium text-[11px] text-muted-foreground uppercase tracking-[0.08em]">
							{group.label}
						</div>
						{group.items.map((conversation) => {
							const href = workspaceUrl(`/chat/${conversation.id}`);
							const active = pathname === href;
							const title = conversation.title ?? "Untitled chat";
							return (
								<div
									key={conversation.id}
									className="group relative flex h-7 min-w-0 items-center"
								>
									<Link
										href={href}
										aria-current={active ? "page" : undefined}
										onClick={() => {
											if (conversation.unread) {
												markRead.mutate({ id: conversation.id });
											}
											onNavigate?.();
										}}
										className={cn(
											"flex h-7 min-w-0 flex-1 items-center gap-3 rounded-sm pr-8 pl-2 text-xs outline-none transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring/60",
											active && "bg-muted font-medium",
											!active &&
												conversation.state === "idle" &&
												"text-muted-foreground",
										)}
									>
										<ConversationState state={conversation.state} />
										<span className="min-w-0 flex-1 truncate">{title}</span>
									</Link>
									<DeleteChatAction
										conversationId={conversation.id}
										title={title}
										trigger="close"
										returnToChatList={active}
										onDeleted={active ? onNavigate : undefined}
										className="absolute right-1 opacity-100 transition-opacity duration-150 [@media(hover:hover)]:pointer-events-none [@media(hover:hover)]:translate-x-1 [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-focus-within:pointer-events-auto [@media(hover:hover)]:group-focus-within:translate-x-0 [@media(hover:hover)]:group-focus-within:opacity-100 [@media(hover:hover)]:group-hover:pointer-events-auto [@media(hover:hover)]:group-hover:translate-x-0 [@media(hover:hover)]:group-hover:opacity-100 motion-safe:transition-[opacity,translate] motion-reduce:translate-x-0"
									/>
								</div>
							);
						})}
					</div>
				))}

				{groups.length === 0 ? (
					<p className="px-2 py-3 text-muted-foreground text-xs">
						No chats in the last 7 days.
					</p>
				) : null}

				<TeamAgents
					agents={teamAgents}
					pathname={pathname}
					onNavigate={onNavigate}
				/>
			</nav>
		</aside>
	);
}

function TeamAgents({
	agents,
	pathname,
	onNavigate,
}: {
	agents: TeamAgent[];
	pathname: string;
	onNavigate?: () => void;
}) {
	const workspaceUrl = useWorkspaceUrl();

	return (
		<div className="mt-3 border-t pt-1">
			<Link
				href={workspaceUrl("/agents")}
				transitionTypes={["nav-lateral"]}
				onClick={onNavigate}
				className="flex h-8 items-end gap-2 rounded-sm px-2 pb-1 font-medium text-[11px] text-muted-foreground uppercase tracking-[0.08em] outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/60"
			>
				<span className="min-w-0 flex-1">Team agents</span>
				<span className="shrink-0 font-mono">{agents.length}</span>
			</Link>
			{agents.map((agent) => {
				const href = workspaceUrl(`/agents/${agent.id}`);
				const active = pathname === href;
				return (
					<Link
						key={agent.id}
						href={href}
						aria-current={active ? "page" : undefined}
						onClick={onNavigate}
						className={cn(
							"flex h-7 items-center gap-3 rounded-sm px-2 text-xs outline-none transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring/60",
							active ? "bg-muted font-medium" : "text-muted-foreground",
						)}
					>
						<span className="flex size-5 shrink-0 items-center justify-center">
							<Icon icon={Bot} className="size-3.5" />
						</span>
						<span className="min-w-0 flex-1 truncate">{agent.name}</span>
					</Link>
				);
			})}
		</div>
	);
}

function ConversationState({ state }: { state: Conversation["state"] }) {
	if (state === "working") {
		return (
			<span className="flex size-5 shrink-0 items-center justify-center text-muted-foreground">
				<Icon icon={Renew} className="size-3.5 animate-spin" motion="none" />
			</span>
		);
	}

	if (state === "unread") {
		return (
			<span className="flex size-5 shrink-0 items-center justify-center text-ring">
				<Icon icon={CircleFilled} className="size-3.5" motion="none" />
			</span>
		);
	}

	if (state === "deployed") {
		return (
			<span className="flex size-5 shrink-0 items-center justify-center text-ring">
				<Icon icon={CheckmarkFilled} className="size-3.5" motion="none" />
			</span>
		);
	}

	return null;
}

function groupConversations(conversations: Conversation[], now: number) {
	if (!now) return [];

	const labels: ChatDateGroup[] = ["Today", "Yesterday", "Last 7 days"];
	const items: Record<ChatDateGroup, Conversation[]> = {
		Today: [],
		Yesterday: [],
		"Last 7 days": [],
	};

	for (const conversation of conversations) {
		const label = chatDateGroup(conversation.lastMessageAt, now);
		if (label) items[label].push(conversation);
	}

	return labels
		.map((label) => ({ label, items: items[label] }))
		.filter((group) => group.items.length > 0);
}
