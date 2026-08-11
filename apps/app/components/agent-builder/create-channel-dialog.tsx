"use client";

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
import { Input } from "@crm/ui/components/input";
import { Label } from "@crm/ui/components/label";
import { Switch } from "@crm/ui/components/switch";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { useTRPC } from "@/lib/trpc/client";

export function CreateChannelDialog({
	children,
	onCreated,
}: {
	children: React.ReactNode;
	onCreated: () => Promise<void> | void;
}) {
	const trpc = useTRPC();
	const queryClient = useQueryClient();
	const [open, setOpen] = useState(false);
	const [name, setName] = useState("");
	const [isPrivate, setIsPrivate] = useState(false);

	const create = useMutation(
		trpc.slack.createChannel.mutationOptions({
			onSuccess: async () => {
				await queryClient.invalidateQueries({
					queryKey: trpc.slack.channels.queryKey(),
				});
				await onCreated();
				setOpen(false);
				setName("");
				toast.success("Creating the channel in Slack.");
			},
			onError: (error) => toast.error(error.message),
		}),
	);

	const slug = name.trim().toLowerCase().replace(/\s+/g, "-");
	const valid = /^[a-z0-9-_]+$/.test(slug);

	return (
		<Dialog onOpenChange={setOpen} open={open}>
			<DialogTrigger asChild>{children}</DialogTrigger>

			<DialogContent className="sm:max-w-(--container-narrow)">
				<DialogHeader>
					<DialogTitle>Create a channel</DialogTitle>
					<DialogDescription>
						Comp AI makes it in Slack and joins it. You can put the agent in it
						straight after.
					</DialogDescription>
				</DialogHeader>

				<div className="flex flex-col gap-4">
					<div className="flex flex-col gap-1.5">
						<Label htmlFor="channel-name">Name</Label>
						<Input
							id="channel-name"
							onChange={(event) => setName(event.target.value)}
							placeholder="renewals"
							value={name}
						/>
						<p className="text-muted-foreground text-xs">
							{slug && !valid
								? "Use lowercase letters, numbers and dashes."
								: `Slack will call it #${slug || "renewals"}.`}
						</p>
					</div>

					<div className="flex items-center gap-3">
						<Switch
							checked={isPrivate}
							id="channel-private"
							onCheckedChange={setIsPrivate}
						/>
						<Label htmlFor="channel-private">
							Private. Only people you invite can see it.
						</Label>
					</div>
				</div>

				<DialogFooter>
					<Button
						disabled={create.isPending}
						onClick={() => setOpen(false)}
						variant="outline"
					>
						Cancel
					</Button>
					<Button
						disabled={!valid || create.isPending}
						onClick={() => create.mutate({ name: slug, isPrivate })}
					>
						{create.isPending ? "Creating…" : "Create channel"}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
