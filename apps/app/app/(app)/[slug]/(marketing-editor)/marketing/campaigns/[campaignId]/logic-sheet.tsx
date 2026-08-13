"use client";

import Close from "@carbon/icons-react/es/Close";
import { Button } from "@crm/ui/components/button";
import { FieldError } from "@crm/ui/components/field";
import { Icon } from "@crm/ui/components/icon";
import { Input } from "@crm/ui/components/input";
import { Label } from "@crm/ui/components/label";
import { RuleTree, type RuleTreeValue } from "@crm/ui/components/rule-tree";
import { Spinner } from "@crm/ui/components/spinner";
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { useMarketingFacets } from "@/components/marketing/use-marketing-facets";
import {
	fromDefinition,
	ruleProblems,
	toDefinition,
} from "@/lib/marketing-facets";
import { useTRPC } from "@/lib/trpc/client";
import type { RouterOutputs } from "@/lib/trpc/types";

type Campaign = RouterOutputs["marketingCampaigns"]["byId"];
type Node = Campaign["nodes"][number];
type Stats = Campaign["stats"][number];

const MIN_PER_ARM = 100;

function rate(part: number, whole: number): number {
	return whole === 0 ? 0 : part / whole;
}

function pct(part: number, whole: number): string {
	return whole === 0 ? "—" : `${(rate(part, whole) * 100).toFixed(1)}%`;
}

function downstream(campaign: Campaign, fromId: string): Set<string> {
	const seen = new Set<string>();
	const queue = [fromId];

	while (queue.length > 0) {
		const id = queue.pop();
		if (!id || seen.has(id)) continue;
		seen.add(id);
		for (const edge of campaign.edges) {
			if (edge.fromId === id) queue.push(edge.toId);
		}
	}

	return seen;
}

export function LogicSheet({
	node,
	campaign,
	stats,
	onClose,
	onChanged,
}: {
	node: Node;
	campaign: Campaign;
	stats: Map<string, Stats>;
	onClose: () => void;
	onChanged: () => void;
}) {
	const trpc = useTRPC();
	const facets = useMarketingFacets();
	const [hours, setHours] = useState(String(node.delayHours ?? 0));
	const [rules, setRules] = useState<RuleTreeValue>(
		fromDefinition(node.condition),
	);

	const condition = toDefinition(rules);
	const usesOpened = rules.rules.some(
		(rule) => rule.facet === "marketing.openedCampaign",
	);
	const problems = ruleProblems(rules);

	const save = useMutation(
		trpc.marketingCampaigns.updateNode.mutationOptions({
			onSuccess: () => {
				toast.success("Saved.");
				onChanged();
			},
			onError: (error) => toast.error(error.message),
		}),
	);

	const declare = useMutation(
		trpc.marketingCampaigns.declareWinner.mutationOptions({
			onSuccess: (result) => {
				toast.success(
					result.stillOnLoser > 0
						? `Everybody new takes the winner. ${result.stillOnLoser.toLocaleString()} already on the other path stay on it.`
						: "Everybody new takes the winner.",
				);
				onChanged();
			},
			onError: (error) => toast.error(error.message),
		}),
	);

	const paths = campaign.edges
		.filter((edge) => edge.fromId === node.id)
		.map((edge) => ({ edge, path: downstream(campaign, edge.toId) }));

	const shared = new Set(
		paths
			.flatMap(({ path }) => [...path])
			.filter((id) => paths.filter(({ path }) => path.has(id)).length > 1),
	);

	const arms = paths.map(({ edge, path }) => {
		const target = campaign.nodes.find(
			(candidate: Node) => candidate.id === edge.toId,
		);

		const totals = [...path]
			.filter((id) => !shared.has(id))
			.reduce(
				(sum, id) => {
					const numbers = stats.get(id);

					return {
						sent: sum.sent + (numbers?.sent ?? 0),
						replied: sum.replied + (numbers?.replied ?? 0),
						clicked: sum.clicked + (numbers?.clicked ?? 0),
					};
				},
				{ sent: 0, replied: 0, clicked: 0 },
			);

		return {
			edgeId: edge.id,
			label: target?.label ?? edge.handle,
			weight: edge.weight,
			...totals,
		};
	});

	const smallest = Math.min(
		...arms.map((arm) => arm.sent),
		Number.MAX_SAFE_INTEGER,
	);
	const ranked = [...arms].sort(
		(a, b) => rate(b.replied, b.sent) - rate(a.replied, a.sent),
	);
	const [best, next] = ranked;

	const enough = arms.length > 1 && smallest >= MIN_PER_ARM;
	const gap =
		best && next
			? rate(best.replied, best.sent) - rate(next.replied, next.sent)
			: 0;
	const conclusive = enough && gap >= 0.01;
	const alreadyCalled =
		arms.some((arm) => arm.weight === 100) && arms.length > 1;

	return (
		<aside className="flex w-[420px] shrink-0 flex-col overflow-hidden border-l bg-background">
			<header className="flex h-13 shrink-0 items-center gap-2 border-b px-4 py-3">
				<span className="font-medium text-xs">
					{node.label ?? (node.kind === "SPLIT" ? "A/B split" : node.kind)}
				</span>
				<span className="rounded-sm border px-1.5 py-px text-muted-foreground text-xs">
					{node.kind === "SPLIT"
						? "A/B split"
						: node.kind === "BRANCH"
							? "Branch"
							: "Wait"}
				</span>
				<div className="flex-1" />
				<Button
					variant="ghost"
					size="icon"
					onClick={onClose}
					aria-label="Close"
				>
					<Icon icon={Close} />
				</Button>
			</header>

			<div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4">
				{node.kind === "WAIT" ? (
					<div className="flex flex-col gap-1.5">
						<Label
							htmlFor="wait-hours"
							className="text-muted-foreground text-xs"
						>
							Wait for
						</Label>
						<div className="flex items-center gap-2">
							<Input
								id="wait-hours"
								type="number"
								value={hours}
								onChange={(event) => setHours(event.target.value)}
							/>
							<span className="shrink-0 text-muted-foreground text-xs">
								hours
							</span>
						</div>
						<Button
							className="mt-2 self-start"
							disabled={save.isPending}
							onClick={() =>
								save.mutate({
									nodeId: node.id,
									delayHours: Number.parseInt(hours, 10) || 0,
								})
							}
						>
							{save.isPending ? <Spinner /> : null}
							Save
						</Button>
					</div>
				) : null}

				{node.kind === "SPLIT" ? (
					<>
						<div className="flex flex-col overflow-clip rounded-lg border">
							{arms.map((arm) => (
								<div
									key={arm.edgeId}
									className="flex flex-col gap-2 border-b p-3 last:border-b-0"
								>
									<div className="flex items-center gap-2">
										<span className="min-w-0 flex-1 truncate font-medium text-xs">
											{arm.label}
										</span>
										<span className="text-muted-foreground text-xs">
											{arm.weight}%
										</span>
									</div>
									<div className="flex items-center gap-3 text-muted-foreground text-xs">
										<span>{arm.sent.toLocaleString()} sent</span>
										<span>{pct(arm.clicked, arm.sent)} click</span>
										<span>{pct(arm.replied, arm.sent)} reply</span>
									</div>
									{conclusive &&
									!alreadyCalled &&
									arm.edgeId === best?.edgeId ? (
										<Button
											size="sm"
											className="self-start"
											disabled={declare.isPending}
											onClick={() =>
												declare.mutate({
													nodeId: node.id,
													winningEdgeId: arm.edgeId,
												})
											}
										>
											{declare.isPending ? <Spinner /> : null}
											Declare this the winner
										</Button>
									) : null}
								</div>
							))}
						</div>

						<p className="text-muted-foreground text-xs">
							{alreadyCalled
								? "A winner is already set. Everybody new takes it; people already on the other path stay there."
								: !enough
									? `Too early — ${smallest.toLocaleString()} on the smallest arm, and ${MIN_PER_ARM} is the floor before a difference means anything.`
									: conclusive
										? `${best?.label} leads on reply rate. Declaring a winner sends everybody new down it and leaves everybody part-way through where they are.`
										: "Enough people, but the arms are inside the noise. Leave it running."}
						</p>

						<p className="text-muted-foreground text-xs">
							Every email on the arm counts, not only its first step, so an arm
							that opens with a wait or a branch still gets a number. Judged on
							reply rate, then clicks. Never on opens — Apple opens every email
							before a person does, so an open-rate winner is a winner on which
							arm reached more iPhones.
						</p>
					</>
				) : null}

				{node.kind === "BRANCH" ? (
					<div className="flex flex-col gap-3">
						<Label className="text-muted-foreground text-xs">
							Take the yes arm when
						</Label>

						<RuleTree value={rules} facets={facets} onChange={setRules} />

						<FieldError errors={problems} />

						{usesOpened ? (
							<FieldError>
								Apple Mail opens every email before a person does, so this
								branch routes people on a fact about their mail client. Branch
								on a click, a reply or something in the CRM instead.
							</FieldError>
						) : null}

						<p className="text-muted-foreground text-xs">
							Anybody the rule does not match takes the no arm. Changing this
							changes where people go next; it never moves somebody who has
							already passed through.
						</p>

						<Button
							className="self-start"
							disabled={
								save.isPending || condition === null || problems.length > 0
							}
							onClick={() => save.mutate({ nodeId: node.id, condition })}
						>
							{save.isPending ? <Spinner /> : null}
							Save
						</Button>
					</div>
				) : null}
			</div>
		</aside>
	);
}
