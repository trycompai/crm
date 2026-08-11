"use client";

import Checkmark from "@carbon/icons-react/es/Checkmark";
import Locked from "@carbon/icons-react/es/Locked";
import {
	AlertDialog,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "@crm/ui/components/alert-dialog";
import {
	AsyncButtonContent,
	useAsyncAction,
} from "@crm/ui/components/async-action";
import { Button } from "@crm/ui/components/button";
import { Icon } from "@crm/ui/components/icon";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { useTRPC } from "@/lib/trpc/client";

type Channel = {
	id: string;
	name: string;
	memberCount: number | null;
	isPrivate: boolean;
	isMember: boolean;
	inviteRequestedAt: string | null;
};

const INVITE_COMMAND = "/invite @Comp AI";

export function SlackChannels() {
	const trpc = useTRPC();
	const [asking, setAsking] = useState<Channel | null>(null);
	const channels = useQuery(trpc.slack.channels.queryOptions());
	const join = useMutation(
		trpc.slack.joinChannel.mutationOptions({
			onSuccess: async (result) => {
				await channels.refetch();
				setAsking(null);
				toast.success(
					result.alreadyJoined
						? "Comp AI is already in that channel."
						: result.queued
							? "Comp AI is joining that channel."
							: "Ask a member to invite Comp AI.",
				);
			},
			onError: (error) => toast.error(error.message),
		}),
	);
	const joinAction = useAsyncAction({
		action: async (channelId: string) => join.mutateAsync({ channelId }),
	});

	const rows = channels.data?.rows ?? [];
	const canInviteItself = channels.data?.canInviteItself ?? false;

	if (rows.length === 0) return null;

	return (
		<section className="flex flex-col gap-3 px-(--spacing-block-inline)">
			<div>
				<h2 className="font-medium text-sm">Channels Comp AI can reach</h2>
				<p className="text-muted-foreground text-xs">
					An agent posts only where its automation says. This is the list it can
					choose from.
				</p>
			</div>

			<div className="flex flex-col divide-y rounded-lg border">
				{rows.map((channel) => (
					<ChannelRow
						channel={channel}
						canInviteItself={canInviteItself}
						key={channel.id}
						onAsk={() => setAsking(channel)}
						onJoin={() => void joinAction.run(channel.id)}
						pending={joinAction.pending}
					/>
				))}
			</div>

			<AskDialog
				canInviteItself={canInviteItself}
				channel={asking}
				onCancel={() => setAsking(null)}
				onConfirm={() => asking && void joinAction.run(asking.id)}
				status={joinAction.status}
			/>
		</section>
	);
}

function ChannelRow({
	channel,
	canInviteItself,
	onAsk,
	onJoin,
	pending,
}: {
	channel: Channel;
	canInviteItself: boolean;
	onAsk: () => void;
	onJoin: () => void;
	pending: boolean;
}) {
	return (
		<div
			className={`flex h-14 shrink-0 items-center gap-3 px-4 ${channel.isMember ? "bg-muted" : ""}`}
		>
			<span className="flex w-5 shrink-0 items-center justify-center text-muted-foreground">
				{channel.isPrivate ? (
					<Icon icon={Locked} motion="none" className="size-3.5" />
				) : (
					"#"
				)}
			</span>

			<div className="min-w-0 flex-1">
				<p
					className={`font-medium text-sm ${channel.isMember ? "" : "text-muted-foreground"}`}
				>
					{channel.name}
				</p>
				<p className="text-muted-foreground text-xs">
					{describe(channel, canInviteItself)}
				</p>
			</div>

			<span className="flex w-20 shrink-0 items-center justify-end">
				{channel.isMember ? (
					<Icon
						icon={Checkmark}
						motion="none"
						className="size-4 text-success"
					/>
				) : (
					<Button
						disabled={pending}
						onClick={channel.isPrivate && !canInviteItself ? onAsk : onJoin}
						size="xs"
						variant="outline"
					>
						{channel.isPrivate && !canInviteItself
							? channel.inviteRequestedAt
								? "Ask again"
								: "Request"
							: "Add"}
					</Button>
				)}
			</span>
		</div>
	);
}

function describe(channel: Channel, canInviteItself: boolean): string {
	const people =
		channel.memberCount === null ? "" : ` · ${channel.memberCount} people`;

	if (channel.isMember) return `Comp AI is a member${people}`;
	if (!channel.isPrivate) return `Comp AI can join this channel${people}`;
	if (canInviteItself) return `Private. Comp AI joins on your behalf${people}`;
	if (channel.inviteRequestedAt) {
		return `Private. Waiting for a member to invite Comp AI${people}`;
	}
	return `Private. A member has to invite Comp AI${people}`;
}

function AskDialog({
	canInviteItself,
	channel,
	onCancel,
	onConfirm,
	status,
}: {
	canInviteItself: boolean;
	channel: Channel | null;
	onCancel: () => void;
	onConfirm: () => void;
	status: "idle" | "pending" | "success" | "error";
}) {
	if (!channel) return null;

	return (
		<AlertDialog open onOpenChange={(open) => !open && onCancel()}>
			<AlertDialogContent>
				<AlertDialogHeader>
					<AlertDialogTitle>
						{canInviteItself
							? `Add Comp AI to #${channel.name}?`
							: "Ask someone to add Comp AI"}
					</AlertDialogTitle>
					<AlertDialogDescription>
						{canInviteItself
							? `#${channel.name} is private. Comp AI is added on your behalf, the same as if you typed the invite yourself. Everyone in the channel sees that it joined. It reads nothing until you switch a permission on.`
							: `The CRM cannot add itself to a private channel without the workspace grant. Someone already in #${channel.name} has to run this command there.`}
					</AlertDialogDescription>
				</AlertDialogHeader>

				{canInviteItself ? null : (
					<div className="rounded-md bg-muted px-3 py-2.5 font-mono text-sm">
						{INVITE_COMMAND}
					</div>
				)}

				<AlertDialogFooter>
					<AlertDialogCancel disabled={status === "pending"}>
						Cancel
					</AlertDialogCancel>
					<Button
						disabled={status === "pending"}
						onClick={
							canInviteItself
								? onConfirm
								: () => {
										void navigator.clipboard.writeText(INVITE_COMMAND);
										toast.success("Command copied.");
										onConfirm();
									}
						}
					>
						<AsyncButtonContent pendingLabel="Adding…" status={status}>
							{canInviteItself ? "Add Comp AI" : "Copy and mark as asked"}
						</AsyncButtonContent>
					</Button>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	);
}
