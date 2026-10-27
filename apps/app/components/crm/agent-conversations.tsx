"use client";

import { Button } from "@crm/ui/components/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@crm/ui/components/dropdown-menu";
import { Icon } from "@crm/ui/components/icon";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronDownIcon, PlusIcon, Trash2Icon } from "lucide-react";
import { toast } from "sonner";
import { LocalDateTime } from "@/components/local-date-time";
import { useTRPC } from "@/lib/trpc/client";
import type { RouterOutputs } from "@/lib/trpc/types";

export type Conversation = RouterOutputs["conversations"]["list"][number];

const DATE_OPTIONS: Intl.DateTimeFormatOptions = {
	month: "short",
	day: "numeric",
	hour: "numeric",
	minute: "2-digit",
};

export function ConversationPicker({
	conversations,
	current,
	onSelect,
	onNew,
	busy,
}: {
	conversations: Conversation[];
	current: Conversation | null;
	onSelect: (conversation: Conversation) => void;
	onNew: () => void;
	busy: boolean;
}) {
	const label = current?.title ?? "New conversation";

	return (
		<div className="flex min-w-0 items-center gap-2 border-b py-2">
			<DropdownMenu>
				<DropdownMenuTrigger asChild>
					<Button
						variant="ghost"
						size="sm-flush"
						className="min-w-0 flex-1 justify-start font-normal"
					>
						<span className="truncate">{label}</span>
						<Icon icon={ChevronDownIcon} data-icon="inline-end" />
					</Button>
				</DropdownMenuTrigger>

				<DropdownMenuContent align="start" className="w-72">
					{conversations.length === 0 ? (
						<DropdownMenuItem disabled>Nothing yet</DropdownMenuItem>
					) : (
						conversations.map((conversation) => (
							<DropdownMenuItem
								key={conversation.id}
								onSelect={() => onSelect(conversation)}
							>
								<span className="min-w-0 flex-1 truncate">
									{conversation.title ?? "Untitled"}
								</span>
								<span className="shrink-0 text-muted-foreground text-xs">
									<LocalDateTime
										date={conversation.lastMessageAt}
										options={DATE_OPTIONS}
									/>
								</span>
							</DropdownMenuItem>
						))
					)}

					<DropdownMenuSeparator />
					<DropdownMenuItem onSelect={onNew}>
						<Icon icon={PlusIcon} data-icon="inline-start" />
						New conversation
					</DropdownMenuItem>
				</DropdownMenuContent>
			</DropdownMenu>

			{current ? (
				<Forget conversation={current} onDone={onNew} busy={busy} />
			) : null}
		</div>
	);
}

function Forget({
	conversation,
	onDone,
	busy,
}: {
	conversation: Conversation;
	onDone: () => void;
	busy: boolean;
}) {
	const trpc = useTRPC();
	const conversations = useConversationCache();

	const remove = useMutation(
		trpc.conversations.remove.mutationOptions({
			onSuccess: async () => {
				await conversations.invalidate();
				onDone();
				toast.success("Conversation deleted.");
			},
			onError: (error) => toast.error(error.message),
		}),
	);

	return (
		<Button
			variant="ghost"
			size="icon-sm"
			disabled={busy || remove.isPending}
			onClick={() => remove.mutate({ id: conversation.id })}
		>
			<Icon icon={Trash2Icon} />
			<span className="sr-only">Delete this conversation</span>
		</Button>
	);
}

export function useConversations(recordId: {
	contactId?: string;
	companyId?: string;
}) {
	const trpc = useTRPC();
	return useQuery(trpc.conversations.list.queryOptions(recordId));
}

function useConversationCache() {
	const trpc = useTRPC();
	const queryClient = useQueryClient();

	return {
		invalidate: () =>
			queryClient.invalidateQueries({
				queryKey: trpc.conversations.list.pathKey(),
			}),
	};
}
