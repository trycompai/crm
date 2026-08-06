"use client";

import ChevronDown from "@carbon/icons-react/es/ChevronDown";
import type { DealStage } from "@crm/db/enums";
import { Button } from "@crm/ui/components/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@crm/ui/components/dialog";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuRadioGroup,
	DropdownMenuRadioItem,
	DropdownMenuTrigger,
} from "@crm/ui/components/dropdown-menu";
import { Field, FieldLabel } from "@crm/ui/components/field";
import { Icon } from "@crm/ui/components/icon";
import { Spinner } from "@crm/ui/components/spinner";
import { Textarea } from "@crm/ui/components/textarea";
import { useMutation } from "@tanstack/react-query";
import { parseAsString, useQueryStates } from "nuqs";
import { useId, useState } from "react";
import { toast } from "sonner";
import { DEAL_STAGE_OPTIONS, LOSING_STAGES } from "@/lib/deal-stage";
import { useCrmCache } from "@/lib/trpc/cache";
import { useTRPC } from "@/lib/trpc/client";
import { DealStageIndicator } from "./deal-stage";

const closeReasonParams = {
	closing: parseAsString,
	closingStage: parseAsString,
};

function useStageMutation(onDone?: () => void) {
	const trpc = useTRPC();
	const cache = useCrmCache();

	return useMutation(
		trpc.deals.setStage.mutationOptions({
			onSuccess: async (_, variables) => {
				await cache.deal(variables.id);
				onDone?.();
			},
			onError: (error) => toast.error(error.message),
		}),
	);
}

export function DealStageMenu({
	dealId,
	stage,
	variant = "inline",
}: {
	dealId: string;
	stage: DealStage;
	variant?: "inline" | "control";
}) {
	const [, setCloseParams] = useQueryStates(closeReasonParams);
	const setStage = useStageMutation();

	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				{variant === "control" ? (
					<Button
						variant="outline"
						size="sm"
						disabled={setStage.isPending}
						onClick={(event) => event.stopPropagation()}
					>
						<DealStageIndicator stage={stage} className="text-foreground" />
						<Icon icon={ChevronDown} className="text-muted-foreground" />
					</Button>
				) : (
					<button
						type="button"
						onClick={(event) => event.stopPropagation()}
						disabled={setStage.isPending}
						className="flex min-w-0 items-center text-left hover:text-foreground disabled:opacity-50"
					>
						<DealStageIndicator stage={stage} />
					</button>
				)}
			</DropdownMenuTrigger>
			<DropdownMenuContent
				align={variant === "control" ? "end" : "start"}
				className="min-w-52"
				onClick={(event) => event.stopPropagation()}
			>
				<DropdownMenuRadioGroup
					value={stage}
					onValueChange={(next) => {
						const chosen = next as DealStage;
						if (chosen === stage) return;
						if (LOSING_STAGES.includes(chosen)) {
							void setCloseParams({
								closing: dealId,
								closingStage: chosen,
							});
							return;
						}
						setStage.mutate({ id: dealId, stage: chosen });
					}}
				>
					{DEAL_STAGE_OPTIONS.map((option) => (
						<DropdownMenuRadioItem key={option.value} value={option.value}>
							{option.label}
						</DropdownMenuRadioItem>
					))}
				</DropdownMenuRadioGroup>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}

export function CloseReasonDialog() {
	const reasonId = useId();
	const [{ closing, closingStage }, setCloseParams] =
		useQueryStates(closeReasonParams);
	const [reason, setReason] = useState("");

	const close = () => {
		setReason("");
		void setCloseParams({ closing: null, closingStage: null });
	};

	const setStage = useStageMutation(() => {
		toast.success("Deal closed.");
		close();
	});

	const stage = closingStage as DealStage | null;
	const open = Boolean(closing && stage);

	return (
		<Dialog open={open} onOpenChange={(next) => !next && close()}>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>
						{stage === "CLOSED_LOST" ? "Close as lost" : "Mark as unqualified"}
					</DialogTitle>
					<DialogDescription>
						{stage === "CLOSED_LOST"
							? "What did we lose it to? This is the only place that answer gets recorded."
							: "Why is this not a fit? It goes on the timeline so nobody re-runs the same deal."}
					</DialogDescription>
				</DialogHeader>

				<form
					id="close-reason"
					className="px-4"
					onSubmit={(event) => {
						event.preventDefault();
						if (!closing || !stage) return;
						setStage.mutate({ id: closing, stage, closedReason: reason });
					}}
				>
					<Field>
						<FieldLabel htmlFor={reasonId}>Reason</FieldLabel>
						<Textarea
							id={reasonId}
							value={reason}
							onChange={(event) => setReason(event.target.value)}
							placeholder="Went with an incumbent vendor"
							rows={3}
						/>
					</Field>
				</form>

				<DialogFooter>
					<Button
						type="submit"
						form="close-reason"
						disabled={setStage.isPending || reason.trim() === ""}
					>
						{setStage.isPending ? <Spinner /> : null}
						Save
					</Button>
					<Button variant="outline" onClick={close}>
						Cancel
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
