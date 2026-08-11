"use client";

import Warning from "@carbon/icons-react/es/Warning";
import { Alert, AlertDescription, AlertTitle } from "@crm/ui/components/alert";
import { Button } from "@crm/ui/components/button";
import { Icon } from "@crm/ui/components/icon";
import { Switch } from "@crm/ui/components/switch";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import {
	ChannelPicker,
	type PickerChannel,
} from "@/components/slack/channel-picker";
import { useTRPC } from "@/lib/trpc/client";

export type Capabilities = {
	readable: boolean;
	problem: string | null;
	channel: { kind: "channel" | "user"; id: string; label: string } | null;
	actions: Array<{ type: string; provider: string; summary: string }>;
	dataScope: {
		mode: "SELECTED" | "WORKSPACE";
		summary: string;
		resources: Array<{ id: string; kind: string; label: string }>;
	} | null;
};

const ACTION_LABELS: Record<string, string> = {
	"slack.message.post": "Post a message",
	"crm.activity.create": "Write a note or task on the record",
	"run.summary": "Write a summary of the run",
};

export function AgentCapabilities({
	agentId,
	canManage,
	capabilities,
}: {
	agentId: string;
	canManage: boolean;
	capabilities: Capabilities;
}) {
	const trpc = useTRPC();
	const queryClient = useQueryClient();
	const [picked, setPicked] = useState<PickerChannel | null>(null);

	const channels = useQuery({
		...trpc.slack.channels.queryOptions(),
		enabled: capabilities.channel !== null,
	});
	const rows = channels.data?.rows ?? [];
	const canInviteItself = channels.data?.canInviteItself ?? false;

	const setChannel = useMutation(
		trpc.agents.setChannel.mutationOptions({
			onSuccess: async () => {
				await queryClient.invalidateQueries({
					queryKey: trpc.agents.byId.pathKey(),
				});
				setPicked(null);
				toast.success("Saved. The agent moves to the new channel.");
			},
			onError: (error) => toast.error(error.message),
		}),
	);

	const join = useMutation(
		trpc.slack.joinChannel.mutationOptions({
			onSuccess: async () => {
				await channels.refetch();
				toast.success("Asked someone to invite Comp AI.");
			},
			onError: (error) => toast.error(error.message),
		}),
	);

	if (!capabilities.readable) {
		return (
			<Alert variant="warning">
				<Icon icon={Warning} />
				<AlertTitle>This version's manifest cannot be read</AlertTitle>
				<AlertDescription>
					{capabilities.problem ?? "The manifest is not in a shape we know."}
				</AlertDescription>
			</Alert>
		);
	}

	const current = capabilities.channel;
	const from = current?.label.replace(/^#/, "") ?? null;
	const to = picked?.name ?? null;
	const dirty = to !== null && to !== from;

	return (
		<div className="flex flex-col gap-9">
			{current ? (
				<Section
					action={
						canManage ? (
							<Button size="sm" variant="outline">
								Create a channel
							</Button>
						) : null
					}
					summary="One channel. Comp AI joins it when you save."
					title="Lives in"
				>
					<ChannelPicker
						canInviteItself={canInviteItself}
						channels={rows}
						onRequest={(channel) => join.mutate({ channelId: channel.id })}
						onSelect={(channel) => canManage && setPicked(channel)}
						pending={setChannel.isPending}
						value={picked?.id ?? current.id}
					/>
				</Section>
			) : null}

			<Section
				summary="If it is off here, it cannot do it."
				title="What it can do there"
			>
				<div className="flex flex-col">
					{capabilities.actions.map((action) => (
						<div
							className="flex h-13 items-center gap-3 border-b last:border-b-0"
							key={action.type}
						>
							<div className="min-w-0 flex-1">
								<p className="text-sm">
									{ACTION_LABELS[action.type] ?? action.type}
								</p>
								<p className="text-muted-foreground text-xs">
									{action.summary || action.provider}
								</p>
							</div>
							<Switch checked disabled />
						</div>
					))}
					{capabilities.actions.length === 0 ? (
						<p className="text-muted-foreground text-sm">
							Nothing outside the CRM.
						</p>
					) : null}
				</div>
			</Section>

			<Section
				summary={
					capabilities.dataScope?.summary || "What it reads to do its job."
				}
				title="What it can see"
			>
				<div className="flex flex-wrap gap-2">
					{capabilities.dataScope?.mode === "WORKSPACE" &&
					(capabilities.dataScope?.resources.length ?? 0) === 0 ? (
						<span className="flex h-7 items-center rounded-md border px-2.5 text-sm">
							Every record in the workspace
						</span>
					) : (
						capabilities.dataScope?.resources.map((resource) => (
							<span
								className="flex h-7 items-center rounded-md border px-2.5 text-sm"
								key={`${resource.kind}:${resource.id}`}
							>
								{resource.label}
							</span>
						))
					)}
				</div>
			</Section>

			{dirty && current ? (
				<div className="flex items-center gap-4 border-t pt-5">
					<div className="min-w-0 flex-1">
						<p className="font-medium text-sm">
							Moving from #{from} to #{to}
						</p>
						<p className="text-muted-foreground text-sm">
							Saving makes a new version and adds Comp AI to #{to}. It stays in
							#{from} until you remove it.
						</p>
					</div>
					<Button
						disabled={setChannel.isPending}
						onClick={() => setPicked(null)}
						variant="outline"
					>
						Discard
					</Button>
					<Button
						disabled={setChannel.isPending}
						onClick={() =>
							picked &&
							setChannel.mutate({
								id: agentId,
								clientRequestId: crypto.randomUUID(),
								channelId: picked.id,
								channelName: picked.name,
							})
						}
					>
						{setChannel.isPending ? "Saving…" : "Save and hand to the builder"}
					</Button>
				</div>
			) : null}
		</div>
	);
}

function Section({
	action,
	children,
	summary,
	title,
}: {
	action?: React.ReactNode;
	children: React.ReactNode;
	summary: string;
	title: string;
}) {
	return (
		<section className="flex flex-col gap-3.5">
			<div className="flex items-end justify-between gap-4">
				<div>
					<h2 className="font-semibold text-lg tracking-tight">{title}</h2>
					<p className="text-muted-foreground text-sm">{summary}</p>
				</div>
				{action}
			</div>
			{children}
		</section>
	);
}
