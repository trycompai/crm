"use client";

import { DealStage } from "@crm/db/enums";
import { IndicatorDot } from "@crm/ui/components/status-indicator";
import { cn } from "@crm/ui/lib/utils";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import {
	dealStageLabel,
	dealStagePresentation,
	isClosedStage,
	OPEN_STAGES,
} from "@/lib/deal-stage";
import { useCrmCache } from "@/lib/trpc/cache";
import { useTRPC } from "@/lib/trpc/client";

const RAIL = [...OPEN_STAGES, DealStage.CLOSED_WON] as readonly DealStage[];

export function StageStepper({
	dealId,
	stage,
}: {
	dealId: string;
	stage: DealStage;
}) {
	const trpc = useTRPC();
	const cache = useCrmCache();

	const setStage = useMutation(
		trpc.deals.setStage.mutationOptions({
			onSuccess: async (result) => {
				await cache.deal(dealId);
				if (result.changed) toast.success("Stage updated.");
			},
			onError: (error) => toast.error(error.message),
		}),
	);

	const exited = isClosedStage(stage) && stage !== DealStage.CLOSED_WON;
	const steps = exited ? OPEN_STAGES : RAIL;
	const currentIndex = steps.indexOf(stage);

	return (
		<ol className="flex w-full gap-1">
			{steps.map((option, index) => {
				const reached = !exited && index <= currentIndex;
				const current = !exited && option === stage;
				return (
					<li key={option} className="flex min-w-0 flex-1">
						<button
							type="button"
							aria-current={current ? "step" : undefined}
							disabled={setStage.isPending}
							onClick={() => setStage.mutate({ id: dealId, stage: option })}
							className={cn(
								"group/step flex min-w-0 flex-1 flex-col gap-2 rounded-xs text-left text-xs outline-none transition-colors focus-visible:shadow-focus disabled:pointer-events-none disabled:opacity-50",
								reached
									? "text-foreground"
									: "text-muted-foreground hover:text-foreground",
								current && "font-medium",
							)}
						>
							<span
								aria-hidden
								className={cn(
									"h-1.5 rounded-full transition-colors",
									reached
										? "bg-foreground"
										: "bg-foreground/10 group-hover/step:bg-foreground/30",
								)}
							/>
							<span className="text-pretty wrap-break-word leading-4">
								{current && option === DealStage.CLOSED_WON ? (
									<StageOutcome stage={stage} />
								) : (
									dealStageLabel(option)
								)}
							</span>
						</button>
					</li>
				);
			})}

			{exited ? (
				<li className="flex min-w-0 flex-1">
					<div className="flex min-w-0 flex-1 flex-col gap-2 text-xs leading-4">
						<span aria-hidden className="h-1.5 rounded-full bg-foreground" />
						<StageOutcome stage={stage} />
					</div>
				</li>
			) : null}
		</ol>
	);
}

function StageOutcome({ stage }: { stage: DealStage }) {
	const { label, tone } = dealStagePresentation(stage);
	return (
		<span className="flex min-w-0 items-baseline gap-1.5">
			<IndicatorDot tone={tone} aria-hidden="true" className="translate-y-px" />
			<span className="text-pretty wrap-break-word">{label}</span>
		</span>
	);
}
