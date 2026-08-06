"use client";

import { DealStage } from "@crm/db/enums";
import { cn } from "@crm/ui/lib/utils";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { DealStageIndicator } from "@/components/crm/deal-stage";
import { dealStageLabel, isClosedStage, OPEN_STAGES } from "@/lib/deal-stage";
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
								"min-w-0 flex-1 border-t-2 pt-2 text-left text-xs transition-colors disabled:pointer-events-none disabled:opacity-50",
								reached
									? "border-foreground text-foreground"
									: "border-border text-muted-foreground hover:border-muted-foreground hover:text-foreground",
								current && "font-medium",
							)}
						>
							<span className="block truncate">
								{current && option === DealStage.CLOSED_WON ? (
									<DealStageIndicator stage={stage} className="text-xs" />
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
					<div className="min-w-0 flex-1 border-foreground border-t-2 pt-2">
						<DealStageIndicator stage={stage} className="text-xs" />
					</div>
				</li>
			) : null}
		</ol>
	);
}
