"use client";

import Checkmark from "@carbon/icons-react/es/Checkmark";
import { Button } from "@crm/ui/components/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@crm/ui/components/dialog";
import { Icon } from "@crm/ui/components/icon";
import { Input } from "@crm/ui/components/input";
import { Label } from "@crm/ui/components/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@crm/ui/components/select";
import { Textarea } from "@crm/ui/components/textarea";
import { InvalidInput, type Permission, parse, schemas } from "@crm/validation";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { useSlackChannels } from "@/components/slack/use-slack-channels";
import { handoffBrief, handoffResources } from "@/lib/agent-handoff";
import { useTRPC } from "@/lib/trpc/client";
import { useWorkspaceUrl } from "@/lib/use-workspace-url";

export function NewAgentDialog({ children }: { children: React.ReactNode }) {
	const router = useRouter();
	const trpc = useTRPC();
	const queryClient = useQueryClient();
	const workspaceUrl = useWorkspaceUrl();

	const [open, setOpen] = useState(false);
	const [name, setName] = useState("");
	const [job, setJob] = useState("");
	const [channelId, setChannelId] = useState("");
	const [allowed, setAllowed] = useState<Permission[]>(
		schemas.agents.defaultPermissions,
	);

	const channels = useSlackChannels({ enabled: open });
	const rows = channels.channels;
	const channel = rows.find((row) => row.id === channelId);

	const create = useMutation(
		trpc.conversations.createBuilder.mutationOptions({
			onSuccess: async ({ id }) => {
				await queryClient.invalidateQueries({
					queryKey: trpc.conversations.builderList.pathKey(),
				});
				setOpen(false);
				router.push(workspaceUrl(`/chat/${id}`));
			},
			onError: (error) => toast.error(error.message),
		}),
	);

	const ready = name.trim().length > 0 && job.trim().length > 0;

	const hand = () => {
		try {
			const handoff = parse(
				schemas.agents.handoff,
				{
					name,
					job,
					channel: channel
						? {
								id: channel.id,
								name: channel.name,
								isMember: channel.isMember,
							}
						: null,
					allowed,
				},
				"This agent",
			);

			create.mutate({
				clientRequestId: crypto.randomUUID(),
				commandType: "CREATE_AGENT",
				message: handoffBrief(handoff),
				resources: handoffResources(handoff),
				attachments: [],
			});
		} catch (error) {
			toast.error(
				error instanceof InvalidInput
					? error.message
					: "Could not hand this to the builder.",
			);
		}
	};

	return (
		<Dialog onOpenChange={setOpen} open={open}>
			<DialogTrigger asChild>{children}</DialogTrigger>

			<DialogContent className="sm:max-w-(--container-sheet)">
				<DialogHeader>
					<DialogTitle>New agent</DialogTitle>
					<DialogDescription>
						Say what it is and where it lives. The builder writes the rest. You
						can change all of this later.
					</DialogDescription>
				</DialogHeader>

				<div className="flex flex-col gap-4">
					<div className="flex flex-col gap-1.5">
						<Label htmlFor="agent-name">Name</Label>
						<Input
							id="agent-name"
							onChange={(event) => setName(event.target.value)}
							placeholder="Renewal prep brief"
							value={name}
						/>
					</div>

					<div className="flex flex-col gap-1.5">
						<Label htmlFor="agent-job">What it should do</Label>
						<Textarea
							id="agent-job"
							onChange={(event) => setJob(event.target.value)}
							placeholder="A week before a renewal, gather the account history and post a short brief for whoever owns the deal."
							rows={3}
							value={job}
						/>
					</div>

					<div className="flex flex-col gap-1.5">
						<Label htmlFor="agent-channel">Lives in</Label>
						<Select onValueChange={setChannelId} value={channelId}>
							<SelectTrigger id="agent-channel">
								<SelectValue placeholder="Pick a Slack channel" />
							</SelectTrigger>
							<SelectContent>
								{rows.map((row) => (
									<SelectItem key={row.id} value={row.id}>
										#{row.name}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
						<p className="text-muted-foreground text-xs">
							{channel
								? channel.isMember
									? `Comp AI is already in #${channel.name}.`
									: `Comp AI is not in #${channel.name} yet. It joins when you create this.`
								: "Leave this empty and the builder will ask."}
						</p>
					</div>

					<div className="flex flex-col gap-1.5">
						<Label>Allowed to</Label>
						<div className="flex flex-wrap gap-2">
							{schemas.agents.permissions.map((entry) => {
								const on = allowed.includes(entry.id);

								return (
									<Button
										key={entry.id}
										onClick={() =>
											setAllowed((current) =>
												on
													? current.filter((id) => id !== entry.id)
													: [...current, entry.id],
											)
										}
										size="sm"
										type="button"
										variant={on ? "secondary" : "outline"}
									>
										{on ? (
											<Icon
												className="size-3.5 text-primary"
												icon={Checkmark}
												motion="none"
											/>
										) : null}
										{entry.label}
									</Button>
								);
							})}
						</div>
					</div>
				</div>

				<DialogFooter className="items-center">
					<p className="mr-auto text-muted-foreground text-xs">
						Nothing sends until you turn it on.
					</p>
					<Button
						disabled={create.isPending}
						onClick={() => setOpen(false)}
						variant="outline"
					>
						Cancel
					</Button>
					<Button disabled={!ready || create.isPending} onClick={hand}>
						{create.isPending ? "Handing over…" : "Hand to the builder"}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
