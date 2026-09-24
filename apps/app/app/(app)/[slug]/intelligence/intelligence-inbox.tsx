"use client";

import Launch from "@carbon/icons-react/es/Launch";
import Renew from "@carbon/icons-react/es/Renew";
import Search from "@carbon/icons-react/es/Search";
import { Badge } from "@crm/ui/components/badge";
import { Button } from "@crm/ui/components/button";
import { Icon } from "@crm/ui/components/icon";
import { Input } from "@crm/ui/components/input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@crm/ui/components/select";
import {
	Sheet,
	SheetContent,
	SheetDescription,
	SheetHeader,
	SheetTitle,
} from "@crm/ui/components/sheet";
import { Spinner } from "@crm/ui/components/spinner";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { LocalRelativeTime } from "@/components/local-date-time";
import { useTRPC } from "@/lib/trpc/client";
import type { RouterOutputs } from "@/lib/trpc/types";

type SignalRow = RouterOutputs["ingest"]["inbox"]["rows"][number];
type InboxStatus = "all" | "unresolved" | "mapped";

type ScoreComponents = {
	icpMatch: number;
	commercialTrigger: number;
	projectRelevance: number;
	companyValue: number;
	location: number;
	decisionMaker: number;
	recency: number;
};

const EMPTY_SCORE: ScoreComponents = {
	icpMatch: 0,
	commercialTrigger: 0,
	projectRelevance: 0,
	companyValue: 0,
	location: 0,
	decisionMaker: 0,
	recency: 0,
};

export function IntelligenceInbox({
	initialInput,
}: {
	initialInput: { status: "unresolved"; limit: number };
}) {
	const trpc = useTRPC();
	const [project, setProject] = useState("all");
	const [status, setStatus] = useState<InboxStatus>(initialInput.status);
	const [minScore, setMinScore] = useState("0");
	const [selected, setSelected] = useState<SignalRow | null>(null);

	const input = useMemo(
		() => ({
			status,
			limit: initialInput.limit,
			project: project === "all" ? undefined : project,
			minScore: Number(minScore) > 0 ? Number(minScore) : undefined,
		}),
		[status, initialInput.limit, project, minScore],
	);

	const signals = useQuery({
		...trpc.ingest.inbox.queryOptions(input),
		placeholderData: (previous) => previous,
	});

	const rows = signals.data?.rows ?? [];
	const projects = useMemo(
		() => [...new Set(rows.map((row) => row.project))].sort(),
		[rows],
	);

	return (
		<>
			<div className="flex flex-col gap-3 rounded-lg border bg-card p-3 md:flex-row md:items-center">
				<div className="flex min-w-0 flex-1 items-center gap-2 text-sm text-muted-foreground">
					<Icon icon={Search} />
					<span>{signals.data?.count ?? 0} signals in this view</span>
				</div>
				<div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
					<Select
						value={status}
						onValueChange={(value) => setStatus(value as InboxStatus)}
					>
						<SelectTrigger className="w-full sm:w-40">
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							<SelectItem value="unresolved">Unresolved</SelectItem>
							<SelectItem value="mapped">Resolved</SelectItem>
							<SelectItem value="all">All signals</SelectItem>
						</SelectContent>
					</Select>
					<Select value={project} onValueChange={setProject}>
						<SelectTrigger className="w-full sm:w-48">
							<SelectValue placeholder="Project" />
						</SelectTrigger>
						<SelectContent>
							<SelectItem value="all">All projects</SelectItem>
							{projects.map((value) => (
								<SelectItem key={value} value={value}>
									{value}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
					<Select value={minScore} onValueChange={setMinScore}>
						<SelectTrigger className="w-full sm:w-36">
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							<SelectItem value="0">Any score</SelectItem>
							<SelectItem value="50">50+ research</SelectItem>
							<SelectItem value="70">70+ qualified</SelectItem>
							<SelectItem value="85">85+ priority</SelectItem>
						</SelectContent>
					</Select>
					<Button
						variant="outline"
						size="icon"
						onClick={() => void signals.refetch()}
						aria-label="Refresh signals"
					>
						<Icon icon={Renew} />
					</Button>
				</div>
			</div>

			<div className="min-h-0 overflow-auto rounded-lg border bg-card">
				<table className="w-full min-w-[900px] text-sm">
					<thead className="sticky top-0 z-10 bg-muted/95 text-left text-xs text-muted-foreground backdrop-blur">
						<tr>
							<th className="px-4 py-3 font-medium">Signal</th>
							<th className="px-3 py-3 font-medium">Project</th>
							<th className="px-3 py-3 font-medium">Source</th>
							<th className="px-3 py-3 font-medium">Score</th>
							<th className="px-3 py-3 font-medium">Company</th>
							<th className="px-3 py-3 font-medium">Observed</th>
							<th className="px-4 py-3 text-right font-medium">Action</th>
						</tr>
					</thead>
					<tbody className="divide-y">
						{rows.map((row) => (
							<tr key={row.sourceRecordId} className="hover:bg-muted/40">
								<td className="max-w-[340px] px-4 py-3">
									<div className="truncate font-medium">
										{row.subject ?? row.entity ?? row.sourceId}
									</div>
									{row.demandTrigger ? (
										<div className="mt-1 truncate text-xs text-muted-foreground">
											{row.demandTrigger}
										</div>
									) : null}
								</td>
								<td className="px-3 py-3">
									<Badge variant="outline">{row.project}</Badge>
								</td>
								<td className="px-3 py-3 text-muted-foreground">
									{row.source}
								</td>
								<td className="px-3 py-3">
									<ScoreBadge score={row.signalScore} />
								</td>
								<td className="max-w-[220px] px-3 py-3">
									<div className="truncate">
										{row.company ?? row.entity ?? "Unresolved"}
									</div>
									<div className="mt-1">
										<Badge variant={row.mapped ? "secondary" : "outline"}>
											{row.mapped ? "Resolved" : "Needs match"}
										</Badge>
									</div>
								</td>
								<td className="px-3 py-3 text-muted-foreground">
									<LocalRelativeTime date={row.observedAt} />
								</td>
								<td className="px-4 py-3 text-right">
									<Button
										size="sm"
										variant="outline"
										onClick={() => setSelected(row)}
									>
										Review
									</Button>
								</td>
							</tr>
						))}
						{rows.length === 0 ? (
							<tr>
								<td
									colSpan={7}
									className="px-4 py-12 text-center text-muted-foreground"
								>
									No signals match this view.
								</td>
							</tr>
						) : null}
					</tbody>
				</table>
			</div>

			<SignalReviewSheet
				row={selected}
				onClose={() => setSelected(null)}
				onChanged={async () => {
					await signals.refetch();
				}}
			/>
		</>
	);
}

function SignalReviewSheet({
	row,
	onClose,
	onChanged,
}: {
	row: SignalRow | null;
	onClose: () => void;
	onChanged: () => Promise<void>;
}) {
	const trpc = useTRPC();
	const [score, setScore] = useState<ScoreComponents>(EMPTY_SCORE);
	const [ownerId, setOwnerId] = useState("unassigned");

	const candidates = useQuery({
		...trpc.ingest.companyCandidates.queryOptions({
			sourceRecordId: row?.sourceRecordId ?? "",
		}),
		enabled: Boolean(row),
	});
	const users = useQuery(trpc.users.list.queryOptions());

	const refresh = async () => {
		await Promise.all([onChanged(), candidates.refetch()]);
	};

	const resolve = useMutation(
		trpc.ingest.resolveCompany.mutationOptions({
			onSuccess: async (result) => {
				toast.success(
					`${result.companyName} resolved${result.researchQueued ? " and queued for research" : ""}.`,
				);
				await refresh();
			},
			onError: (error) => toast.error(error.message),
		}),
	);
	const qualify = useMutation(
		trpc.ingest.qualify.mutationOptions({
			onSuccess: async (result) => {
				toast.success(
					`Signal scored ${result.score}/100 — ${result.classification}.`,
				);
				await refresh();
			},
			onError: (error) => toast.error(error.message),
		}),
	);
	const promote = useMutation(
		trpc.ingest.promote.mutationOptions({
			onSuccess: async (result) => {
				toast.success(
					result.createdDeal
						? "Opportunity and visible deal created."
						: "Canonical opportunity created.",
				);
				await refresh();
			},
			onError: (error) => toast.error(error.message),
		}),
	);
	const research = useMutation(
		trpc.companies.enrich.mutationOptions({
			onSuccess: (result) =>
				toast.success(
					result.queued
						? "Company research queued."
						: "Research is already queued.",
				),
			onError: (error) => toast.error(error.message),
		}),
	);

	if (!row) return null;
	const mappedCompanyId = candidates.data?.mappedCompanyId ?? null;
	const pending =
		resolve.isPending ||
		qualify.isPending ||
		promote.isPending ||
		research.isPending;

	return (
		<Sheet
			open={Boolean(row)}
			onOpenChange={(open) => {
				if (!open) onClose();
			}}
		>
			<SheetContent side="right" className="w-full overflow-y-auto sm:max-w-xl">
				<SheetHeader>
					<SheetTitle>
						{row.subject ?? row.entity ?? "Signal review"}
					</SheetTitle>
					<SheetDescription>
						{row.project} · {row.source} · {row.sourceType}
					</SheetDescription>
				</SheetHeader>

				<div className="flex flex-col gap-6 px-4 pb-6">
					<section className="space-y-3 rounded-lg border p-4">
						<div className="flex items-center justify-between gap-3">
							<div>
								<div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
									Current score
								</div>
								<div className="mt-1">
									<ScoreBadge score={row.signalScore} />
								</div>
							</div>
							<Badge variant={row.mapped ? "secondary" : "outline"}>
								{row.mapped ? "Company resolved" : "Company unresolved"}
							</Badge>
						</div>
						{row.demandTrigger ? (
							<Info label="Commercial trigger" value={row.demandTrigger} />
						) : null}
						{row.nextAction ? (
							<Info label="Suggested next action" value={row.nextAction} />
						) : null}
						{row.sourceUrl ? (
							<Button asChild variant="outline" size="sm">
								<a href={row.sourceUrl} target="_blank" rel="noreferrer">
									<Icon icon={Launch} data-icon="inline-start" />
									Open source
								</a>
							</Button>
						) : null}
					</section>

					<section className="space-y-3">
						<div>
							<h3 className="font-medium">1. Resolve company</h3>
							<p className="text-sm text-muted-foreground">
								Match this signal to one existing account before research or
								opportunity promotion.
							</p>
						</div>
						{candidates.isLoading ? <Spinner /> : null}
						{mappedCompanyId ? (
							<div className="flex items-center justify-between rounded-lg border p-3">
								<span className="text-sm">Mapped to Comp company</span>
								<Button
									size="sm"
									variant="outline"
									disabled={research.isPending}
									onClick={() => research.mutate({ id: mappedCompanyId })}
								>
									{research.isPending ? <Spinner /> : null}Research
								</Button>
							</div>
						) : (
							<div className="space-y-2">
								{(candidates.data?.candidates ?? [])
									.slice(0, 5)
									.map((candidate) => (
										<div
											key={candidate.companyId}
											className="flex items-center justify-between gap-3 rounded-lg border p-3"
										>
											<div className="min-w-0">
												<div className="truncate font-medium">
													{candidate.name}
												</div>
												<div className="mt-1 text-xs text-muted-foreground">
													{candidate.domain ?? "No domain"} · match{" "}
													{candidate.score}
												</div>
											</div>
											<Button
												size="sm"
												disabled={resolve.isPending}
												onClick={() =>
													resolve.mutate({
														sourceRecordId: row.sourceRecordId,
														companyId: candidate.companyId,
														queueResearch: true,
														createIfMissing: false,
													})
												}
											>
												Resolve
											</Button>
										</div>
									))}
								{(candidates.data?.candidates ?? []).length === 0 ? (
									<div className="rounded-lg border border-dashed p-3 text-sm text-muted-foreground">
										No existing company candidate found. Create only after
										verifying the entity name.
									</div>
								) : null}
								<Button
									variant="outline"
									disabled={resolve.isPending || !(row.company ?? row.entity)}
									onClick={() =>
										resolve.mutate({
											sourceRecordId: row.sourceRecordId,
											companyName: row.company ?? row.entity,
											createIfMissing: true,
											queueResearch: true,
										})
									}
								>
									Create verified company
								</Button>
							</div>
						)}
					</section>

					<section className="space-y-3">
						<div>
							<h3 className="font-medium">2. Qualify signal</h3>
							<p className="text-sm text-muted-foreground">
								Use the transparent 100-point commercial score.
							</p>
						</div>
						<div className="grid grid-cols-2 gap-3">
							<ScoreInput
								label="ICP match"
								value={score.icpMatch}
								max={25}
								onChange={(value) =>
									setScore((s) => ({ ...s, icpMatch: value }))
								}
							/>
							<ScoreInput
								label="Commercial trigger"
								value={score.commercialTrigger}
								max={20}
								onChange={(value) =>
									setScore((s) => ({ ...s, commercialTrigger: value }))
								}
							/>
							<ScoreInput
								label="Project relevance"
								value={score.projectRelevance}
								max={20}
								onChange={(value) =>
									setScore((s) => ({ ...s, projectRelevance: value }))
								}
							/>
							<ScoreInput
								label="Company value"
								value={score.companyValue}
								max={10}
								onChange={(value) =>
									setScore((s) => ({ ...s, companyValue: value }))
								}
							/>
							<ScoreInput
								label="Location"
								value={score.location}
								max={10}
								onChange={(value) =>
									setScore((s) => ({ ...s, location: value }))
								}
							/>
							<ScoreInput
								label="Decision maker"
								value={score.decisionMaker}
								max={10}
								onChange={(value) =>
									setScore((s) => ({ ...s, decisionMaker: value }))
								}
							/>
							<ScoreInput
								label="Recency"
								value={score.recency}
								max={5}
								onChange={(value) =>
									setScore((s) => ({ ...s, recency: value }))
								}
							/>
							<div className="flex items-end">
								<div className="w-full rounded-md bg-muted px-3 py-2 text-sm">
									<span className="text-muted-foreground">Total</span>
									<div className="font-medium tabular-nums">
										{Object.values(score).reduce(
											(sum, value) => sum + value,
											0,
										)}{" "}
										/ 100
									</div>
								</div>
							</div>
						</div>
						<div className="flex flex-wrap gap-2">
							<Button
								disabled={qualify.isPending}
								onClick={() =>
									qualify.mutate({
										sourceRecordId: row.sourceRecordId,
										components: score,
										evidence: {},
									})
								}
							>
								{qualify.isPending ? <Spinner /> : null}Save score
							</Button>
							{row.signalScore != null ? (
								<Button
									variant="outline"
									disabled={qualify.isPending}
									onClick={() =>
										qualify.mutate({
											sourceRecordId: row.sourceRecordId,
											evidence: {},
										})
									}
								>
									Keep existing score
								</Button>
							) : null}
						</div>
					</section>

					<section className="space-y-3 border-t pt-5">
						<div>
							<h3 className="font-medium">3. Promote</h3>
							<p className="text-sm text-muted-foreground">
								70+ can become a canonical opportunity. A visible deal requires
								85+, a resolved company, and an owner.
							</p>
						</div>
						<div className="flex flex-wrap gap-2">
							<Button
								variant="outline"
								disabled={pending || !row.mapped || (row.signalScore ?? 0) < 70}
								onClick={() =>
									promote.mutate({
										sourceRecordId: row.sourceRecordId,
										createDeal: false,
									})
								}
							>
								Promote opportunity
							</Button>
						</div>
						<div className="grid gap-2 sm:grid-cols-[1fr_auto]">
							<Select value={ownerId} onValueChange={setOwnerId}>
								<SelectTrigger>
									<SelectValue placeholder="Deal owner" />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value="unassigned">Choose owner</SelectItem>
									{(users.data ?? []).map((user) => (
										<SelectItem key={user.id} value={user.id}>
											{user.name}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
							<Button
								disabled={
									pending ||
									!row.mapped ||
									(row.signalScore ?? 0) < 85 ||
									ownerId === "unassigned"
								}
								onClick={() =>
									promote.mutate({
										sourceRecordId: row.sourceRecordId,
										createDeal: true,
										ownerId,
									})
								}
							>
								{promote.isPending ? <Spinner /> : null}Create visible deal
							</Button>
						</div>
					</section>
				</div>
			</SheetContent>
		</Sheet>
	);
}

function ScoreBadge({ score }: { score: number | null }) {
	if (score == null) return <Badge variant="outline">Unscored</Badge>;
	if (score >= 85) return <Badge>{score} · Priority</Badge>;
	if (score >= 70)
		return <Badge variant="secondary">{score} · Qualified</Badge>;
	if (score >= 50) return <Badge variant="outline">{score} · Research</Badge>;
	return <Badge variant="mono">{score} · Signal</Badge>;
}

function Info({ label, value }: { label: string; value: string }) {
	return (
		<div>
			<div className="text-xs font-medium text-muted-foreground">{label}</div>
			<div className="mt-1 text-sm leading-relaxed">{value}</div>
		</div>
	);
}

function ScoreInput({
	label,
	value,
	max,
	onChange,
}: {
	label: string;
	value: number;
	max: number;
	onChange: (value: number) => void;
}) {
	const inputId = `score-${label.toLowerCase().replaceAll(" ", "-")}`;
	return (
		<div className="space-y-1 text-sm">
			<span className="text-muted-foreground">
				{label} / {max}
			</span>
			<Input
				id={inputId}
				type="number"
				min={0}
				max={max}
				value={value}
				onChange={(event) =>
					onChange(Math.max(0, Math.min(max, Number(event.target.value) || 0)))
				}
				aria-label={label}
			/>
		</div>
	);
}
