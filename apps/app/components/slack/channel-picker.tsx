"use client";

import Checkmark from "@carbon/icons-react/es/Checkmark";
import Locked from "@carbon/icons-react/es/Locked";
import { Button } from "@crm/ui/components/button";
import { Icon } from "@crm/ui/components/icon";
import { cn } from "@crm/ui/lib/utils";

export type PickerChannel = {
	id: string;
	name: string;
	memberCount: number | null;
	isPrivate: boolean;
	isMember: boolean;
	classified: boolean;
	inviteRequestedAt: string | null;
};

export function ChannelPicker({
	canInviteItself,
	channels,
	empty,
	onAdd,
	onRequest,
	onSelect,
	pending = false,
	value = null,
}: {
	canInviteItself: boolean;
	channels: PickerChannel[];
	empty?: React.ReactNode;
	onAdd?: (channel: PickerChannel) => void;
	onRequest?: (channel: PickerChannel) => void;
	onSelect?: (channel: PickerChannel) => void;
	pending?: boolean;
	value?: string | null;
}) {
	return (
		<div className="flex flex-col divide-y overflow-hidden rounded-lg border">
			{channels.length === 0 ? empty : null}

			{channels.map((channel) => {
				const selected = value !== null && channel.id === value;
				const blocked = channel.isPrivate && !channel.isMember;
				const needsHuman = blocked && !canInviteItself;
				const selectable = Boolean(onSelect) && !needsHuman;

				return (
					<div
						className={cn(
							"relative flex h-14 shrink-0 items-center gap-3 px-4",
							selected && "bg-muted",
							selectable && "hover:bg-muted/50",
						)}
						key={channel.id}
					>
						{onSelect && selectable ? (
							<button
								aria-label={`Choose #${channel.name}`}
								aria-pressed={selected}
								className="absolute inset-0"
								disabled={pending}
								onClick={() => onSelect(channel)}
								type="button"
							/>
						) : null}

						<span className="flex w-5 shrink-0 items-center justify-center text-muted-foreground">
							{channel.isPrivate ? (
								<Icon className="size-3.5" icon={Locked} motion="none" />
							) : (
								"#"
							)}
						</span>

						<span className="flex min-w-0 flex-1 flex-col gap-px text-left">
							<span
								className={cn(
									"font-medium text-sm",
									!selected && !channel.isMember && "text-muted-foreground",
								)}
							>
								{channel.name}
							</span>
							<span className="text-muted-foreground text-xs">
								{describe(channel, canInviteItself)}
							</span>
						</span>

						<span className="relative flex w-20 shrink-0 items-center justify-end">
							{selected || (value === null && channel.isMember) ? (
								<Icon
									className="size-4 text-success"
									icon={Checkmark}
									motion="none"
								/>
							) : needsHuman && onRequest ? (
								<Button
									disabled={pending}
									onClick={() => onRequest(channel)}
									size="xs"
									variant="outline"
								>
									{channel.inviteRequestedAt ? "Ask again" : "Request"}
								</Button>
							) : !channel.isMember && onAdd ? (
								<Button
									disabled={pending}
									onClick={() => onAdd(channel)}
									size="xs"
									variant="outline"
								>
									Add
								</Button>
							) : null}
						</span>
					</div>
				);
			})}
		</div>
	);
}

function describe(channel: PickerChannel, canInviteItself: boolean): string {
	const people =
		channel.memberCount === null ? "" : ` · ${channel.memberCount} people`;

	if (channel.isMember) return `Comp AI is in${people}`;
	if (!channel.classified) return `Not read from Slack yet${people}`;
	if (!channel.isPrivate) return `Comp AI can join this one${people}`;
	if (canInviteItself) return `Private. Comp AI joins as you${people}`;
	if (channel.inviteRequestedAt)
		return `Private. Waiting on an invite${people}`;
	return `Private. Someone inside has to invite Comp AI${people}`;
}
