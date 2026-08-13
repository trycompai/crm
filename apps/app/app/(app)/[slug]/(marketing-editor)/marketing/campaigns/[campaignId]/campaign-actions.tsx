"use client";

import OverflowMenuHorizontal from "@carbon/icons-react/es/OverflowMenuHorizontal";
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "@crm/ui/components/alert-dialog";
import { Button } from "@crm/ui/components/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@crm/ui/components/dropdown-menu";
import { Icon } from "@crm/ui/components/icon";
import { Spinner } from "@crm/ui/components/spinner";
import { useMutation } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { useCampaignOptionsInvalidation } from "@/components/marketing/use-marketing-facets";
import { useTRPC } from "@/lib/trpc/client";
import { useWorkspaceUrl } from "@/lib/use-workspace-url";

type Dialog = "resume" | "archive" | "cancel" | null;

export function CampaignActions({
	campaignId,
	status,
	inFlight,
	onChanged,
}: {
	campaignId: string;
	status: string;
	inFlight: number;
	onChanged: () => void;
}) {
	const trpc = useTRPC();
	const router = useRouter();
	const workspaceUrl = useWorkspaceUrl();
	const invalidateCampaignOptions = useCampaignOptionsInvalidation();
	const [dialog, setDialog] = useState<Dialog>(null);

	const after = (message: string) => ({
		onSuccess: () => {
			toast.success(message);
			setDialog(null);
			onChanged();
		},
		onError: (error: { message: string }) => toast.error(error.message),
	});

	const pause = useMutation(
		trpc.marketingCampaigns.pause.mutationOptions(
			after("Paused. Nobody moves and nothing sends until you resume."),
		),
	);
	const resume = useMutation(
		trpc.marketingCampaigns.resume.mutationOptions(after("Running again.")),
	);
	const drain = useMutation(
		trpc.marketingCampaigns.drain.mutationOptions(
			after("Nobody new gets in. The people inside will finish."),
		),
	);
	const duplicate = useMutation(
		trpc.marketingCampaigns.duplicate.mutationOptions({
			onSuccess: (copy) => {
				toast.success("Copied. This is the copy, as a draft.");
				void invalidateCampaignOptions();
				router.push(workspaceUrl(`/marketing/campaigns/${copy.id}`));
			},
			onError: (error) => toast.error(error.message),
		}),
	);

	const archive = useMutation(
		trpc.marketingCampaigns.archive.mutationOptions({
			onSuccess: () => {
				toast.success("Archived.");
				setDialog(null);
				void invalidateCampaignOptions();
				router.push(workspaceUrl("/marketing/campaigns"));
			},
			onError: (error) => toast.error(error.message),
		}),
	);

	const cancel = useMutation(
		trpc.marketingCampaigns.cancel.mutationOptions(
			after("Cancelled. The queued emails are dropped and nothing goes out."),
		),
	);

	const busy =
		pause.isPending ||
		resume.isPending ||
		drain.isPending ||
		duplicate.isPending ||
		cancel.isPending ||
		archive.isPending;

	return (
		<>
			<DropdownMenu>
				<DropdownMenuTrigger asChild>
					<Button
						variant="outline"
						size="icon"
						aria-label="More"
						disabled={busy}
					>
						{busy ? <Spinner /> : <Icon icon={OverflowMenuHorizontal} />}
					</Button>
				</DropdownMenuTrigger>
				<DropdownMenuContent align="end">
					<DropdownMenuItem
						onSelect={() => duplicate.mutate({ id: campaignId })}
					>
						Make a copy
					</DropdownMenuItem>

					{status === "ACTIVE" ? (
						<DropdownMenuItem onSelect={() => pause.mutate({ id: campaignId })}>
							Pause
						</DropdownMenuItem>
					) : null}

					{status === "PAUSED" ? (
						<DropdownMenuItem onSelect={() => setDialog("resume")}>
							Resume
						</DropdownMenuItem>
					) : null}

					{status === "ACTIVE" || status === "PAUSED" ? (
						<DropdownMenuItem onSelect={() => drain.mutate({ id: campaignId })}>
							Stop letting people in
						</DropdownMenuItem>
					) : null}

					{status === "SCHEDULED" ? (
						<DropdownMenuItem
							variant="destructive"
							onSelect={() => setDialog("cancel")}
						>
							Cancel this send
						</DropdownMenuItem>
					) : null}

					<DropdownMenuItem onSelect={() => setDialog("archive")}>
						Archive
					</DropdownMenuItem>
				</DropdownMenuContent>
			</DropdownMenu>

			<AlertDialog
				open={dialog === "resume"}
				onOpenChange={(open) => !open && setDialog(null)}
			>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>Resume this campaign</AlertDialogTitle>
						<AlertDialogDescription>
							{inFlight.toLocaleString()} people are part-way through and their
							next email is overdue. Restarting the clocks spreads them out from
							today. Sending the backlog delivers all of them at once, which
							looks like a spike to a spam filter.
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel>Cancel</AlertDialogCancel>
						<Button
							variant="outline"
							onClick={() =>
								resume.mutate({ id: campaignId, clocks: "backlog" })
							}
						>
							Send the backlog
						</Button>
						<AlertDialogAction
							onClick={() =>
								resume.mutate({ id: campaignId, clocks: "restart" })
							}
						>
							Restart the clocks
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>

			<AlertDialog
				open={dialog === "cancel"}
				onOpenChange={(open) => !open && setDialog(null)}
			>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>Cancel this scheduled send</AlertDialogTitle>
						<AlertDialogDescription>
							Nothing goes out and every queued email is dropped. A cancelled
							send does not go back to a draft, so make a copy first if you want
							to send it later.
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel>Keep it scheduled</AlertDialogCancel>
						<AlertDialogAction
							onClick={() => cancel.mutate({ id: campaignId })}
						>
							Cancel the send
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>

			<AlertDialog
				open={dialog === "archive"}
				onOpenChange={(open) => !open && setDialog(null)}
			>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>Archive this campaign</AlertDialogTitle>
						<AlertDialogDescription>
							{inFlight > 0
								? `${inFlight.toLocaleString()} people are still walking it. Letting them finish takes as long as the remaining waits; stopping them now cancels the emails they have not had yet.`
								: "Nobody is inside it. The numbers stay readable afterwards."}
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel>Cancel</AlertDialogCancel>
						{inFlight > 0 ? (
							<Button
								variant="outline"
								onClick={() =>
									archive.mutate({ id: campaignId, mode: "drain" })
								}
							>
								Let them finish
							</Button>
						) : null}
						<AlertDialogAction
							onClick={() => archive.mutate({ id: campaignId, mode: "stop" })}
						>
							{inFlight > 0 ? "Stop everybody now" : "Archive"}
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</>
	);
}
