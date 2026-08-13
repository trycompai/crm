"use client";

import { Button } from "@crm/ui/components/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@crm/ui/components/dialog";
import { Field, FieldLabel } from "@crm/ui/components/field";
import { Input } from "@crm/ui/components/input";
import { Spinner } from "@crm/ui/components/spinner";
import { useMutation } from "@tanstack/react-query";
import { useId, useState } from "react";
import { toast } from "sonner";
import { useTRPC } from "@/lib/trpc/client";

function localNow(): string {
	const now = new Date(Date.now() - new Date().getTimezoneOffset() * 60_000);
	return now.toISOString().slice(0, 16);
}

export function ScheduleSend({
	campaignId,
	disabled,
	onSent,
}: {
	campaignId: string;
	disabled?: boolean;
	onSent: () => void;
}) {
	const trpc = useTRPC();
	const whenId = useId();
	const [open, setOpen] = useState(false);
	const [when, setWhen] = useState(localNow);

	const schedule = useMutation(
		trpc.marketingCampaigns.schedule.mutationOptions({
			onSuccess: (result) => {
				toast.success(
					result.at
						? `${result.queued.toLocaleString()} queued. They go out at the time you picked.`
						: `${result.queued.toLocaleString()} queued. Sending starts within a minute.`,
				);
				setOpen(false);
				onSent();
			},
			onError: (error) => toast.error(error.message),
		}),
	);

	const later = new Date(when);
	const valid = !Number.isNaN(later.getTime()) && later.getTime() > Date.now();

	return (
		<>
			<Button
				variant="outline"
				size="sm"
				disabled={disabled || schedule.isPending}
				onClick={() => setOpen(true)}
			>
				Schedule
			</Button>

			<Button
				size="sm"
				disabled={disabled || schedule.isPending}
				onClick={() => schedule.mutate({ id: campaignId, at: null })}
			>
				{schedule.isPending ? <Spinner /> : null}
				Send now
			</Button>

			<Dialog open={open} onOpenChange={setOpen}>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>Send this later</DialogTitle>
						<DialogDescription>
							The audience is frozen when you schedule, not when it sends. Quiet
							hours still hold, so a send inside them slides to the next open
							hour.
						</DialogDescription>
					</DialogHeader>

					<Field>
						<FieldLabel htmlFor={whenId}>When</FieldLabel>
						<Input
							id={whenId}
							type="datetime-local"
							value={when}
							min={localNow()}
							onChange={(event) => setWhen(event.target.value)}
						/>
					</Field>

					<DialogFooter>
						<Button variant="outline" onClick={() => setOpen(false)}>
							Cancel
						</Button>
						<Button
							disabled={!valid || schedule.isPending}
							onClick={() => schedule.mutate({ id: campaignId, at: later })}
						>
							{schedule.isPending ? <Spinner /> : null}
							Schedule
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</>
	);
}
