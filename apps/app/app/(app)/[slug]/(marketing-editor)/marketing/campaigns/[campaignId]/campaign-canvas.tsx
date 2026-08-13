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
import { Button } from "@crm/ui/components/button";
import {
	ContextMenuContent,
	ContextMenuItem,
	ContextMenuLabel,
	ContextMenuSeparator,
} from "@crm/ui/components/context-menu";
import {
	FlowCanvas,
	type FlowEdge,
	type FlowNode,
} from "@crm/ui/components/flow-canvas";
import { Spinner } from "@crm/ui/components/spinner";
import { ToggleGroup, ToggleGroupItem } from "@crm/ui/components/toggle-group";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { parseAsString, parseAsStringLiteral, useQueryStates } from "nuqs";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { CampaignKind } from "@/components/marketing/campaign-kind";
import { CopilotRail } from "@/components/marketing/copilot-rail";
import { MarketingEditorShell } from "@/components/marketing/editor-shell";
import { useCampaignOptionsInvalidation } from "@/components/marketing/use-marketing-facets";
import {
	ENTRY,
	entryDetail,
	entryLabel,
	entryX,
	NEW_LABEL,
	type Removal,
	withNode,
	withoutNode,
} from "@/lib/campaign-graph";
import { useTRPC } from "@/lib/trpc/client";
import type { RouterOutputs } from "@/lib/trpc/types";
import { useWorkspaceUrl } from "@/lib/use-workspace-url";
import { CampaignStatus } from "../../../../(marketing)/marketing/campaign-status";
import { AudienceSheet } from "./audience-sheet";
import { BlastComposer } from "./blast-composer";
import { CampaignActions } from "./campaign-actions";
import { CampaignEnrolments } from "./campaign-enrolments";
import { CampaignRecipients } from "./campaign-recipients";
import { CampaignResults } from "./campaign-results";
import { CampaignSettings } from "./campaign-settings";
import { LogicSheet } from "./logic-sheet";
import { NodeSheet } from "./node-sheet";

type Campaign = RouterOutputs["marketingCampaigns"]["byId"];
type Stats = Campaign["stats"][number];

const KIND_LABEL: Record<string, string> = {
	BRANCH: "Branch",
	SPLIT: "A/B split",
};

export const CAMPAIGN_VIEWS = [
	"flow",
	"results",
	"recipients",
	"enrolments",
] as const;

const VIEW_LABEL: Record<(typeof CAMPAIGN_VIEWS)[number], string> = {
	flow: "Flow",
	results: "Results",
	recipients: "Recipients",
	enrolments: "Enrolments",
};

function nameOf(node: Campaign["nodes"][number]): string {
	return node.label ?? KIND_LABEL[node.kind] ?? node.kind.toLowerCase();
}

function nodeTypeFor(kind: string): string {
	if (kind === "EMAIL") return "email";
	if (kind === "WAIT") return "wait";
	if (kind === "EXIT") return "exit";
	return "logic";
}

function toFlow(
	campaign: Campaign,
	stats: Map<string, Stats>,
	selectedId: string | null,
): { nodes: FlowNode[]; edges: FlowEdge[] } {
	const nodes: FlowNode[] = campaign.nodes.map((node) => {
		const numbers = stats.get(node.id);

		return {
			id: node.id,
			type: nodeTypeFor(node.kind),
			position: { x: node.x, y: node.y },
			selected: node.id === selectedId,
			draggable: true,
			data:
				node.kind === "EMAIL"
					? {
							label: node.label ?? "Email",
							subject: node.subject ?? "",
							stats: numbers
								? {
										sent: numbers.sent,
										opened: numbers.opened,
										clicked: numbers.clicked,
										replied: numbers.replied,
									}
								: null,
						}
					: node.kind === "WAIT"
						? {
								label: node.delayHours
									? `Wait ${Math.round(node.delayHours / 24) || node.delayHours} ${
											node.delayHours >= 24 ? "days" : "hours"
										}`
									: "Wait",
							}
						: node.kind === "EXIT"
							? { label: node.label ?? "Exit" }
							: {
									kind: KIND_LABEL[node.kind] ?? node.kind,
									label: node.label ?? "",
								},
		};
	});

	const edges: FlowEdge[] = campaign.edges.map((edge) => {
		const waiting = stats.get(edge.toId)?.waiting ?? 0;

		const named =
			edge.label ??
			(edge.handle === "yes"
				? "Yes"
				: edge.handle === "no"
					? "No"
					: edge.weight !== 100
						? `${edge.weight}%`
						: null);

		const inFlight = waiting > 0 ? `${waiting.toLocaleString()} here` : null;

		return {
			id: edge.id,
			source: edge.fromId,
			target: edge.toId,
			sourceHandle: edge.handle === "next" ? null : edge.handle,
			type: "smoothstep",
			label: [named, inFlight].filter(Boolean).join(" · ") || undefined,
		};
	});

	const targeted = new Set(campaign.edges.map((edge) => edge.toId));
	const root = campaign.nodes.find((node) => !targeted.has(node.id));

	if (root) {
		const included = campaign.segments.filter(
			(link) => link.mode === "INCLUDE",
		);
		const chosen = included.length > 0 || Boolean(campaign.entryDefinition);

		nodes.unshift({
			id: ENTRY.id,
			type: "entry",
			position: { x: entryX(root), y: root.y - ENTRY.gapY },
			draggable: false,
			selected: selectedId === ENTRY.id,
			data: {
				label: entryLabel(
					included.map((link) => link.name).join(", ") || null,
					Boolean(campaign.entryDefinition),
				),
				detail: entryDetail({
					automatic: campaign.entryMode === "CONTINUOUS",
					chosen,
					held: campaign.segments.length - included.length,
					hasExitRule: Boolean(campaign.exitDefinition),
				}),
			},
		});

		edges.unshift({
			id: `${ENTRY.id}-edge`,
			source: ENTRY.id,
			target: root.id,
			type: "smoothstep",
			label:
				campaign.enrolled > 0
					? `${campaign.enrolled.toLocaleString()} entered`
					: undefined,
		});
	}

	return { nodes, edges };
}

const canvasParams = {
	node: parseAsString,
	view: parseAsStringLiteral(CAMPAIGN_VIEWS).withDefault("flow"),
	thread: parseAsString,
};

export function CampaignCanvas({ campaignId }: { campaignId: string }) {
	const trpc = useTRPC();
	const queryClient = useQueryClient();
	const workspaceUrl = useWorkspaceUrl();
	const invalidateCampaignOptions = useCampaignOptionsInvalidation();
	const [{ node: selectedId, view }, setParams] = useQueryStates(canvasParams);
	const [targetId, setTargetId] = useState<string | null>(null);
	const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

	const setSelectedId = (next: string | null) => {
		if (next === selectedId) return;
		void setParams(
			{ node: next, thread: null },
			{ history: selectedId === null && next !== null ? "push" : "replace" },
		);
	};

	const setView = (next: (typeof CAMPAIGN_VIEWS)[number]) => {
		if (next === view) return;
		void setParams(
			selectedId === null ? { view: next } : { view: next, thread: null },
		);
	};

	const campaign = useQuery(
		trpc.marketingCampaigns.byId.queryOptions({ id: campaignId }),
	);

	const invalidate = () =>
		queryClient.invalidateQueries({
			queryKey: trpc.marketingCampaigns.byId.queryKey({ id: campaignId }),
		});

	const moveNode = useMutation(
		trpc.marketingCampaigns.updateNode.mutationOptions({
			onSuccess: () => invalidate(),
		}),
	);

	const rename = useMutation(
		trpc.marketingCampaigns.update.mutationOptions({
			onSuccess: () => {
				void invalidate();
				void invalidateCampaignOptions();
			},
			onError: (error) => toast.error(error.message),
		}),
	);

	const addNode = useMutation(
		trpc.marketingCampaigns.writeGraph.mutationOptions({
			onSuccess: (result) => {
				if (!result.ok) {
					toast.error(
						result.problems[0]?.message ?? "That step cannot be added.",
					);
					return;
				}
				void invalidate();
			},
			onError: (error) => toast.error(error.message),
		}),
	);

	const activate = useMutation(
		trpc.marketingCampaigns.activate.mutationOptions({
			onSuccess: () => {
				toast.success(
					"The sequence is live. People start entering on the next tick.",
				);
				void invalidate();
			},
			onError: (error) => toast.error(error.message),
		}),
	);

	const data = campaign.data;

	const stats = useMemo(
		() => new Map((data?.stats ?? []).map((row) => [row.nodeId, row])),
		[data?.stats],
	);

	const flow = useMemo(
		() => (data ? toFlow(data, stats, selectedId) : { nodes: [], edges: [] }),
		[data, stats, selectedId],
	);

	if (campaign.isPending) {
		return (
			<div className="flex min-h-0 flex-1 items-center justify-center">
				<Spinner />
			</div>
		);
	}

	if (!data) {
		return (
			<div className="flex min-h-0 flex-1 items-center justify-center text-muted-foreground text-xs">
				That campaign is gone.
			</div>
		);
	}

	if (data.kind === "BLAST") {
		return (
			<BlastComposer
				campaign={data}
				view={view}
				onViewChange={(next) => setView(next)}
				onChanged={() => void invalidate()}
			/>
		);
	}

	const selected = data.nodes.find((node) => node.id === selectedId) ?? null;
	const target = data.nodes.find((node) => node.id === targetId) ?? null;
	const removal = target ? withoutNode(data, target.id) : null;
	const activatable = data.kind === "DRIP" && data.status === "DRAFT";

	const removeStep = (change: Removal) =>
		addNode.mutate(
			{ campaignId, ...change },
			{
				onSuccess: (result) => {
					if (!result.ok) return;
					setTargetId(null);
					if (selectedId === null || selectedId === ENTRY.id) return;
					const survives = change.nodes.some((node) => node.id === selectedId);
					if (!survives) setSelectedId(null);
				},
			},
		);

	return (
		<MarketingEditorShell
			backHref={workspaceUrl("/marketing/campaigns")}
			backLabel="Campaigns"
			name={data.name}
			onNameChange={(next) => rename.mutate({ id: campaignId, name: next })}
			badges={
				<>
					<CampaignKind
						campaignId={campaignId}
						kind={data.kind === "DRIP" ? "DRIP" : "BLAST"}
						editable={data.status === "DRAFT"}
						onChanged={() => void invalidate()}
					/>
					<span className="shrink-0 text-xs">
						<CampaignStatus status={data.status} />
					</span>
				</>
			}
			actions={
				<>
					{activatable ? (
						<Button
							size="sm"
							disabled={activate.isPending}
							onClick={() => activate.mutate({ id: campaignId })}
						>
							{activate.isPending ? <Spinner /> : null}
							Activate
						</Button>
					) : null}

					<CampaignSettings
						campaignId={campaignId}
						kind="DRIP"
						fromName={data.fromName}
						replyTo={data.replyTo}
						cooldownDays={data.reentryCooldownDays}
						maxPasses={data.maxPasses}
						onChanged={() => void invalidate()}
					/>

					<CampaignActions
						campaignId={campaignId}
						status={data.status}
						inFlight={data.inFlight}
						onChanged={() => void invalidate()}
					/>
				</>
			}
			tabs={
				<ToggleGroup
					type="single"
					size="sm"
					value={view}
					onValueChange={(next) => {
						const chosen = CAMPAIGN_VIEWS.find((option) => option === next);
						setView(chosen ?? "flow");
					}}
				>
					{CAMPAIGN_VIEWS.map((option) => (
						<ToggleGroupItem key={option} value={option}>
							{VIEW_LABEL[option]}
						</ToggleGroupItem>
					))}
				</ToggleGroup>
			}
			rail={
				view !== "flow" ? (
					<CopilotRail
						record={{ kind: "campaign", id: campaignId, campaignKind: "DRIP" }}
						onFinish={() => void invalidate()}
					/>
				) : selectedId === ENTRY.id ? (
					<AudienceSheet
						campaign={data}
						onClose={() => setSelectedId(null)}
						onChanged={() => void invalidate()}
					/>
				) : selected && selected.kind !== "EMAIL" ? (
					<LogicSheet
						key={`${selected.id}:${selected.delayHours ?? ""}`}
						node={selected}
						campaign={data}
						stats={stats}
						onClose={() => setSelectedId(null)}
						onChanged={() => void invalidate()}
					/>
				) : selected ? (
					<>
						<NodeSheet
							node={selected}
							campaignId={campaignId}
							recipients={data.inFlight}
							stats={stats.get(selected.id) ?? null}
							onClose={() => setSelectedId(null)}
							onSaved={() => invalidate()}
						/>
						<CopilotRail
							key={selected.id}
							record={{
								kind: "campaign",
								id: campaignId,
								nodeId: selected.id,
								campaignKind: "DRIP",
							}}
							onFinish={() => void invalidate()}
						/>
					</>
				) : (
					<CopilotRail
						record={{ kind: "campaign", id: campaignId, campaignKind: "DRIP" }}
						onFinish={() => {
							void queryClient.invalidateQueries({
								queryKey: trpc.marketingCampaigns.byId.queryKey({
									id: campaignId,
								}),
							});
						}}
					/>
				)
			}
		>
			{view === "results" ? (
				<CampaignResults campaign={data} />
			) : view === "recipients" ? (
				<CampaignRecipients campaignId={campaignId} />
			) : view === "enrolments" ? (
				<CampaignEnrolments campaignId={campaignId} />
			) : (
				<div className="relative flex min-h-0 min-w-0 flex-1">
					<FlowCanvas
						menu={
							<ContextMenuContent>
								<ContextMenuLabel>
									{target ? `Add after ${nameOf(target)}` : "Add a step"}
								</ContextMenuLabel>
								{(["EMAIL", "WAIT", "BRANCH", "EXIT"] as const).map((kind) => (
									<ContextMenuItem
										key={kind}
										disabled={addNode.isPending}
										onSelect={() =>
											addNode.mutate({
												campaignId,
												...withNode(data, kind, target?.id ?? null),
											})
										}
									>
										{NEW_LABEL[kind]}
									</ContextMenuItem>
								))}

								{target ? (
									<>
										<ContextMenuSeparator />
										<ContextMenuItem
											variant="destructive"
											disabled={addNode.isPending || removal === null}
											onSelect={() => {
												if (!removal) return;
												if (removal.orphaned > 0) {
													setConfirmDelete(target.id);
													return;
												}
												removeStep(removal);
											}}
										>
											{removal === null
												? "A campaign keeps one step"
												: `Delete ${nameOf(target)}`}
										</ContextMenuItem>
									</>
								) : null}
							</ContextMenuContent>
						}
						nodes={flow.nodes}
						edges={flow.edges}
						selectedId={selectedId}
						fitKey={`${data.nodes.length}-${data.edges.length}`}
						onNodeClick={(_event, node) => setSelectedId(node.id)}
						onNodeContextMenu={(_event, node) =>
							setTargetId(node.id === ENTRY.id ? null : node.id)
						}
						onPaneClick={() => setSelectedId(null)}
						onPaneContextMenu={() => setTargetId(null)}
						onNodeMoved={(id, position) =>
							moveNode.mutate({ nodeId: id, x: position.x, y: position.y })
						}
					/>

					<AlertDialog
						open={confirmDelete !== null}
						onOpenChange={(open) => !open && setConfirmDelete(null)}
					>
						<AlertDialogContent>
							<AlertDialogHeader>
								<AlertDialogTitle>
									Delete {target ? nameOf(target) : "this step"}
								</AlertDialogTitle>
								<AlertDialogDescription>
									{removal?.orphaned ?? 0} step
									{removal?.orphaned === 1 ? "" : "s"} below it can only be
									reached through it, so they go too. Anybody already past this
									point stays where they are.
								</AlertDialogDescription>
							</AlertDialogHeader>
							<AlertDialogFooter>
								<AlertDialogCancel>Cancel</AlertDialogCancel>
								<AlertDialogAction
									onClick={() => {
										if (removal && confirmDelete) removeStep(removal);
										setConfirmDelete(null);
									}}
								>
									Delete them
								</AlertDialogAction>
							</AlertDialogFooter>
						</AlertDialogContent>
					</AlertDialog>
				</div>
			)}
		</MarketingEditorShell>
	);
}
