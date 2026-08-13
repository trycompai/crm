"use client";

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
import { ToggleGroup, ToggleGroupItem } from "@crm/ui/components/toggle-group";
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { useTRPC } from "@/lib/trpc/client";

export function CampaignKind({
	campaignId,
	kind,
	editable,
	dirty = false,
	onChanged,
}: {
	campaignId: string;
	kind: "BLAST" | "DRIP";
	editable: boolean;
	dirty?: boolean;
	onChanged: () => void;
}) {
	const trpc = useTRPC();
	const [confirming, setConfirming] = useState<"BLAST" | "DRIP" | null>(null);

	const setKind = useMutation(
		trpc.marketingCampaigns.setKind.mutationOptions({
			onSuccess: () => onChanged(),
			onError: (error) => toast.error(error.message),
		}),
	);

	if (!editable) {
		return (
			<span className="shrink-0 rounded-sm border px-1.5 py-px text-muted-foreground text-xs">
				{kind === "DRIP" ? "Sequence" : "Blast"}
			</span>
		);
	}

	return (
		<>
			<ToggleGroup
				type="single"
				size="sm"
				value={kind}
				disabled={setKind.isPending}
				onValueChange={(next) => {
					if (next !== "BLAST" && next !== "DRIP") return;
					if (next === kind) return;
					if (dirty) {
						setConfirming(next);
						return;
					}
					setKind.mutate({ id: campaignId, kind: next });
				}}
			>
				<ToggleGroupItem value="DRIP">Sequence</ToggleGroupItem>
				<ToggleGroupItem value="BLAST">Blast</ToggleGroupItem>
			</ToggleGroup>

			<AlertDialog
				open={confirming !== null}
				onOpenChange={(open) => !open && setConfirming(null)}
			>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>Discard your unsaved edits?</AlertDialogTitle>
						<AlertDialogDescription>
							This email has edits you have not saved. Switching reloads the
							campaign and throws them away.
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel>Keep editing</AlertDialogCancel>
						<AlertDialogAction
							onClick={() => {
								if (confirming) {
									setKind.mutate({ id: campaignId, kind: confirming });
								}
								setConfirming(null);
							}}
						>
							Discard and switch
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</>
	);
}
