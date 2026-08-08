"use client";

import { Badge } from "@crm/ui/components/badge";
import { Skeleton } from "@crm/ui/components/skeleton";
import { formatMoney } from "@crm/ui/lib/format";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { DEAL_STAGE_OPTIONS } from "@/lib/deal-stage";
import { useTRPC } from "@/lib/trpc/client";

type DealRow = {
	id: string;
	name: string;
	stage: string;
	amountCents: number | null;
	baseAmountCents: number | null;
	currency: string;
	company: {
		id: string;
		name: string;
		iconUrl: string | null;
		logoUrl: string | null;
	} | null;
	owner: { id: string; name: string; image: string | null } | null;
	expectedCloseDate: string | null;
	tags: string[];
};

const STAGE_ORDER = DEAL_STAGE_OPTIONS.map((s) => s.value);

export function DealsBoard() {
	const trpc = useTRPC();
	const queryClient = useQueryClient();
	const { data, isLoading } = useQuery(
		trpc.deals.board.queryOptions({ owner: "all", clientAccountId: "all" }),
	);
	const [dragging, setDragging] = useState<string | null>(null);

	const reorder = useMutation(
		trpc.deals.reorder.mutationOptions({
			onSuccess: async () => {
				await queryClient.invalidateQueries({
					queryKey: trpc.deals.board.queryKey(),
				});
				await queryClient.invalidateQueries({
					queryKey: trpc.deals.list.queryKey(),
				});
			},
			onError: (err) => toast.error(err.message),
		}),
	);

	if (isLoading || !data) {
		return (
			<div className="grid grid-cols-1 gap-3 md:grid-cols-3 xl:grid-cols-5">
				{["a", "b", "c", "d", "e"].map((k) => (
					<Skeleton key={k} className="h-96" />
				))}
			</div>
		);
	}

	return (
		<div className="flex h-full min-h-0 gap-3 overflow-x-auto pb-2">
			{STAGE_ORDER.map((stage) => {
				const col = data.columns[stage] ?? {
					stage,
					total: 0,
					valueCents: 0,
					deals: [],
				};
				const stageLabel =
					DEAL_STAGE_OPTIONS.find((s) => s.value === stage)?.label ?? stage;
				return (
					// biome-ignore lint/a11y/noStaticElementInteractions: kanban column is a drop target only, not interactive control
					<div
						key={stage}
						onDragOver={(e) => e.preventDefault()}
						onDrop={(e) => {
							e.preventDefault();
							const id = e.dataTransfer.getData("text/deal-id");
							if (!id) return;
							reorder.mutate({
								id,
								stage: stage as
									| "DEMO_BOOKED"
									| "QUALIFIED_TO_BUY"
									| "UNQUALIFIED_TO_BUY"
									| "DECISION_MAKER_BOUGHT_IN"
									| "CONTRACT_SENT"
									| "CLOSED_WON"
									| "CLOSED_LOST",
								orderInStage: col.deals.length,
							});
						}}
						className="flex w-72 shrink-0 flex-col rounded-lg border bg-muted/30"
					>
						<header className="flex items-baseline justify-between border-b px-3 py-2">
							<div>
								<div className="text-sm font-medium">{stageLabel}</div>
								<div className="text-xs text-muted-foreground">
									{col.total} deal{col.total === 1 ? "" : "s"}
								</div>
							</div>
							<div className="text-xs font-medium tabular-nums text-muted-foreground">
								{col.valueCents !== null && col.valueCents > 0
									? formatMoney(col.valueCents, data.reportingCurrency)
									: ""}
							</div>
						</header>
						<div className="flex flex-1 flex-col gap-2 overflow-y-auto p-2">
							{col.deals.map((deal) => (
								<DealCard
									key={deal.id}
									deal={deal}
									dragging={dragging === deal.id}
									onDragStart={() => setDragging(deal.id)}
									onDragEnd={() => setDragging(null)}
								/>
							))}
							{col.deals.length === 0 && (
								<div className="mt-6 text-center text-xs text-muted-foreground">
									Drop here
								</div>
							)}
						</div>
					</div>
				);
			})}
		</div>
	);
}

function DealCard({
	deal,
	dragging,
	onDragStart,
	onDragEnd,
}: {
	deal: DealRow;
	dragging: boolean;
	onDragStart: () => void;
	onDragEnd: () => void;
}) {
	return (
		<button
			type="button"
			draggable
			onDragStart={(e) => {
				e.dataTransfer.setData("text/deal-id", deal.id);
				e.dataTransfer.effectAllowed = "move";
				onDragStart();
			}}
			onDragEnd={onDragEnd}
			className={`cursor-grab rounded-md border bg-card p-3 text-left shadow-sm transition-all hover:border-primary/40 hover:shadow-md ${
				dragging ? "opacity-50" : ""
			}`}
		>
			<div className="line-clamp-2 text-sm font-medium">{deal.name}</div>
			{deal.company && (
				<div className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
					{deal.company.iconUrl && (
						// biome-ignore lint/performance/noImgElement: brand icon URLs vary
						<img src={deal.company.iconUrl} alt="" className="size-4 rounded" />
					)}
					<span className="truncate">{deal.company.name}</span>
				</div>
			)}
			<div className="mt-2 flex items-baseline justify-between">
				<span className="text-sm font-semibold tabular-nums">
					{deal.amountCents !== null
						? formatMoney(deal.amountCents, deal.currency)
						: "—"}
				</span>
				{deal.owner && (
					<div className="flex items-center gap-1">
						{deal.owner.image ? (
							// biome-ignore lint/performance/noImgElement: rep avatar URLs vary
							<img
								src={deal.owner.image}
								alt=""
								className="size-5 rounded-full"
							/>
						) : (
							<div className="flex size-5 items-center justify-center rounded-full bg-muted text-[10px] font-medium">
								{deal.owner.name.charAt(0)}
							</div>
						)}
					</div>
				)}
			</div>
			{deal.tags.length > 0 && (
				<div className="mt-2 flex flex-wrap gap-1">
					{deal.tags.slice(0, 3).map((tag) => (
						<Badge key={tag} className="text-[10px]">
							{tag}
						</Badge>
					))}
				</div>
			)}
		</button>
	);
}
