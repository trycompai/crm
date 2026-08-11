"use client";

import Copy from "@carbon/icons-react/es/Copy";
import Renew from "@carbon/icons-react/es/Renew";
import Save from "@carbon/icons-react/es/Save";
import Send from "@carbon/icons-react/es/Send";
import StopOutline from "@carbon/icons-react/es/StopOutline";
import TrashCan from "@carbon/icons-react/es/TrashCan";
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
	AlertDialogTrigger,
} from "@crm/ui/components/alert-dialog";
import { Button } from "@crm/ui/components/button";
import { EmptyCellValue } from "@crm/ui/components/empty-cell";
import { EntityLogo } from "@crm/ui/components/entity-logo";
import { Icon } from "@crm/ui/components/icon";
import { Input } from "@crm/ui/components/input";
import { StatusIndicator } from "@crm/ui/components/status-indicator";
import { Textarea } from "@crm/ui/components/textarea";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { toast } from "sonner";
import {
	PROSPECT_COUNTRY_LABELS,
	PROSPECT_ROUTE_LABELS,
	PROSPECT_STATUS_LABELS,
	prospectRouteTone,
	prospectStatusTone,
} from "@/components/crm/prospect-labels";
import {
	type ProspectNextAction,
	prospectNextAction,
} from "@/components/crm/prospect-next-action";
import { ProspectResearchButton } from "@/components/crm/prospect-research-button";
import {
	DetailSheetBody,
	DetailSheetProperties,
	DetailSheetProperty,
	DetailSheetProse,
	DetailSheetSection,
	DetailSheetStat,
	DetailSheetStats,
	type DetailSheetTab,
} from "@/components/detail-sheet";
import { ENRICHMENT_POLL_MS, isEnriching } from "@/lib/enrichment-status";
import { useCrmCache } from "@/lib/trpc/cache";
import { useTRPC } from "@/lib/trpc/client";
import type { RouterOutputs } from "@/lib/trpc/types";
import { RecordLink } from "./record-link";
import { DomainLink, MetaLine, RecordSheetFrame } from "./record-parts";
import { useOpenRecord, useRecordSheetView } from "./record-stack";

type Prospect = RouterOutputs["prospects"]["byId"];
type ProspectEvidence = Prospect["evidence"][number];
type OutreachDraft = RouterOutputs["outreach"]["byProspect"]["drafts"][number];
type OutreachGovernance = Pick<
	RouterOutputs["outreach"]["byProspect"],
	"approvals" | "work"
>;
type ClientRequestIntent = {
	fingerprint: string;
	clientRequestId: string;
};

const dateFormat = new Intl.DateTimeFormat(undefined, {
	month: "short",
	day: "numeric",
	year: "numeric",
});

function formattedDate(value: string | null): string | null {
	if (!value) return null;
	const date = new Date(value);
	return Number.isNaN(date.getTime()) ? null : dateFormat.format(date);
}

function dateTimeLocal(value: string | null | undefined) {
	if (!value) return "";
	const date = new Date(value);
	if (Number.isNaN(date.getTime())) return "";
	const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
	return local.toISOString().slice(0, 16);
}

function isoFromDateTimeLocal(value: string) {
	const date = new Date(value);
	return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function useClientRequestIntent() {
	const intent = useRef<ClientRequestIntent | null>(null);
	return {
		build<T extends Record<string, unknown>>(operation: string, input: T) {
			const fingerprint = JSON.stringify([operation, input]);
			if (intent.current?.fingerprint === fingerprint) {
				return { ...input, clientRequestId: intent.current.clientRequestId };
			}
			const next = {
				fingerprint,
				clientRequestId: crypto.randomUUID(),
			};
			intent.current = next;
			return { ...input, clientRequestId: next.clientRequestId };
		},
		clear() {
			intent.current = null;
		},
	};
}

function Value({ children }: { children: string | null }) {
	return children ?? <EmptyCellValue />;
}

function Rationale({ title, value }: { title: string; value: string | null }) {
	return (
		<DetailSheetSection title={title}>
			{value ? (
				<DetailSheetProse>{value}</DetailSheetProse>
			) : (
				<EmptyCellValue />
			)}
		</DetailSheetSection>
	);
}

function domainOf(value: string | null): string | null {
	if (!value) return null;
	try {
		return new URL(value.includes("://") ? value : `https://${value}`).hostname
			.toLowerCase()
			.replace(/^www\./, "");
	} catch {
		return null;
	}
}

function currentJob(prospect: Prospect): ProspectEvidence | null {
	const domain = domainOf(prospect.website);
	const boundary = Date.now() - 120 * 24 * 60 * 60 * 1_000;
	return (
		prospect.evidence.find(
			(evidence) =>
				evidence.sourceType === "OFFICIAL_JOB_POSTING" &&
				Boolean(evidence.signalDate) &&
				new Date(evidence.signalDate as string).getTime() >= boundary &&
				new Date(evidence.signalDate as string).getTime() <= Date.now() &&
				domainOf(evidence.url) === domain,
		) ?? null
	);
}

function strongestJob(prospect: Prospect): ProspectEvidence | null {
	return (
		currentJob(prospect) ??
		prospect.evidence.find(
			(evidence) => evidence.sourceType === "OFFICIAL_JOB_POSTING",
		) ??
		null
	);
}

function actionFor(prospect: Prospect): ProspectNextAction {
	return prospectNextAction({
		companyId: prospect.companyId,
		contactId: prospect.contactId,
		dealCount: prospect.company?._count.deals ?? 0,
		enrichmentStatus: prospect.enrichmentStatus,
		hasDraft: Boolean(prospect.draftSubject && prospect.draftBody),
		jobPostingCount: prospect.evidence.filter(
			(evidence) => evidence.sourceType === "OFFICIAL_JOB_POSTING",
		).length,
		namedPerson: prospect.namedPerson,
		queued: prospect.queued,
		role: prospect.role,
		routeStatus: prospect.routeStatus,
		status: prospect.status,
	});
}

function JobPosting({ prospect }: { prospect: Prospect }) {
	const job = strongestJob(prospect);
	const current = currentJob(prospect);

	return (
		<DetailSheetSection title="Actual job posting">
			{job ? (
				<>
					<StatusIndicator
						tone={current ? "success" : job.signalDate ? "warning" : "neutral"}
						label={
							current
								? "Current verified posting"
								: job.signalDate
									? "Posting is stale"
									: "Posting is undated"
						}
					/>
					<DetailSheetProse>{job.observed ?? job.summary}</DetailSheetProse>
					<DetailSheetProperties columns={1}>
						<DetailSheetProperty label="Role or posting">
							<a
								href={job.url}
								target="_blank"
								rel="noreferrer noopener"
								className="text-foreground underline-offset-2 hover:underline"
							>
								{job.title ?? "Open official posting"}
							</a>
						</DetailSheetProperty>
						<DetailSheetProperty label="Published">
							<Value>{formattedDate(job.signalDate)}</Value>
						</DetailSheetProperty>
					</DetailSheetProperties>
				</>
			) : (
				<DetailSheetProse>
					No individual official job posting has been verified. A careers page
					alone does not count.
				</DetailSheetProse>
			)}
		</DetailSheetSection>
	);
}

function ProspectOverview({ prospect }: { prospect: Prospect }) {
	return (
		<DetailSheetBody>
			<Rationale title="Public pain signal" value={prospect.painSignal} />
			<Rationale
				title="Why this account fits"
				value={prospect.whyFit ?? prospect.companyProof}
			/>
			<Rationale title="Why now" value={prospect.whyNow} />
			<JobPosting prospect={prospect} />
			<Rationale title="Job-day problem" value={prospect.jobDayProblem} />
			<Rationale
				title="Public personal context"
				value={prospect.personalHook}
			/>
			<Rationale title="Suggested channel" value={prospect.suggestedChannel} />
			<Rationale title="Caution" value={prospect.caution} />
			<Rationale title="Recommended next move" value={prospect.nextAction} />

			<DetailSheetSection title="Named contact">
				<DetailSheetProperties columns={1}>
					<DetailSheetProperty label="Person">
						{prospect.contact ? (
							<RecordLink kind="contact" id={prospect.contact.id}>
								{[prospect.contact.firstName, prospect.contact.lastName]
									.filter(Boolean)
									.join(" ")}
							</RecordLink>
						) : (
							<Value>{prospect.namedPerson}</Value>
						)}
					</DetailSheetProperty>
					<DetailSheetProperty label="Current role">
						<Value>{prospect.role}</Value>
					</DetailSheetProperty>
					<DetailSheetProperty label="Public work route">
						<Value>{prospect.routeEmail}</Value>
					</DetailSheetProperty>
					<DetailSheetProperty label="Person source">
						{prospect.personSourceUrl ? (
							<a
								href={prospect.personSourceUrl}
								target="_blank"
								rel="noreferrer noopener"
								className="text-foreground underline-offset-2 hover:underline"
							>
								Open verification source
							</a>
						) : (
							<EmptyCellValue />
						)}
					</DetailSheetProperty>
					<DetailSheetProperty label="Route gate">
						{PROSPECT_ROUTE_LABELS[prospect.routeStatus] ??
							prospect.routeStatus}
					</DetailSheetProperty>
					<DetailSheetProperty label="Permission to send">
						{prospect.emailAllowed ? "Granted" : "Not granted"}
					</DetailSheetProperty>
					<DetailSheetProperty label="Block">
						<Value>{prospect.blockReason}</Value>
					</DetailSheetProperty>
				</DetailSheetProperties>
			</DetailSheetSection>
		</DetailSheetBody>
	);
}

function Gate({
	label,
	passed,
	detail,
}: {
	label: string;
	passed: boolean;
	detail?: string;
}) {
	return (
		<div className="flex min-w-0 items-start justify-between gap-4 py-1">
			<span className="flex min-w-0 flex-col">
				<span className="min-w-0 text-muted-foreground text-xs/5">{label}</span>
				{detail ? <span className="min-w-0 text-xs/5">{detail}</span> : null}
			</span>
			<div className="shrink-0 pt-0.5">
				<StatusIndicator
					tone={passed ? "success" : "warning"}
					label={passed ? "Passed" : "Missing"}
				/>
			</div>
		</div>
	);
}

function ProspectActionButton({
	prospect,
	action,
	onNavigate,
}: {
	prospect: Prospect;
	action: ProspectNextAction;
	onNavigate: (tab: string) => void;
}) {
	const openRecord = useOpenRecord();

	if (action.kind === "research") {
		return (
			<ProspectResearchButton
				id={prospect.id}
				queued={prospect.queued}
				label={action.label}
				variant="default"
			/>
		);
	}

	if (action.kind === "working") {
		return (
			<Button variant="outline" size="sm" disabled>
				{action.label}
			</Button>
		);
	}

	const run = () => {
		if (action.kind === "start-deal" || action.kind === "manage-deals") {
			if (!prospect.companyId) return;
			openRecord(
				{ kind: "company", id: prospect.companyId },
				{
					tab: "deals",
					form: action.kind === "start-deal" ? "deal" : undefined,
				},
			);
			return;
		}

		if (action.kind === "complete-account") {
			if (!prospect.companyId) return;
			openRecord(
				{ kind: "company", id: prospect.companyId },
				{ tab: "contacts" },
			);
			return;
		}

		onNavigate(
			action.kind === "review-draft"
				? "draft"
				: action.kind === "review-disqualification"
					? "overview"
					: "evidence",
		);
	};

	return (
		<Button
			variant={
				action.kind === "review-disqualification" ? "outline" : "default"
			}
			size="sm"
			onClick={run}
		>
			{action.label}
		</Button>
	);
}

function ProspectActionView({
	prospect,
	onNavigate,
}: {
	prospect: Prospect;
	onNavigate: (tab: string) => void;
}) {
	const action = actionFor(prospect);
	const draft = prospect.readiness.actions.canReviewDraft;
	const dealCount = prospect.company?._count.deals ?? 0;
	const actionTone =
		action.kind === "start-deal" || action.kind === "manage-deals"
			? "success"
			: action.kind === "working"
				? "info"
				: action.kind === "research" ||
						action.kind === "complete-account" ||
						action.kind === "review-disqualification"
					? "warning"
					: "primary";

	return (
		<DetailSheetBody>
			<DetailSheetSection
				title="Next sales move"
				action={<StatusIndicator tone={actionTone} label={action.label} />}
			>
				<DetailSheetProse>{action.description}</DetailSheetProse>
				<div className="flex flex-wrap items-center gap-2">
					<ProspectActionButton
						prospect={prospect}
						action={action}
						onNavigate={onNavigate}
					/>
					<Button
						variant="outline"
						size="sm"
						onClick={() => onNavigate("overview")}
					>
						Read sales brief
					</Button>
					{draft && action.kind !== "review-draft" ? (
						<Button
							variant="outline"
							size="sm"
							onClick={() => onNavigate("draft")}
						>
							Review draft
						</Button>
					) : null}
				</div>
			</DetailSheetSection>

			<DetailSheetSection title="Sales readiness">
				<DetailSheetProperties columns={1}>
					{prospect.readiness.gates.map((gate) => (
						<Gate
							key={gate.key}
							label={gate.label}
							passed={gate.passed}
							detail={gate.detail}
						/>
					))}
				</DetailSheetProperties>
				<DetailSheetProse>{prospect.readiness.summary}</DetailSheetProse>
			</DetailSheetSection>

			<DetailSheetSection title="Deal handoff">
				<DetailSheetProperties columns={1}>
					<DetailSheetProperty label="Account">
						{prospect.company ? (
							<RecordLink kind="company" id={prospect.company.id}>
								{prospect.company.name}
							</RecordLink>
						) : (
							"Not created"
						)}
					</DetailSheetProperty>
					<DetailSheetProperty label="Sales contact">
						{prospect.contact ? (
							<RecordLink kind="contact" id={prospect.contact.id}>
								{[prospect.contact.firstName, prospect.contact.lastName]
									.filter(Boolean)
									.join(" ")}
							</RecordLink>
						) : (
							(prospect.namedPerson ?? "Not found")
						)}
					</DetailSheetProperty>
					<DetailSheetProperty label="Open deals">
						<span className="tabular-nums">{dealCount}</span>
					</DetailSheetProperty>
					<DetailSheetProperty label="Why now">
						<Value>{prospect.whyNow}</Value>
					</DetailSheetProperty>
					<DetailSheetProperty label="Route">
						<Value>{prospect.routeEmail}</Value>
					</DetailSheetProperty>
				</DetailSheetProperties>
			</DetailSheetSection>
		</DetailSheetBody>
	);
}

function ProspectScoring({ prospect }: { prospect: Prospect }) {
	const dimensions = [
		["Pain strength", prospect.painStrength],
		["Product fit", prospect.productFit],
		["Timing", prospect.timing],
		["Public reachability", prospect.reachability],
		["Evidence quality", prospect.evidenceQuality],
	] as const;
	const completeScore = dimensions.every(([, score]) => score !== null);
	const perfectScore = dimensions.every(([, score]) => score === 5);
	const named = Boolean(
		prospect.namedPerson && prospect.role && prospect.personSourceUrl,
	);
	const route = ["DIRECT_ROUTE_REVIEW", "SEND_READY_REVIEW"].includes(
		prospect.routeStatus,
	);
	const draft = Boolean(prospect.draftSubject && prospect.draftBody);
	const receiptedEvidence = prospect.evidence.filter(
		(evidence) => evidence.receipt !== null,
	);

	return (
		<DetailSheetBody>
			<DetailSheetSection title="First Customer Finder score">
				<DetailSheetProperties columns={1}>
					{dimensions.map(([label, score]) => (
						<DetailSheetProperty key={label} label={label}>
							{score === null ? <EmptyCellValue /> : `${score}/5`}
						</DetailSheetProperty>
					))}
					<DetailSheetProperty label="Weighted score">
						{prospect.fitScore === null ? (
							<EmptyCellValue />
						) : (
							`${prospect.fitScore}/100`
						)}
					</DetailSheetProperty>
				</DetailSheetProperties>
				{completeScore ? null : (
					<DetailSheetProse>
						The five evidence-backed dimensions must be rebuilt before this
						prospect can qualify.
					</DetailSheetProse>
				)}
			</DetailSheetSection>
			<DetailSheetSection title="Automatic CRM promotion gate">
				<DetailSheetProperties columns={1}>
					<Gate label="Every score is 5/5" passed={perfectScore} />
					<Gate
						label="Two fetched sources"
						passed={receiptedEvidence.length >= 2}
					/>
					<Gate
						label="Current official job"
						passed={Boolean(currentJob(prospect))}
					/>
					<Gate label="Named person and role" passed={named} />
					<Gate label="Direct public work route" passed={route} />
					<Gate label="Reviewable draft" passed={draft} />
				</DetailSheetProperties>
				<DetailSheetProse>
					Passing creates or reuses Company and Contact records. It never sends
					the draft; outreach permission remains separate.
				</DetailSheetProse>
			</DetailSheetSection>
		</DetailSheetBody>
	);
}

function EvidenceRecord({ evidence }: { evidence: ProspectEvidence }) {
	return (
		<DetailSheetSection
			title={evidence.title ?? "Public source"}
			action={
				<a
					href={evidence.url}
					target="_blank"
					rel="noreferrer noopener"
					className="text-foreground text-xs underline-offset-2 hover:underline"
				>
					Open source
				</a>
			}
		>
			<DetailSheetProse>{evidence.summary}</DetailSheetProse>
			<DetailSheetProperties columns={1}>
				<DetailSheetProperty label="Source type">
					{evidence.sourceType}
				</DetailSheetProperty>
				<DetailSheetProperty label="Signal date">
					<Value>{formattedDate(evidence.signalDate)}</Value>
				</DetailSheetProperty>
				<DetailSheetProperty label="Fetch receipt">
					{evidence.receipt
						? `${formattedDate(evidence.receipt.fetchedAt)} · HTTP ${evidence.receipt.statusCode} · ${evidence.receipt.contentHash.slice(0, 12)}`
						: "Legacy evidence — re-fetch required"}
				</DetailSheetProperty>
				{evidence.observed ? (
					<DetailSheetProperty label="Observed">
						{evidence.observed}
					</DetailSheetProperty>
				) : null}
				{evidence.inference ? (
					<DetailSheetProperty label="Inference">
						{evidence.inference}
					</DetailSheetProperty>
				) : null}
			</DetailSheetProperties>
		</DetailSheetSection>
	);
}

function ProspectEvidenceView({ prospect }: { prospect: Prospect }) {
	return (
		<DetailSheetBody>
			{prospect.evidence.length > 0 ? (
				prospect.evidence.map((evidence) => (
					<EvidenceRecord key={evidence.id} evidence={evidence} />
				))
			) : (
				<DetailSheetSection title="Evidence">
					<DetailSheetProse>
						No public evidence is retained yet.
					</DetailSheetProse>
				</DetailSheetSection>
			)}
		</DetailSheetBody>
	);
}

function DraftEditor({
	draft,
	onSaved,
}: {
	draft: OutreachDraft;
	onSaved: () => Promise<void>;
}) {
	const trpc = useTRPC();
	const intent = useClientRequestIntent();
	const [subject, setSubject] = useState(draft.subject);
	const [plainTextBody, setPlainTextBody] = useState(draft.plainTextBody);
	const [scheduledFor, setScheduledFor] = useState(
		dateTimeLocal(draft.scheduledFor),
	);
	const editable = ["DRAFT", "PENDING_APPROVAL", "REJECTED"].includes(
		draft.status,
	);
	const update = useMutation(
		trpc.outreach.update.mutationOptions({
			onSuccess: async () => {
				intent.clear();
				await onSaved();
				toast.success(`Step ${draft.sequenceStep} saved for review.`);
			},
			onError: (error) => toast.error(error.message),
		}),
	);
	const copy = `Subject: ${subject}\n\n${plainTextBody}`;

	return (
		<DetailSheetSection
			title={`Step ${draft.sequenceStep ?? "—"} · Variant ${draft.variant ?? "—"}`}
			action={
				<StatusIndicator
					tone={
						draft.status === "SENT"
							? "success"
							: draft.status === "REJECTED" || draft.sendError
								? "warning"
								: "neutral"
					}
					label={draft.status.replaceAll("_", " ").toLowerCase()}
				/>
			}
		>
			<div className="space-y-2">
				<Input
					aria-label={`Step ${draft.sequenceStep} subject`}
					value={subject}
					disabled={!editable}
					onChange={(event) => setSubject(event.target.value)}
				/>
				<Textarea
					aria-label={`Step ${draft.sequenceStep} email body`}
					value={plainTextBody}
					disabled={!editable}
					className="min-h-36"
					onChange={(event) => setPlainTextBody(event.target.value)}
				/>
				<Input
					aria-label={`Step ${draft.sequenceStep} proposed send time`}
					type="datetime-local"
					value={scheduledFor}
					disabled={!editable}
					onChange={(event) => setScheduledFor(event.target.value)}
				/>
				<div className="flex flex-wrap gap-2">
					{editable ? (
						<Button
							size="sm"
							variant="outline"
							disabled={
								update.isPending ||
								!subject.trim() ||
								!plainTextBody.trim() ||
								!scheduledFor ||
								(subject === draft.subject &&
									plainTextBody === draft.plainTextBody &&
									scheduledFor === dateTimeLocal(draft.scheduledFor))
							}
							onClick={() => {
								const proposedSchedule = isoFromDateTimeLocal(scheduledFor);
								if (!proposedSchedule) {
									toast.error("Choose a valid proposed send time.");
									return;
								}
								update.mutate(
									intent.build("outreach.draft.update", {
										draftId: draft.id,
										subject,
										plainTextBody,
										scheduledFor: proposedSchedule,
										expectedUpdatedAt: draft.updatedAt,
									}),
								);
							}}
						>
							<Icon icon={Save} />
							{update.isPending ? "Saving" : "Save edit"}
						</Button>
					) : null}
					<Button
						size="sm"
						variant="ghost"
						onClick={() => {
							void navigator.clipboard.writeText(copy).then(() => {
								toast.success("Draft copied.");
							});
						}}
					>
						<Icon icon={Copy} />
						Copy
					</Button>
				</div>
				{draft.sendError ? (
					<p className="text-pretty text-destructive text-xs/5">
						{draft.sendError}
					</p>
				) : null}
			</div>
		</DetailSheetSection>
	);
}

function GovernanceReceipts({
	governance,
}: {
	governance: OutreachGovernance;
}) {
	const latestApproval = governance.approvals[0] ?? null;
	const latestReceipt = latestApproval?.actionReceipts[0] ?? null;
	if (!governance.work && !latestApproval) return null;
	return (
		<DetailSheetSection title="Governance receipts">
			<DetailSheetProperties>
				<DetailSheetProperty label="Work">
					{governance.work
						? `${governance.work.state.toLowerCase()} · ${governance.work.primaryAction}`
						: "No active outreach work"}
				</DetailSheetProperty>
				<DetailSheetProperty label="Approval">
					{latestApproval
						? `${latestApproval.status.toLowerCase()} · ${latestApproval.contentDigest.slice(0, 12)}`
						: "No approval request recorded"}
				</DetailSheetProperty>
				<DetailSheetProperty label="Receipt">
					{latestReceipt
						? `${latestReceipt.status.toLowerCase()} · ${latestReceipt.id}`
						: "No action receipt recorded"}
				</DetailSheetProperty>
				<DetailSheetProperty label="Updated">
					{formattedDate(
						latestReceipt?.completedAt ??
							latestApproval?.updatedAt ??
							governance.work?.updatedAt ??
							null,
					)}
				</DetailSheetProperty>
			</DetailSheetProperties>
		</DetailSheetSection>
	);
}

function ProspectDraft({ prospect }: { prospect: Prospect }) {
	const trpc = useTRPC();
	const cache = useCrmCache();
	const queryClient = useQueryClient();
	const intent = useClientRequestIntent();
	const query = useQuery({
		...trpc.outreach.byProspect.queryOptions({ prospectId: prospect.id }),
		refetchInterval: (result) =>
			result.state.data?.queued ||
			result.state.data?.drafts.some((draft) => draft.status === "SENDING")
				? 2_000
				: false,
	});
	const refresh = async () => {
		await Promise.all([
			queryClient.invalidateQueries({
				queryKey: trpc.outreach.byProspect.queryKey({
					prospectId: prospect.id,
				}),
			}),
			cache.prospect(prospect.id, { settle: "record" }),
		]);
	};
	const permission = useMutation(
		trpc.outreach.setPermission.mutationOptions({
			onSuccess: async (result) => {
				intent.clear();
				await refresh();
				toast.success(
					result.allowed
						? "Public work route approved for outreach."
						: "Outreach permission revoked and future steps stopped.",
				);
			},
			onError: (error) => toast.error(error.message),
		}),
	);
	const prepare = useMutation(
		trpc.outreach.prepare.mutationOptions({
			onSuccess: async () => {
				intent.clear();
				await refresh();
				toast.success("The agent is preparing three review-only emails.");
			},
			onError: (error) => toast.error(error.message),
		}),
	);
	const regenerate = useMutation(
		trpc.outreach.regenerate.mutationOptions({
			onSuccess: async () => {
				intent.clear();
				await refresh();
				toast.success("Regeneration proposed. Model execution remains paused.");
			},
			onError: (error) => toast.error(error.message),
		}),
	);
	const approve = useMutation(
		trpc.outreach.approveSequence.mutationOptions({
			onSuccess: async () => {
				intent.clear();
				await refresh();
				toast.success(
					"Sequence proposal approved. Provider execution remains disabled.",
				);
			},
			onError: (error) => toast.error(error.message),
		}),
	);
	const reject = useMutation(
		trpc.outreach.rejectSequence.mutationOptions({
			onSuccess: async () => {
				intent.clear();
				await refresh();
				toast.success("Sequence stopped.");
			},
			onError: (error) => toast.error(error.message),
		}),
	);
	const remove = useMutation(
		trpc.outreach.deleteSequence.mutationOptions({
			onSuccess: async () => {
				intent.clear();
				await refresh();
				toast.success("Email proposals deleted.");
			},
			onError: (error) => toast.error(error.message),
		}),
	);
	const updateInitial = useMutation(
		trpc.prospects.updateDraft.mutationOptions({
			onSuccess: async () => {
				await cache.prospect(prospect.id, { settle: "record" });
				toast.success("Initial email proposal saved.");
			},
			onError: (error) => toast.error(error.message),
		}),
	);
	const deleteInitial = useMutation(
		trpc.prospects.deleteDraft.mutationOptions({
			onSuccess: async () => {
				await cache.prospect(prospect.id, { settle: "record" });
				toast.success("Initial email proposal deleted.");
			},
			onError: (error) => toast.error(error.message),
		}),
	);
	const drafts = query.data?.drafts ?? [];
	const sequenceId = drafts[0]?.sequenceId ?? null;
	const pendingSequence =
		drafts.length === 3 &&
		drafts.every((draft) => draft.status === "PENDING_APPROVAL");
	const canApprove =
		pendingSequence && prospect.readiness.actions.canApproveSequence;
	const canStop = drafts.some((draft) =>
		["DRAFT", "PENDING_APPROVAL", "APPROVED"].includes(draft.status),
	);
	const canDelete =
		drafts.length > 0 &&
		drafts.every((draft) =>
			["DRAFT", "PENDING_APPROVAL", "REJECTED"].includes(draft.status),
		);
	const canRegenerate =
		canDelete && Boolean(query.data?.draftSetDigest) && !query.data?.queued;

	return (
		<DetailSheetBody>
			{prospect.draftSubject && prospect.draftBody ? (
				<InitialDraftEditor
					prospect={prospect}
					busy={updateInitial.isPending || deleteInitial.isPending}
					onSave={(draftSubject, draftBody) =>
						updateInitial.mutate({
							id: prospect.id,
							draftSubject,
							draftBody,
						})
					}
					onDelete={() => deleteInitial.mutate({ id: prospect.id })}
				/>
			) : (
				<DetailSheetSection title="Initial email proposal">
					<DetailSheetProse>
						No research draft is retained for this prospect. Run research to
						ground a new proposal in current evidence.
					</DetailSheetProse>
				</DetailSheetSection>
			)}

			<DetailSheetSection title="Outreach permission">
				<DetailSheetProse>
					{prospect.emailAllowed
						? "A CRM operator approved this exact named public work route. Revoking it stops all unsent steps."
						: "Sending is locked. Permission can only be granted when retained public evidence contains the named person, current role and exact work email."}
				</DetailSheetProse>
				{prospect.emailAllowed ||
				prospect.readiness.actions.canApproveRoute ? null : (
					<DetailSheetProse>{prospect.readiness.summary}</DetailSheetProse>
				)}
				<div>
					<Button
						size="sm"
						variant={prospect.emailAllowed ? "outline" : "default"}
						disabled={
							permission.isPending ||
							(!prospect.emailAllowed &&
								!prospect.readiness.actions.canApproveRoute)
						}
						onClick={() =>
							permission.mutate({
								...intent.build("outreach.permission", {
									prospectId: prospect.id,
									allowed: !prospect.emailAllowed,
								}),
							})
						}
					>
						{prospect.emailAllowed
							? "Revoke permission"
							: "Approve verified route"}
					</Button>
				</div>
			</DetailSheetSection>

			{query.isPending ? (
				<DetailSheetSection title="A/B/C email sequence">
					<DetailSheetProse>Loading sequence controls…</DetailSheetProse>
				</DetailSheetSection>
			) : query.isError ? (
				<DetailSheetSection title="A/B/C email sequence">
					<DetailSheetProse>
						Sequence controls could not be loaded: {query.error.message}
					</DetailSheetProse>
					<Button size="sm" variant="outline" onClick={() => query.refetch()}>
						Try again
					</Button>
				</DetailSheetSection>
			) : drafts.length === 0 ? (
				<DetailSheetSection title="A/B/C email sequence">
					<DetailSheetProse>
						{query.data?.queued
							? "The agent is grounding three outreach steps in this prospect's evidence. Nothing will send automatically."
							: "Create three evidence-grounded steps with a fixed test variant. Every step remains editable and needs human approval."}
					</DetailSheetProse>
					{prospect.readiness.actions.canPrepareSequence ? null : (
						<DetailSheetProse>{prospect.readiness.summary}</DetailSheetProse>
					)}
					<Button
						size="sm"
						disabled={
							prepare.isPending ||
							query.data?.queued ||
							!prospect.readiness.actions.canPrepareSequence
						}
						onClick={() =>
							prepare.mutate({
								...intent.build("outreach.prepare", {
									prospectId: prospect.id,
								}),
							})
						}
					>
						{query.data?.queued
							? "Preparing sequence"
							: "Prepare A/B/C sequence"}
					</Button>
				</DetailSheetSection>
			) : (
				<>
					<GovernanceReceipts
						governance={{
							approvals: query.data?.approvals ?? [],
							work: query.data?.work ?? null,
						}}
					/>
					<DetailSheetSection
						title="Sequence controls"
						action={
							<StatusIndicator
								tone={pendingSequence ? "warning" : "neutral"}
								label={
									pendingSequence ? "Human review required" : "Sequence active"
								}
							/>
						}
					>
						<DetailSheetProse>
							Approval records the reviewed sequence proposal and digest.
							Provider sends and schedules remain disabled until every execution
							gate is explicitly opened.
						</DetailSheetProse>
						{pendingSequence && !canApprove ? (
							<DetailSheetProse>
								{prospect.readiness.actions.executionDisabledReason ??
									prospect.readiness.summary}
							</DetailSheetProse>
						) : null}
						<div className="flex flex-wrap gap-2">
							<Button
								size="sm"
								disabled={!canApprove || !sequenceId || approve.isPending}
								onClick={() =>
									sequenceId &&
									approve.mutate({
										...intent.build("outreach.sequence.approve", {
											sequenceId,
										}),
									})
								}
							>
								<Icon icon={Send} />
								Approve proposal
							</Button>
							<Button
								size="sm"
								variant="outline"
								disabled={!canRegenerate || regenerate.isPending}
								onClick={() => {
									const digest = query.data?.draftSetDigest;
									if (!digest) return;
									regenerate.mutate({
										...intent.build("outreach.regenerate", {
											prospectId: prospect.id,
											expectedDraftSetDigest: digest,
										}),
									});
								}}
							>
								<Icon icon={Renew} />
								Request regeneration
							</Button>
							<Button
								size="sm"
								variant="outline"
								disabled={!canStop || !sequenceId || reject.isPending}
								onClick={() =>
									sequenceId &&
									reject.mutate({
										...intent.build("outreach.sequence.reject", {
											sequenceId,
										}),
									})
								}
							>
								<Icon icon={StopOutline} />
								Stop sequence
							</Button>
							<AlertDialog>
								<AlertDialogTrigger asChild>
									<Button
										size="sm"
										variant="ghost"
										disabled={!canDelete || !sequenceId || remove.isPending}
									>
										<Icon icon={TrashCan} />
										Delete proposals
									</Button>
								</AlertDialogTrigger>
								<AlertDialogContent>
									<AlertDialogHeader>
										<AlertDialogTitle>
											Delete all three proposals?
										</AlertDialogTitle>
										<AlertDialogDescription>
											This removes the unsent sequence. Sent email history is
											never deleted here.
										</AlertDialogDescription>
									</AlertDialogHeader>
									<AlertDialogFooter>
										<AlertDialogCancel>Keep proposals</AlertDialogCancel>
										<AlertDialogAction
											variant="destructive"
											onClick={() =>
												sequenceId &&
												remove.mutate({
													...intent.build("outreach.sequence.delete", {
														sequenceId,
													}),
												})
											}
										>
											Delete proposals
										</AlertDialogAction>
									</AlertDialogFooter>
								</AlertDialogContent>
							</AlertDialog>
						</div>
					</DetailSheetSection>
					{drafts.map((draft) => (
						<DraftEditor
							key={`${draft.id}:${draft.updatedAt}`}
							draft={draft}
							onSaved={refresh}
						/>
					))}
				</>
			)}
		</DetailSheetBody>
	);
}

function InitialDraftEditor({
	prospect,
	busy,
	onSave,
	onDelete,
}: {
	prospect: Prospect;
	busy: boolean;
	onSave: (subject: string, body: string) => void;
	onDelete: () => void;
}) {
	const [subject, setSubject] = useState(prospect.draftSubject ?? "");
	const [body, setBody] = useState(prospect.draftBody ?? "");
	const changed =
		subject !== prospect.draftSubject || body !== prospect.draftBody;

	return (
		<DetailSheetSection
			title="Initial email proposal"
			action={
				<StatusIndicator tone="warning" label="Review only · never sends" />
			}
		>
			<DetailSheetProse>
				This is the evidence-grounded opening proposal from research. Edit or
				delete it safely before any route is approved or sequence is prepared.
			</DetailSheetProse>
			<div className="space-y-2">
				<Input
					aria-label="Initial email subject"
					value={subject}
					onChange={(event) => setSubject(event.target.value)}
				/>
				<Textarea
					aria-label="Initial email body"
					value={body}
					className="min-h-44"
					onChange={(event) => setBody(event.target.value)}
				/>
				<div className="flex flex-wrap gap-2">
					<Button
						size="sm"
						variant="outline"
						disabled={busy || !changed || !subject.trim() || !body.trim()}
						onClick={() => onSave(subject, body)}
					>
						<Icon icon={Save} />
						Save edit
					</Button>
					<Button
						size="sm"
						variant="ghost"
						onClick={() => {
							void navigator.clipboard
								.writeText(`Subject: ${subject}\n\n${body}`)
								.then(() => toast.success("Draft copied."));
						}}
					>
						<Icon icon={Copy} />
						Copy
					</Button>
					<AlertDialog>
						<AlertDialogTrigger asChild>
							<Button size="sm" variant="ghost" disabled={busy}>
								<Icon icon={TrashCan} />
								Delete
							</Button>
						</AlertDialogTrigger>
						<AlertDialogContent>
							<AlertDialogHeader>
								<AlertDialogTitle>Delete this email proposal?</AlertDialogTitle>
								<AlertDialogDescription>
									This removes the research draft only. It does not change the
									prospect or send anything.
								</AlertDialogDescription>
							</AlertDialogHeader>
							<AlertDialogFooter>
								<AlertDialogCancel>Keep draft</AlertDialogCancel>
								<AlertDialogAction variant="destructive" onClick={onDelete}>
									Delete proposal
								</AlertDialogAction>
							</AlertDialogFooter>
						</AlertDialogContent>
					</AlertDialog>
				</div>
			</div>
		</DetailSheetSection>
	);
}

export function ProspectSheet({ prospectId }: { prospectId: string }) {
	const trpc = useTRPC();
	const { tab, setTab } = useRecordSheetView("work");
	const query = useQuery({
		...trpc.prospects.byId.queryOptions({ id: prospectId }),
		refetchInterval: (query) =>
			query.state.data &&
			isEnriching(query.state.data.enrichmentStatus, query.state.data.queued)
				? ENRICHMENT_POLL_MS
				: false,
	});
	const prospect = query.data;
	const action = prospect ? actionFor(prospect) : null;

	const tabs: DetailSheetTab[] = prospect
		? [
				{
					value: "work",
					label: "Work",
					content: (
						<ProspectActionView prospect={prospect} onNavigate={setTab} />
					),
				},
				{
					value: "overview",
					label: "Overview",
					content: <ProspectOverview prospect={prospect} />,
				},
				{
					value: "evidence",
					label: "Evidence",
					count: prospect.evidence.length,
					content: <ProspectEvidenceView prospect={prospect} />,
				},
				{
					value: "scoring",
					label: "Scoring",
					content: <ProspectScoring prospect={prospect} />,
				},
				{
					value: "draft",
					label: "Draft",
					content: <ProspectDraft prospect={prospect} />,
				},
			]
		: [];

	return (
		<RecordSheetFrame
			loading={query.isPending}
			error={query.error?.message ?? null}
			title={prospect?.companyName ?? "Prospect"}
			description={
				prospect ? (
					<MetaLine
						lead={<DomainLink domain={null} website={prospect.website} />}
						parts={[prospect.location, prospect.country]}
					/>
				) : undefined
			}
			media={
				prospect ? <EntityLogo name={prospect.companyName} size="lg" /> : null
			}
			note={
				prospect ? (
					<>
						<StatusIndicator
							size="sm"
							tone={prospectStatusTone(prospect.status)}
							label={PROSPECT_STATUS_LABELS[prospect.status] ?? prospect.status}
						/>
						<StatusIndicator
							size="sm"
							tone={prospectRouteTone(prospect.routeStatus)}
							label={
								PROSPECT_ROUTE_LABELS[prospect.routeStatus] ??
								prospect.routeStatus
							}
						/>
					</>
				) : undefined
			}
			actions={
				prospect && action ? (
					<ProspectActionButton
						prospect={prospect}
						action={action}
						onNavigate={setTab}
					/>
				) : undefined
			}
			stats={
				prospect ? (
					<DetailSheetStats>
						<DetailSheetStat label="Fit">
							{prospect.fitScore ?? "—"}
						</DetailSheetStat>
						<DetailSheetStat label="Market">
							{PROSPECT_COUNTRY_LABELS[prospect.countryCode] ??
								prospect.countryCode}
						</DetailSheetStat>
						<DetailSheetStat label="Contact">
							{prospect.namedPerson ?? "Missing"}
						</DetailSheetStat>
						<DetailSheetStat label="Deals">
							{prospect.company?._count.deals ?? 0}
						</DetailSheetStat>
					</DetailSheetStats>
				) : undefined
			}
			tabs={tabs}
			tab={tab}
			onTabChange={setTab}
		/>
	);
}
