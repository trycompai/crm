"use client";

import Checkmark from "@carbon/icons-react/es/Checkmark";
import Locked from "@carbon/icons-react/es/Locked";
import { Button } from "@crm/ui/components/button";
import { Icon } from "@crm/ui/components/icon";

export type PickerChannel = {
	id: string;
	name: string;
	memberCount: number | null;
	isPrivate: boolean;
	isMember: boolean;
	inviteRequestedAt: string | null;
	pending: boolean;
};

export function ChannelPicker({
	canInviteItself,
	channels,
	onRequest,
	onSelect,
	pending = false,
	value,
}: {
	canInviteItself: boolean;
	channels: PickerChannel[];
	onRequest?: (channel: PickerChannel) => void;
	onSelect: (channel: PickerChannel) => void;
	pending?: boolean;
	value: string | null;
}) {
	return (
		<div className="flex flex-col divide-y overflow-hidden rounded-lg border">
			{channels.length === 0 ? (
				<p className="px-4 py-4 text-muted-foreground text-sm">
					No channels yet. Comp AI reads the list from Slack after it connects.
				</p>
			) : null}

			{channels.map((channel) => {
				const selected = channel.id === value;
				const blocked = channel.isPrivate && !channel.isMember;

				return (
					<button
						className={`flex h-14 shrink-0 items-center gap-3 px-4 text-left ${selected ? "bg-muted" : "hover:bg-muted/50"}`}
						disabled={
							pending || channel.pending || (blocked && !canInviteItself)
						}
						key={channel.id}
						onClick={() => onSelect(channel)}
						type="button"
					>
						<span className="flex w-5 shrink-0 items-center justify-center text-muted-foreground">
							{channel.isPrivate ? (
								<Icon className="size-3.5" icon={Locked} motion="none" />
							) : (
								"#"
							)}
						</span>

						<span className="flex min-w-0 flex-1 flex-col gap-px">
							<span
								className={`font-medium text-sm ${selected || channel.isMember ? "" : "text-muted-foreground"}`}
							>
								{channel.name}
							</span>
							<span className="text-muted-foreground text-xs">
								{describe(channel, canInviteItself)}
							</span>
						</span>

						<span className="flex w-20 shrink-0 items-center justify-end">
							{channel.pending ? (
								<span className="text-muted-foreground text-xs">Creating…</span>
							) : selected ? (
								<Icon
									className="size-4 text-success"
									icon={Checkmark}
									motion="none"
								/>
							) : blocked && !canInviteItself && onRequest ? (
								<Button
									disabled={pending}
									onClick={(event) => {
										event.stopPropagation();
										onRequest(channel);
									}}
									size="xs"
									variant="outline"
								>
									{channel.inviteRequestedAt ? "Ask again" : "Request"}
								</Button>
							) : null}
						</span>
					</button>
				);
			})}
		</div>
	);
}

function describe(channel: PickerChannel, canInviteItself: boolean): string {
	const people =
		channel.memberCount === null ? "" : ` · ${channel.memberCount} people`;

	if (channel.pending) return "Slack is making this channel now";
	if (channel.isMember) return `Comp AI is in${people}`;
	if (!channel.isPrivate) return `Comp AI joins when you save${people}`;
	if (canInviteItself) return `Private. Comp AI joins as you${people}`;
	if (channel.inviteRequestedAt)
		return `Private. Waiting on an invite${people}`;
	return `Private. Someone inside has to invite Comp AI${people}`;
}
