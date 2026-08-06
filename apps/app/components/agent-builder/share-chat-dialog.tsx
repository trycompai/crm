"use client";

import Close from "@carbon/icons-react/es/Close";
import Copy from "@carbon/icons-react/es/Copy";
import {
	AsyncButtonContent,
	useAsyncAction,
} from "@crm/ui/components/async-action";
import { Button } from "@crm/ui/components/button";
import {
	Dialog,
	DialogClose,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@crm/ui/components/dialog";
import { Icon } from "@crm/ui/components/icon";
import { cn } from "@crm/ui/lib/utils";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { useTRPC } from "@/lib/trpc/client";
import { useWorkspaceUrl } from "@/lib/use-workspace-url";

export function ShareChatDialog({
	conversationId,
	title,
}: {
	conversationId: string;
	title: string;
}) {
	const trpc = useTRPC();
	const workspaceUrl = useWorkspaceUrl();
	const queryClient = useQueryClient();
	const [open, setOpen] = useState(false);
	const [choice, setChoice] = useState<boolean | null>(null);
	const [token, setToken] = useState<string | null>(null);
	const status = useQuery({
		...trpc.conversations.shareStatus.queryOptions({ id: conversationId }),
		enabled: open,
	});
	const shared = choice ?? status.data?.enabled ?? false;

	const invalidate = () =>
		queryClient.invalidateQueries({
			queryKey: trpc.conversations.shareStatus.pathKey(),
		});

	const create = useMutation(
		trpc.conversations.createShare.mutationOptions({
			onSuccess: async (result) => {
				setToken(result.token);
				setChoice(true);
				await invalidate();
			},
			onError: (error) => toast.error(error.message),
		}),
	);
	const revoke = useMutation(
		trpc.conversations.revokeShare.mutationOptions({
			onSuccess: async () => {
				setToken(null);
				setChoice(false);
				await invalidate();
				toast.success("Chat link revoked.");
			},
			onError: (error) => toast.error(error.message),
		}),
	);

	const copyLink = async () => {
		if (!token) return;
		await navigator.clipboard.writeText(
			`${window.location.origin}${workspaceUrl(`/chat/${token}`)}`,
		);
		toast.success("Chat link copied.");
	};
	const createAction = useAsyncAction({
		action: () => create.mutateAsync({ id: conversationId }),
		onError: () => setChoice(null),
	});
	const revokeAction = useAsyncAction({
		action: () => revoke.mutateAsync({ id: conversationId }),
	});
	const copyAction = useAsyncAction({ action: copyLink });

	return (
		<Dialog
			open={open}
			onOpenChange={(next) => {
				setOpen(next);
				if (!next) setChoice(null);
			}}
		>
			<DialogTrigger asChild>
				<Button variant="outline" size="sm">
					Share chat
				</Button>
			</DialogTrigger>
			<DialogContent
				showCloseButton={false}
				className="w-[440px] max-w-[calc(100%-2rem)] gap-0 overflow-hidden p-0 sm:max-w-[440px]"
			>
				<DialogHeader className="relative gap-1 border-b p-5 pr-14">
					<DialogTitle className="font-semibold text-sm">
						Share chat
					</DialogTitle>
					<DialogDescription>{title}</DialogDescription>
					<DialogClose asChild>
						<Button
							variant="ghost"
							size="icon-sm"
							className="absolute top-4 right-4"
						>
							<Icon icon={Close} />
							<span className="sr-only">Close</span>
						</Button>
					</DialogClose>
				</DialogHeader>

				<div className="flex flex-col gap-2.5 p-5">
					<ShareChoice
						selected={!shared}
						label="Only you"
						disabled={createAction.pending || revokeAction.pending}
						onSelect={() => {
							if (shared || status.data?.enabled) {
								revokeAction.run();
							} else {
								setChoice(false);
							}
						}}
					/>
					<ShareChoice
						selected={shared}
						label="Anyone in Comp AI with the link"
						detail="Read-only"
						disabled={createAction.pending || revokeAction.pending}
						onSelect={() => {
							if (!token) createAction.run();
							setChoice(true);
						}}
					/>

					{shared ? (
						<div className="flex h-9 items-center gap-3 rounded-md border bg-background py-[3px] pr-[3px] pl-4">
							<span className="min-w-0 flex-1 truncate font-mono text-xs">
								{token
									? `${workspaceUrl(`/chat/${token.slice(0, 12)}`)}…`
									: "An active read-only link exists"}
							</span>
							<Button
								variant="outline"
								size="sm"
								onClick={() => {
									if (token) {
										copyAction.run();
									} else {
										createAction.run();
									}
								}}
								disabled={createAction.pending || copyAction.pending}
								aria-busy={createAction.pending || copyAction.pending}
							>
								<AsyncButtonContent
									status={token ? copyAction.status : createAction.status}
									pendingLabel={token ? "Copying" : "Creating link"}
									successLabel={token ? "Copied" : "Link created"}
									errorLabel="Try again"
								>
									{token ? <Icon icon={Copy} data-icon="inline-start" /> : null}
									{token ? "Copy link" : "Replace link"}
								</AsyncButtonContent>
							</Button>
						</div>
					) : null}

					<p className="text-muted-foreground text-xs">
						Sharing this chat does not change who can edit or run the agent.
					</p>
				</div>

				<DialogFooter className="flex-row items-center justify-between border-t p-4 px-5">
					<Button
						variant="ghost"
						onClick={() => revokeAction.run()}
						disabled={!shared || revokeAction.pending}
						aria-busy={revokeAction.pending}
					>
						<AsyncButtonContent
							status={revokeAction.status}
							pendingLabel="Revoking"
							successLabel="Revoked"
							errorLabel="Try again"
						>
							Revoke link
						</AsyncButtonContent>
					</Button>
					<div className="flex gap-3">
						<DialogClose asChild>
							<Button variant="outline">Cancel</Button>
						</DialogClose>
						<DialogClose asChild>
							<Button>Done</Button>
						</DialogClose>
					</div>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}

function ShareChoice({
	selected,
	label,
	detail,
	disabled = false,
	onSelect,
}: {
	selected: boolean;
	label: string;
	detail?: string;
	disabled?: boolean;
	onSelect: () => void;
}) {
	return (
		<label
			className={cn(
				"flex h-12 w-full cursor-pointer items-center gap-2.5 rounded-md border px-2.5 text-left outline-none focus-within:ring-2 focus-within:ring-ring/60",
				selected && "border-muted-foreground/60 bg-muted",
				disabled && "cursor-not-allowed opacity-50",
			)}
		>
			<input
				type="radio"
				name="chat-sharing"
				checked={selected}
				disabled={disabled}
				onChange={onSelect}
				className="sr-only"
			/>
			<span
				className={cn(
					"flex size-3.5 shrink-0 items-center justify-center rounded-full border border-muted-foreground",
					selected && "border-ring",
				)}
			>
				{selected ? <span className="size-2 rounded-full bg-ring" /> : null}
			</span>
			<span className="min-w-0 flex-1">
				<span className="block font-medium text-sm">{label}</span>
				{detail ? (
					<span className="block text-muted-foreground text-xs">{detail}</span>
				) : null}
			</span>
		</label>
	);
}
