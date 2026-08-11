import { WORKSPACE_ID } from "@crm/auth";
import {
	type AgentTaskState,
	type Db,
	type EmailDraftStatus,
	type OutreachVariant,
	Prisma,
} from "@crm/db";
import { PRIORITY } from "@crm/db/agent-tasks";
import { approvalContentDigest } from "@crm/db/approval";
import { outreachApprovalDigest } from "@crm/db/outreach";
import {
	BadRequestException,
	ConflictException,
	Injectable,
	NotFoundException,
} from "@nestjs/common";
import { AgentTriggerService } from "../agent/agent-trigger.service";
import { normalizeEmail } from "../crm/values";
import { InjectDatabase } from "../database/database.constants";
import {
	KernelIdempotencyService,
	kernelRequestHash,
} from "../operating-kernel/kernel-idempotency.service";
import { OperatingKernelAccessService } from "../operating-kernel/operating-kernel-access.service";
import { OperatingKernelCleanupService } from "../operating-kernel/operating-kernel-cleanup.service";
import { buildProspectReadiness } from "../prospects/prospect-readiness";
import type { LeadDiscoveryInput } from "./outreach.contracts";
import {
	approvalSnapshotSequenceId,
	outreachExecutionDisabledReason,
	outreachStepStopReason,
} from "./outreach-read-model";

const EDITABLE = new Set<EmailDraftStatus>([
	"DRAFT",
	"PENDING_APPROVAL",
	"REJECTED",
]);
const OUTREACH_PROVIDER = "lode-crm";
const OUTREACH_CHANNEL = "outreach";
const OUTREACH_POLICY_VERSION = "outreach-sequence-v1";
const OUTREACH_SEQUENCE_APPROVAL_ACTION = "outreach.sequence.approve";
const OUTREACH_APPROVAL_TTL_MS = 24 * 60 * 60 * 1_000;
const SCHEDULE_GRACE_MS = 5 * 60 * 1_000;
const LEAD_DISCOVERY_POLICY_VERSION = "lead-discovery-paused-v1";
const LEAD_DISCOVERY_REQUEST_OPERATION = "outreach.lead-discovery.request";
const LEAD_DISCOVERY_CANCEL_OPERATION = "outreach.lead-discovery.cancel";
const LEAD_DISCOVERY_RETRY_OPERATION = "outreach.lead-discovery.retry";
const LEAD_DISCOVERY_APPROVAL_ACTION = "outreach.lead-discovery.execute";
const LEAD_DISCOVERY_REQUIRED_GATES = [
	{ key: "freshness", label: "Fresh research" },
	{ key: "currentJobEvidence", label: "Current official job" },
	{ key: "namedPerson", label: "Named person and role" },
	{ key: "verifiedRoute", label: "Verified public route" },
	{ key: "jurisdictionPolicy", label: "Supported jurisdiction" },
	{ key: "abcDrafts", label: "A/B/C sequence drafts" },
] as const;
const TERMINAL_TASK_STATES: AgentTaskState[] = [
	"SUCCEEDED",
	"FAILED",
	"UNKNOWN",
	"CANCELLED",
];

type OutreachMutationResult = Record<string, unknown> & {
	receipt: {
		id: string;
		status: "SUCCEEDED";
		operationKey: string;
	};
};

const LEAD_DISCOVERY_TASK_SELECT = {
	id: true,
	kind: true,
	reason: true,
	state: true,
	attempts: true,
	budget: true,
	budgetUsd: true,
	costUsd: true,
	scopes: true,
	outcome: true,
	operationKey: true,
	idempotencyKey: true,
	approvalRequestId: true,
	approvalContentDigest: true,
	startedAt: true,
	finishedAt: true,
	createdAt: true,
} satisfies Prisma.AgentTaskSelect;

const LEAD_DISCOVERY_PROSPECT_SELECT = {
	id: true,
	status: true,
	routeStatus: true,
	enrichmentStatus: true,
	countryCode: true,
	website: true,
	namedPerson: true,
	role: true,
	personSourceUrl: true,
	routeEmail: true,
	emailAllowed: true,
	companyId: true,
	contactId: true,
	draftSubject: true,
	draftBody: true,
	lastResearchedAt: true,
	nextResearchAt: true,
	evidence: {
		select: {
			receiptId: true,
			sourceType: true,
			url: true,
			signalDate: true,
			observed: true,
		},
	},
	emailDrafts: {
		where: { sequenceId: { not: null } },
		select: {
			sequenceId: true,
			sequenceStep: true,
			status: true,
		},
	},
} satisfies Prisma.ProspectSelect;

type LeadDiscoveryTaskRecord = Prisma.AgentTaskGetPayload<{
	select: typeof LEAD_DISCOVERY_TASK_SELECT;
}>;
type LeadDiscoveryScope = {
	targetCount: number;
	targetRegions: string[];
	cohortName: string;
	sourceBatch: string | null;
	estimatedCostUsd: string;
	budgetUsd: string;
	workItemId: string | null;
	approvalRequestId: string | null;
	approvalContentDigest: string | null;
	parentTaskId: string | null;
	executionPaused: boolean;
	providerExecutionDisabled: boolean;
	historicalReplayStatus: string;
};

function emailDomain(email: string): string | null {
	const [, domain] = email.split("@");
	return domain || null;
}

function jsonObject(value: Prisma.JsonValue | null): Record<string, unknown> {
	return value && typeof value === "object" && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: {};
}

function stringArray(value: unknown): string[] {
	return Array.isArray(value)
		? value.filter((item): item is string => typeof item === "string")
		: [];
}

function decimalString(value: Prisma.Decimal | null): string {
	return value?.toFixed(6) ?? "0.000000";
}

function usdDecimal(value: number): Prisma.Decimal {
	return new Prisma.Decimal(value.toFixed(6));
}

function moneyLimit(value: number): string {
	return value.toFixed(6);
}

function leadDiscoveryScope(task: LeadDiscoveryTaskRecord): LeadDiscoveryScope {
	const scopes = jsonObject(task.scopes);
	const estimate = jsonObject(scopes.estimate as Prisma.JsonValue | null);
	const targetCount =
		typeof scopes.targetCount === "number" ? scopes.targetCount : task.budget;
	const budgetUsd =
		typeof scopes.budgetUsd === "string"
			? scopes.budgetUsd
			: decimalString(task.budgetUsd);
	const estimatedCostUsd =
		typeof estimate.estimatedCostUsd === "string"
			? estimate.estimatedCostUsd
			: budgetUsd;
	return {
		targetCount,
		targetRegions: stringArray(scopes.targetRegions),
		cohortName:
			typeof scopes.cohortName === "string"
				? scopes.cohortName
				: "Lead discovery",
		sourceBatch:
			typeof scopes.sourceBatch === "string" ? scopes.sourceBatch : null,
		estimatedCostUsd,
		budgetUsd,
		workItemId:
			typeof scopes.workItemId === "string" ? scopes.workItemId : null,
		approvalRequestId:
			typeof scopes.approvalRequestId === "string"
				? scopes.approvalRequestId
				: task.approvalRequestId,
		approvalContentDigest:
			typeof scopes.approvalContentDigest === "string"
				? scopes.approvalContentDigest
				: task.approvalContentDigest,
		parentTaskId:
			typeof scopes.parentTaskId === "string" ? scopes.parentTaskId : null,
		executionPaused: scopes.executionPaused !== false,
		providerExecutionDisabled: scopes.providerExecutionDisabled !== false,
		historicalReplayStatus:
			typeof scopes.historicalReplayStatus === "string"
				? scopes.historicalReplayStatus
				: "Not replayed",
	};
}

function runProgress(task: LeadDiscoveryTaskRecord, found: number): number {
	if (task.state === "SUCCEEDED") return 100;
	if (TERMINAL_TASK_STATES.includes(task.state)) return 100;
	if (task.state === "WAITING_FOR_APPROVAL") return 0;
	const scope = leadDiscoveryScope(task);
	if (scope.targetCount <= 0) return 0;
	return Math.min(99, Math.round((found / scope.targetCount) * 100));
}

function isSuppressedRoute(
	email: string | null,
	suppressedEmails: Set<string>,
	suppressedDomains: Set<string>,
): boolean {
	if (!email) return false;
	const normalized = normalizeEmail(email);
	const domain = normalized ? emailDomain(normalized) : null;
	return Boolean(
		normalized &&
			(suppressedEmails.has(normalized) ||
				(domain && suppressedDomains.has(domain))),
	);
}

@Injectable()
export class OutreachService {
	constructor(
		@InjectDatabase() private readonly db: Db,
		private readonly agent: AgentTriggerService,
		private readonly cleanup: OperatingKernelCleanupService,
		private readonly access: OperatingKernelAccessService,
		private readonly idempotency: KernelIdempotencyService,
	) {}

	async supplyStatus() {
		const sendingPaused =
			process.env.PROVIDER_MUTATIONS_PAUSED?.trim().toLowerCase() !== "false" ||
			process.env.OUTREACH_SENDS_PAUSED?.trim().toLowerCase() !== "false";
		const [prospects, researchOpen, discovery, readyRoutes, inbox] =
			await Promise.all([
				this.db.prospect.groupBy({ by: ["status"], _count: true }),
				this.db.agentTask.count({
					where: { kind: "prospect-research", finishedAt: null },
				}),
				this.db.agentTask.findFirst({
					where: { kind: "lead-discovery", finishedAt: null },
					orderBy: { createdAt: "desc" },
					select: {
						id: true,
						state: true,
						attempts: true,
						startedAt: true,
						createdAt: true,
					},
				}),
				this.db.prospect.findMany({
					where: {
						status: "PROMOTED",
						routeStatus: "SEND_READY_REVIEW",
						emailAllowed: true,
						companyId: { not: null },
						contactId: { not: null },
						routeEmail: { not: null },
					},
					select: { routeEmail: true },
				}),
				this.db.emailInbox.findFirst({
					where: { provider: "AGENTMAIL", isEnabled: true },
					select: { id: true },
				}),
			]);
		const approvedEmails = readyRoutes
			.map((route) => normalizeEmail(route.routeEmail ?? ""))
			.filter((email): email is string => email !== null);
		const routeDomains = [
			...new Set(
				approvedEmails
					.map((email) => emailDomain(email))
					.filter((domain): domain is string => domain !== null),
			),
		];
		const [suppressedContacts, suppressedDomains] = await Promise.all([
			approvedEmails.length > 0
				? this.db.suppressedContact.findMany({
						where: { email: { in: approvedEmails } },
						select: { email: true },
					})
				: [],
			routeDomains.length > 0
				? this.db.suppressedDomain.findMany({
						where: { domain: { in: routeDomains } },
						select: { domain: true },
					})
				: [],
		]);
		const blockedContacts = new Set(
			suppressedContacts
				.map((row) => normalizeEmail(row.email))
				.filter((email): email is string => email !== null),
		);
		const blockedDomains = new Set(suppressedDomains.map((row) => row.domain));
		const blockedRoutes = approvedEmails.filter((email) => {
			const domain = emailDomain(email);
			return (
				blockedContacts.has(email) ||
				Boolean(domain && blockedDomains.has(domain))
			);
		}).length;
		const approvedRoutes = approvedEmails.length;
		const agentMailReady = inbox !== null;
		const sendEligible =
			!sendingPaused && agentMailReady ? approvedRoutes - blockedRoutes : 0;

		return {
			sendingPaused,
			agentMailReady,
			approvedRoutes,
			blockedRoutes,
			sendEligible,
			prospects: Object.fromEntries(
				prospects.map((row) => [row.status, row._count]),
			),
			researchOpen,
			discovery: discovery
				? {
						id: discovery.id,
						state:
							discovery.state === "WAITING_FOR_APPROVAL"
								? "paused"
								: discovery.startedAt
									? "running"
									: "queued",
						attempts: discovery.attempts,
						createdAt: discovery.createdAt.toISOString(),
					}
				: null,
		};
	}

	async findMore(input: LeadDiscoveryInput, userId: string) {
		await this.access.assertMember(userId);
		const request = this.normalizeLeadDiscoveryInput(input);
		const requestHash = kernelRequestHash({
			actorId: userId,
			operation: LEAD_DISCOVERY_REQUEST_OPERATION,
			targetCount: request.count,
			targetRegions: request.countryCodes,
			cohortName: request.cohortName,
			budgetUsd: request.budgetUsd,
		});
		return this.db.$transaction(async (tx) => {
			await this.idempotency.lock(tx, input.clientRequestId);
			const replay = await this.replayOutreach(tx, {
				key: input.clientRequestId,
				requestHash,
				operationKey: LEAD_DISCOVERY_REQUEST_OPERATION,
			});
			if (replay) return replay;
			const run = await this.createPausedLeadDiscoveryRun(tx, {
				userId,
				targetCount: request.count,
				targetRegions: request.countryCodes,
				cohortName: request.cohortName,
				budgetUsd: request.budgetUsd,
				clientRequestId: input.clientRequestId,
				operationKey: LEAD_DISCOVERY_REQUEST_OPERATION,
				parentTaskId: null,
			});
			return this.recordOutreachReceipt(tx, {
				key: input.clientRequestId,
				requestHash,
				operationKey: LEAD_DISCOVERY_REQUEST_OPERATION,
				result: {
					...run,
					planned: 1,
					queued: 0,
					alreadyQueued: 0,
				},
			});
		});
	}

	async leadDiscoveryRuns() {
		const tasks = await this.db.agentTask.findMany({
			where: { kind: "lead-discovery" },
			orderBy: { createdAt: "desc" },
			take: 12,
			select: LEAD_DISCOVERY_TASK_SELECT,
		});
		const scopes = new Map(
			tasks.map((task) => [task.id, leadDiscoveryScope(task)]),
		);
		const sourceBatches = [
			...new Set(
				[...scopes.values()]
					.map((scope) => scope.sourceBatch)
					.filter((batch): batch is string => batch !== null),
			),
		];
		const prospects =
			sourceBatches.length > 0
				? await this.db.prospect.findMany({
						where: { sourceBatch: { in: sourceBatches } },
						select: {
							...LEAD_DISCOVERY_PROSPECT_SELECT,
							sourceBatch: true,
						},
					})
				: [];
		const routeEmails = prospects
			.map((prospect) => normalizeEmail(prospect.routeEmail ?? ""))
			.filter((email): email is string => email !== null);
		const routeDomains = [
			...new Set(
				routeEmails
					.map((email) => emailDomain(email))
					.filter((domain): domain is string => domain !== null),
			),
		];
		const [inbox, suppressedContacts, suppressedDomains, receipts] =
			await Promise.all([
				this.db.emailInbox.findFirst({
					where: { provider: "AGENTMAIL", isEnabled: true },
					select: { id: true },
				}),
				routeEmails.length > 0
					? this.db.suppressedContact.findMany({
							where: { email: { in: routeEmails } },
							select: { email: true },
						})
					: [],
				routeDomains.length > 0
					? this.db.suppressedDomain.findMany({
							where: { domain: { in: routeDomains } },
							select: { domain: true },
						})
					: [],
				this.db.actionReceipt.findMany({
					where: {
						provider: OUTREACH_PROVIDER,
						channel: OUTREACH_CHANNEL,
						operationKey: {
							in: [
								LEAD_DISCOVERY_REQUEST_OPERATION,
								LEAD_DISCOVERY_CANCEL_OPERATION,
								LEAD_DISCOVERY_RETRY_OPERATION,
							],
						},
					},
					orderBy: { createdAt: "desc" },
					take: 200,
					select: {
						id: true,
						operationKey: true,
						status: true,
						completedAt: true,
						result: true,
						errorCode: true,
					},
				}),
			]);
		const suppressedEmailSet = new Set(
			suppressedContacts
				.map((row) => normalizeEmail(row.email))
				.filter((email): email is string => email !== null),
		);
		const suppressedDomainSet = new Set(
			suppressedDomains.map((row) => row.domain),
		);
		const byBatch = new Map<string, typeof prospects>();
		for (const prospect of prospects) {
			const existing = byBatch.get(prospect.sourceBatch) ?? [];
			existing.push(prospect);
			byBatch.set(prospect.sourceBatch, existing);
		}
		const sendingPaused =
			process.env.PROVIDER_MUTATIONS_PAUSED?.trim().toLowerCase() !== "false" ||
			process.env.OUTREACH_SENDS_PAUSED?.trim().toLowerCase() !== "false";

		return tasks.map((task) => {
			const scope = scopes.get(task.id) ?? leadDiscoveryScope(task);
			const rows = scope.sourceBatch
				? (byBatch.get(scope.sourceBatch) ?? [])
				: [];
			const gapCounts = Object.fromEntries(
				LEAD_DISCOVERY_REQUIRED_GATES.map((gate) => [gate.key, 0]),
			) as Record<
				(typeof LEAD_DISCOVERY_REQUIRED_GATES)[number]["key"],
				number
			>;
			let sendEligible = 0;
			let suppressedRoutes = 0;
			let sequenceDrafts = 0;
			for (const row of rows) {
				const routeSuppressed = isSuppressedRoute(
					row.routeEmail,
					suppressedEmailSet,
					suppressedDomainSet,
				);
				if (routeSuppressed) suppressedRoutes += 1;
				const readiness = buildProspectReadiness(
					{
						id: row.id,
						status: row.status,
						routeStatus: row.routeStatus,
						enrichmentStatus: row.enrichmentStatus,
						countryCode: row.countryCode,
						website: row.website,
						namedPerson: row.namedPerson,
						role: row.role,
						personSourceUrl: row.personSourceUrl,
						routeEmail: row.routeEmail,
						emailAllowed: row.emailAllowed,
						companyId: row.companyId,
						contactId: row.contactId,
						draftSubject: row.draftSubject,
						draftBody: row.draftBody,
						lastResearchedAt: row.lastResearchedAt,
						nextResearchAt: row.nextResearchAt,
						queued: false,
						evidence: row.evidence,
						emailDrafts: row.emailDrafts,
					},
					{
						sendingPaused,
						agentMailReady: inbox !== null,
						routeSuppressed,
					},
				);
				if (readiness.sendEligible) sendEligible += 1;
				sequenceDrafts += readiness.sequence.activeDrafts;
				for (const gate of LEAD_DISCOVERY_REQUIRED_GATES) {
					if (!readiness.gates.find((item) => item.key === gate.key)?.passed) {
						gapCounts[gate.key] += 1;
					}
				}
			}
			const taskReceipts = receipts
				.filter((receipt) => {
					const result = jsonObject(receipt.result);
					return result.taskId === task.id || result.parentTaskId === task.id;
				})
				.slice(0, 5)
				.map((receipt) => ({
					id: receipt.id,
					operationKey: receipt.operationKey,
					status: receipt.status,
					completedAt: receipt.completedAt?.toISOString() ?? null,
					errorCode: receipt.errorCode,
				}));
			return {
				id: task.id,
				state: task.state,
				attempts: task.attempts,
				targetCount: scope.targetCount,
				targetRegions: scope.targetRegions,
				cohortName: scope.cohortName,
				sourceBatch: scope.sourceBatch,
				requiredGates: LEAD_DISCOVERY_REQUIRED_GATES,
				foundCount: rows.length,
				progress: runProgress(task, rows.length),
				gapCounts,
				sendEligible,
				suppressedRoutes,
				sequenceDrafts,
				budgetUsd: scope.budgetUsd,
				estimatedCostUsd: scope.estimatedCostUsd,
				actualCostUsd: decimalString(task.costUsd),
				executionPaused: scope.executionPaused,
				providerExecutionDisabled: scope.providerExecutionDisabled,
				historicalReplayStatus: scope.historicalReplayStatus,
				workItemId: scope.workItemId,
				approvalRequestId: scope.approvalRequestId,
				approvalContentDigest: scope.approvalContentDigest,
				parentTaskId: scope.parentTaskId,
				canCancel: !TERMINAL_TASK_STATES.includes(task.state),
				canRetry:
					task.state === "FAILED" ||
					task.state === "UNKNOWN" ||
					task.state === "CANCELLED",
				outcome: task.outcome,
				createdAt: task.createdAt.toISOString(),
				startedAt: task.startedAt?.toISOString() ?? null,
				finishedAt: task.finishedAt?.toISOString() ?? null,
				receipts: taskReceipts,
			};
		});
	}

	async cancelLeadDiscovery(
		taskId: string,
		userId: string,
		clientRequestId: string,
	) {
		await this.access.assertMember(userId);
		const requestHash = kernelRequestHash({
			actorId: userId,
			operation: LEAD_DISCOVERY_CANCEL_OPERATION,
			taskId,
		});
		return this.db.$transaction(async (tx) => {
			await this.idempotency.lock(tx, clientRequestId);
			const replay = await this.replayOutreach(tx, {
				key: clientRequestId,
				requestHash,
				operationKey: LEAD_DISCOVERY_CANCEL_OPERATION,
			});
			if (replay) return replay;
			const task = await tx.agentTask.findUnique({
				where: { id: taskId },
				select: LEAD_DISCOVERY_TASK_SELECT,
			});
			if (task?.kind !== "lead-discovery") {
				throw new NotFoundException("Lead discovery run not found.");
			}
			const scope = leadDiscoveryScope(task);
			const now = new Date();
			const cancelled = await tx.agentTask.updateMany({
				where: {
					id: taskId,
					kind: "lead-discovery",
					state: { notIn: TERMINAL_TASK_STATES },
				},
				data: {
					state: "CANCELLED",
					leasedUntil: null,
					finishedAt: now,
					outcome: "Cancelled by operator before provider execution.",
				},
			});
			if (cancelled.count === 1 && scope.approvalRequestId) {
				await tx.approvalRequest.updateMany({
					where: {
						id: scope.approvalRequestId,
						status: { in: ["PENDING", "APPROVED"] },
					},
					data: {
						status: "CANCELLED",
						decidedAt: now,
						version: { increment: 1 },
					},
				});
			}
			if (cancelled.count === 1 && scope.workItemId) {
				await tx.workItem.updateMany({
					where: {
						id: scope.workItemId,
						state: { notIn: ["DONE", "DISMISSED"] },
					},
					data: {
						state: "DISMISSED",
						completedAt: now,
						nextReviewAt: null,
						version: { increment: 1 },
						evidence: {
							source: LEAD_DISCOVERY_CANCEL_OPERATION,
							taskId,
							cancelledAt: now.toISOString(),
						},
					},
				});
			}
			return this.recordOutreachReceipt(tx, {
				key: clientRequestId,
				requestHash,
				operationKey: LEAD_DISCOVERY_CANCEL_OPERATION,
				result: {
					taskId,
					cancelled: cancelled.count === 1,
					state: cancelled.count === 1 ? "CANCELLED" : task.state,
				},
			});
		});
	}

	async retryLeadDiscovery(
		taskId: string,
		userId: string,
		clientRequestId: string,
	) {
		await this.access.assertMember(userId);
		const requestHash = kernelRequestHash({
			actorId: userId,
			operation: LEAD_DISCOVERY_RETRY_OPERATION,
			taskId,
		});
		return this.db.$transaction(async (tx) => {
			await this.idempotency.lock(tx, clientRequestId);
			const replay = await this.replayOutreach(tx, {
				key: clientRequestId,
				requestHash,
				operationKey: LEAD_DISCOVERY_RETRY_OPERATION,
			});
			if (replay) return replay;
			const task = await tx.agentTask.findUnique({
				where: { id: taskId },
				select: LEAD_DISCOVERY_TASK_SELECT,
			});
			if (task?.kind !== "lead-discovery") {
				throw new NotFoundException("Lead discovery run not found.");
			}
			if (
				task.state !== "FAILED" &&
				task.state !== "UNKNOWN" &&
				task.state !== "CANCELLED"
			) {
				throw new BadRequestException(
					"Only a failed, unknown or cancelled lead discovery run can be retried.",
				);
			}
			const scope = leadDiscoveryScope(task);
			const run = await this.createPausedLeadDiscoveryRun(tx, {
				userId,
				targetCount: scope.targetCount,
				targetRegions: scope.targetRegions,
				cohortName: scope.cohortName,
				budgetUsd: Number(scope.budgetUsd),
				clientRequestId,
				operationKey: LEAD_DISCOVERY_RETRY_OPERATION,
				parentTaskId: taskId,
			});
			return this.recordOutreachReceipt(tx, {
				key: clientRequestId,
				requestHash,
				operationKey: LEAD_DISCOVERY_RETRY_OPERATION,
				result: {
					...run,
					parentTaskId: taskId,
					retried: true,
				},
			});
		});
	}

	async prepare(prospectId: string, userId: string, clientRequestId: string) {
		await this.access.assertMember(userId);
		const [prospect, inbox] = await Promise.all([
			this.db.prospect.findUnique({
				where: { id: prospectId },
				select: {
					id: true,
					status: true,
					routeStatus: true,
					emailAllowed: true,
					companyId: true,
					contactId: true,
					routeEmail: true,
					emailDrafts: {
						where: { status: { not: "REJECTED" } },
						select: { id: true },
						take: 1,
					},
				},
			}),
			this.db.emailInbox.findFirst({
				where: { provider: "AGENTMAIL", isEnabled: true },
				select: { id: true },
			}),
		]);
		if (!prospect) throw new NotFoundException("Prospect not found.");
		if (prospect.emailDrafts.length > 0) {
			return this.db.$transaction(async (tx) => {
				const requestHash = kernelRequestHash({
					actorId: userId,
					operation: "outreach.prepare",
					prospectId,
				});
				await this.idempotency.lock(tx, clientRequestId);
				const replay = await this.replayOutreach(tx, {
					key: clientRequestId,
					requestHash,
					operationKey: "outreach.prepare",
				});
				if (replay) return replay;
				return this.recordOutreachReceipt(tx, {
					key: clientRequestId,
					requestHash,
					operationKey: "outreach.prepare",
					result: { prospectId, queued: false, existing: true },
				});
			});
		}
		if (!inbox) {
			throw new BadRequestException("AgentMail is unavailable.");
		}
		if (
			prospect.status !== "PROMOTED" ||
			prospect.routeStatus !== "SEND_READY_REVIEW" ||
			!prospect.emailAllowed ||
			!prospect.companyId ||
			!prospect.contactId ||
			!prospect.routeEmail
		) {
			throw new BadRequestException(
				"Outreach stays locked until the prospect has perfect research, a named contact and a verified public work route.",
			);
		}

		const result = await this.db.$transaction(async (tx) => {
			const requestHash = kernelRequestHash({
				actorId: userId,
				operation: "outreach.prepare",
				prospectId,
			});
			await this.idempotency.lock(tx, clientRequestId);
			const replay = await this.replayOutreach(tx, {
				key: clientRequestId,
				requestHash,
				operationKey: "outreach.prepare",
			});
			if (replay) return replay;
			await this.ensureOutreachWork(tx, {
				prospectId,
				userId,
				subjectLabel: "Review A/B/C outreach sequence",
				reason:
					"Prepare and review three evidence-grounded outreach steps before any approved execution.",
				primaryAction: "Review A/B/C outreach sequence",
			});
			return this.recordOutreachReceipt(tx, {
				key: clientRequestId,
				requestHash,
				operationKey: "outreach.prepare",
				result: { prospectId, queued: true, existing: false },
			});
		});

		await this.agent.composeOutreach(prospectId);
		return result;
	}

	async setPermission(
		prospectId: string,
		allowed: boolean,
		userId: string,
		clientRequestId: string,
	) {
		await this.access.assertMember(userId);
		const prospect = await this.db.prospect.findUnique({
			where: { id: prospectId },
			select: {
				status: true,
				routeStatus: true,
				routeEmail: true,
				namedPerson: true,
				role: true,
				personSourceUrl: true,
				contact: { select: { email: true } },
				sourceReceipts: {
					select: { finalUrl: true, contentText: true },
				},
			},
		});
		if (!prospect) throw new NotFoundException("Prospect not found.");

		if (!allowed) {
			return this.db.$transaction(async (tx) => {
				const requestHash = kernelRequestHash({
					actorId: userId,
					operation: "outreach.permission",
					prospectId,
					allowed,
				});
				await this.idempotency.lock(tx, clientRequestId);
				const replay = await this.replayOutreach(tx, {
					key: clientRequestId,
					requestHash,
					operationKey: "outreach.permission",
				});
				if (replay) return replay;
				await tx.prospect.update({
					where: { id: prospectId },
					data: {
						emailAllowed: false,
						emailAllowedAt: null,
						emailAllowedById: null,
						routeStatus: prospect.routeEmail
							? "DIRECT_ROUTE_REVIEW"
							: prospect.routeStatus,
					},
				});
				const stopped = await tx.emailDraft.updateMany({
					where: {
						prospectId,
						status: {
							in: ["DRAFT", "PENDING_APPROVAL", "APPROVED", "SENDING"],
						},
					},
					data: {
						status: "REJECTED",
						sendError: "Outreach permission was revoked by a CRM operator.",
					},
				});
				await this.invalidateOutreachApprovals(tx, prospectId);
				await this.cancelDraftTasks(tx, {
					prospectId,
					outcome: "OUTREACH_PERMISSION_REVOKED",
				});
				return this.recordOutreachReceipt(tx, {
					key: clientRequestId,
					requestHash,
					operationKey: "outreach.permission",
					result: { prospectId, allowed: false, stopped: stopped.count },
				});
			});
		}

		const email = prospect.routeEmail?.trim().toLowerCase();
		const personSource = prospect.sourceReceipts.find(
			(receipt) => receipt.finalUrl === prospect.personSourceUrl,
		);
		const personObserved = Boolean(
			prospect.namedPerson &&
				prospect.role &&
				personSource?.contentText
					.toLowerCase()
					.includes(prospect.namedPerson.toLowerCase()) &&
				personSource.contentText
					.toLowerCase()
					.includes(prospect.role.toLowerCase()),
		);
		const emailObserved = Boolean(
			email &&
				prospect.sourceReceipts.some((receipt) =>
					receipt.contentText.toLowerCase().includes(email),
				),
		);
		if (
			prospect.status !== "PROMOTED" ||
			!email ||
			prospect.contact?.email?.toLowerCase() !== email ||
			!personObserved ||
			!emailObserved
		) {
			throw new BadRequestException(
				"Permission stays locked until retained public evidence shows the named person, current role and exact work email.",
			);
		}

		return this.db.$transaction(async (tx) => {
			const requestHash = kernelRequestHash({
				actorId: userId,
				operation: "outreach.permission",
				prospectId,
				allowed,
			});
			await this.idempotency.lock(tx, clientRequestId);
			const replay = await this.replayOutreach(tx, {
				key: clientRequestId,
				requestHash,
				operationKey: "outreach.permission",
			});
			if (replay) return replay;
			await tx.prospect.update({
				where: { id: prospectId },
				data: {
					emailAllowed: true,
					emailAllowedAt: new Date(),
					emailAllowedById: userId,
					routeStatus: "SEND_READY_REVIEW",
				},
			});
			return this.recordOutreachReceipt(tx, {
				key: clientRequestId,
				requestHash,
				operationKey: "outreach.permission",
				result: { prospectId, allowed: true },
			});
		});
	}

	async byProspect(prospectId: string) {
		const [drafts, queued, approvals, work] = await Promise.all([
			this.db.emailDraft.findMany({
				where: { prospectId },
				orderBy: [{ sequenceId: "asc" }, { sequenceStep: "asc" }],
				select: {
					id: true,
					sequenceId: true,
					sequenceStep: true,
					variant: true,
					experimentKey: true,
					status: true,
					subject: true,
					plainTextBody: true,
					fromEmail: true,
					recipients: true,
					scheduledFor: true,
					sentAt: true,
					sendError: true,
					approvedAt: true,
					approvalDigest: true,
					updatedAt: true,
				},
			}),
			this.db.agentTask.findFirst({
				where: {
					prospectId,
					kind: "outreach-compose",
					finishedAt: null,
				},
				select: { id: true },
			}),
			this.db.approvalRequest.findMany({
				where: {
					targetType: "PROSPECT",
					targetId: prospectId,
					action: { startsWith: "outreach." },
				},
				orderBy: { updatedAt: "desc" },
				take: 5,
				select: {
					id: true,
					action: true,
					status: true,
					contentDigest: true,
					policyVersion: true,
					requestedAt: true,
					decidedAt: true,
					updatedAt: true,
					actionReceipts: {
						orderBy: { createdAt: "desc" },
						take: 3,
						select: {
							id: true,
							operationKey: true,
							status: true,
							completedAt: true,
							errorCode: true,
						},
					},
				},
			}),
			this.db.workItem.findFirst({
				where: {
					subjectType: "PROSPECT",
					subjectId: prospectId,
					queue: "outreach",
					state: { notIn: ["DONE", "DISMISSED"] },
				},
				orderBy: { updatedAt: "desc" },
				select: {
					id: true,
					state: true,
					version: true,
					primaryAction: true,
					reason: true,
					updatedAt: true,
				},
			}),
		]);

		return {
			queued: queued !== null,
			work: work ? { ...work, updatedAt: work.updatedAt.toISOString() } : null,
			approvals: approvals.map((approval) => ({
				...approval,
				requestedAt: approval.requestedAt.toISOString(),
				decidedAt: approval.decidedAt?.toISOString() ?? null,
				updatedAt: approval.updatedAt.toISOString(),
				actionReceipts: approval.actionReceipts.map((receipt) => ({
					...receipt,
					completedAt: receipt.completedAt?.toISOString() ?? null,
				})),
			})),
			drafts: drafts.map((draft) => ({
				...draft,
				scheduledFor: draft.scheduledFor?.toISOString() ?? null,
				sentAt: draft.sentAt?.toISOString() ?? null,
				approvedAt: draft.approvedAt?.toISOString() ?? null,
				updatedAt: draft.updatedAt.toISOString(),
			})),
		};
	}

	async update(
		draftId: string,
		data: {
			subject: string;
			plainTextBody: string;
			scheduledFor: string;
			expectedUpdatedAt: string;
			clientRequestId: string;
		},
		userId: string,
	) {
		await this.access.assertMember(userId);
		const scheduledFor = new Date(data.scheduledFor);
		const expectedUpdatedAt = new Date(data.expectedUpdatedAt);
		if (
			Number.isNaN(scheduledFor.getTime()) ||
			Number.isNaN(expectedUpdatedAt.getTime())
		) {
			throw new BadRequestException("Draft schedule version is invalid.");
		}
		const draft = await this.db.emailDraft.findUnique({
			where: { id: draftId },
			select: {
				id: true,
				status: true,
				prospectId: true,
				sequenceId: true,
			},
		});
		if (!draft) throw new NotFoundException("Draft not found.");
		if (!EDITABLE.has(draft.status)) {
			throw new BadRequestException(
				"An approved or sent email cannot be edited.",
			);
		}

		return this.db.$transaction(async (tx) => {
			const requestHash = kernelRequestHash({
				actorId: userId,
				operation: "outreach.draft.update",
				draftId,
				subject: data.subject,
				plainTextBody: data.plainTextBody,
				scheduledFor: scheduledFor.toISOString(),
				expectedUpdatedAt: expectedUpdatedAt.toISOString(),
			});
			await this.idempotency.lock(tx, data.clientRequestId);
			const replay = await this.replayOutreach(tx, {
				key: data.clientRequestId,
				requestHash,
				operationKey: "outreach.draft.update",
			});
			if (replay) return replay;
			const changed = await tx.emailDraft.updateMany({
				where: {
					id: draftId,
					status: { in: [...EDITABLE] },
					updatedAt: expectedUpdatedAt,
				},
				data: {
					subject: data.subject,
					plainTextBody: data.plainTextBody,
					scheduledFor,
					status: "PENDING_APPROVAL",
					approvedAt: null,
					approvedById: null,
					approvalDigest: null,
					sendError: null,
				},
			});
			if (changed.count !== 1) {
				throw new ConflictException(
					"Draft changed while this edit was being reviewed.",
				);
			}
			const updated = await tx.emailDraft.findUnique({
				where: { id: draftId },
				select: { id: true, status: true, updatedAt: true },
			});
			if (!updated)
				throw new ConflictException("Draft disappeared during the update.");
			if (draft.prospectId) {
				await this.invalidateOutreachApprovals(tx, draft.prospectId);
			}
			return this.recordOutreachReceipt(tx, {
				key: data.clientRequestId,
				requestHash,
				operationKey: "outreach.draft.update",
				result: {
					id: updated.id,
					status: updated.status,
					updatedAt: updated.updatedAt.toISOString(),
					sequenceId: draft.sequenceId,
				},
			});
		});
	}

	async approveSequence(
		sequenceId: string,
		userId: string,
		clientRequestId: string,
	) {
		await this.access.assertMember(userId);
		const requestHash = kernelRequestHash({
			actorId: userId,
			operation: "outreach.sequence.approve",
			sequenceId,
		});
		const result = await this.db.$transaction(async (tx) => {
			await this.idempotency.lock(tx, clientRequestId);
			const replay = await this.replayOutreach(tx, {
				key: clientRequestId,
				requestHash,
				operationKey: "outreach.sequence.approve",
			});
			if (replay) return replay;
			const drafts = await tx.emailDraft.findMany({
				where: { sequenceId },
				orderBy: { sequenceStep: "asc" },
			});
			if (drafts.length === 0)
				throw new NotFoundException("Sequence not found.");
			if (drafts.some((draft) => draft.status !== "PENDING_APPROVAL")) {
				throw new BadRequestException("This sequence has already started.");
			}
			if (
				drafts.some(
					(draft) =>
						!draft.subject.trim() ||
						!draft.plainTextBody.trim() ||
						!draft.scheduledFor,
				)
			) {
				throw new BadRequestException(
					"Every sequence step needs copy and a send time.",
				);
			}
			this.assertSequenceSchedule(drafts, new Date());

			const [firstDraft] = drafts;
			if (!firstDraft) throw new NotFoundException("Sequence not found.");
			const prospectId = firstDraft.prospectId;
			if (
				!prospectId ||
				drafts.some((draft) => draft.prospectId !== prospectId)
			) {
				throw new BadRequestException(
					"A sequence must belong to one prospect.",
				);
			}
			const gate = await this.sequenceApprovalGate(tx, {
				prospectId,
				sequenceId,
				drafts,
				externalInboxId: firstDraft.externalInboxId,
			});
			const recipient = gate.recipient;
			if (
				drafts.some((draft) => {
					const recipients = Array.isArray(draft.recipients)
						? draft.recipients.filter(
								(value): value is string => typeof value === "string",
							)
						: [];
					return (
						recipients.length !== 1 ||
						recipients[0]?.toLowerCase() !== recipient
					);
				})
			) {
				throw new BadRequestException(
					"The draft recipient no longer matches the verified route.",
				);
			}

			const [lockedInbox] = await tx.$queryRaw<Array<{ isEnabled: boolean }>>`
				SELECT "isEnabled"
				FROM "emailInbox"
				WHERE id = ${gate.inboxId}
				FOR UPDATE
			`;
			if (!lockedInbox?.isEnabled) {
				throw new BadRequestException(
					"AgentMail was paused while this sequence was being reviewed.",
				);
			}

			const now = new Date();
			const current = await tx.emailDraft.findMany({
				where: { sequenceId, status: "PENDING_APPROVAL" },
				orderBy: { sequenceStep: "asc" },
			});
			if (current.length !== drafts.length) {
				throw new BadRequestException(
					"This sequence was changed or approved elsewhere.",
				);
			}

			const approval = await this.createApprovedSequenceApproval(tx, {
				prospectId,
				sequenceId,
				userId,
				now,
				drafts: current,
				readinessSummary: gate.readiness.summary,
				clientRequestId,
			});
			for (const draft of current) {
				if (!draft.scheduledFor) {
					throw new BadRequestException(
						"Every sequence step needs a proposed send time.",
					);
				}
				const approved = await tx.emailDraft.updateMany({
					where: { id: draft.id, status: "PENDING_APPROVAL" },
					data: {
						status: "APPROVED",
						approvedById: userId,
						approvedAt: now,
						sendRequestedAt: null,
						approvalDigest: outreachApprovalDigest(draft),
						sendError: null,
					},
				});
				if (approved.count !== 1) {
					throw new BadRequestException(
						"This sequence was changed or approved elsewhere.",
					);
				}
			}
			await this.completeOutreachWork(tx, prospectId, now, {
				approvalRequestId: approval.id,
				receiptId: approval.receipt.id,
				sequenceId,
				executionDisabled: true,
			});
			return this.recordOutreachReceipt(tx, {
				key: clientRequestId,
				requestHash,
				operationKey: "outreach.sequence.approve",
				result: {
					sequenceId,
					approved: drafts.length,
					executionDisabled: true,
					approval: {
						id: approval.id,
						status: "APPROVED",
						contentDigest: approval.contentDigest,
						version: approval.version,
					},
					approvalReceipt: approval.receipt,
				},
			});
		});

		return result;
	}

	async rejectSequence(
		sequenceId: string,
		userId: string,
		clientRequestId: string,
	) {
		await this.access.assertMember(userId);
		return this.db.$transaction(async (tx) => {
			const requestHash = kernelRequestHash({
				actorId: userId,
				operation: "outreach.sequence.reject",
				sequenceId,
			});
			await this.idempotency.lock(tx, clientRequestId);
			const replay = await this.replayOutreach(tx, {
				key: clientRequestId,
				requestHash,
				operationKey: "outreach.sequence.reject",
			});
			if (replay) return replay;
			const drafts = await tx.emailDraft.findMany({
				where: {
					sequenceId,
					status: { in: ["DRAFT", "PENDING_APPROVAL", "APPROVED"] },
				},
				select: { id: true, prospectId: true },
			});
			if (drafts.length === 0)
				throw new NotFoundException("Editable sequence not found.");
			const result = await tx.emailDraft.updateMany({
				where: { id: { in: drafts.map((draft) => draft.id) } },
				data: { status: "REJECTED", sendError: "Rejected by a CRM operator." },
			});
			await this.cancelDraftTasks(tx, {
				draftIds: drafts.map((draft) => draft.id),
				outcome: "OUTREACH_SEQUENCE_REJECTED",
			});
			const prospectIds = [
				...new Set(
					drafts
						.map((draft) => draft.prospectId)
						.filter((id): id is string => id !== null),
				),
			];
			for (const prospectId of prospectIds) {
				await this.invalidateOutreachApprovals(tx, prospectId);
				await this.dismissOutreachWork(tx, prospectId, new Date(), {
					sequenceId,
					reason: "Sequence rejected by operator",
				});
			}
			return this.recordOutreachReceipt(tx, {
				key: clientRequestId,
				requestHash,
				operationKey: "outreach.sequence.reject",
				result: { sequenceId, rejected: result.count },
			});
		});
	}

	async deleteDraft(draftId: string, userId: string, clientRequestId: string) {
		await this.access.assertMember(userId);
		return this.db.$transaction(async (tx) => {
			const requestHash = kernelRequestHash({
				actorId: userId,
				operation: "outreach.draft.delete",
				draftId,
			});
			await this.idempotency.lock(tx, clientRequestId);
			const replay = await this.replayOutreach(tx, {
				key: clientRequestId,
				requestHash,
				operationKey: "outreach.draft.delete",
			});
			if (replay) return replay;
			const draft = await tx.emailDraft.findFirst({
				where: {
					id: draftId,
					status: { in: [...EDITABLE] },
				},
				select: { id: true, prospectId: true, sequenceId: true },
			});
			if (!draft)
				throw new BadRequestException(
					"Only unsent draft proposals can be deleted.",
				);
			if (draft.prospectId) {
				await this.invalidateOutreachApprovals(tx, draft.prospectId);
			}
			await this.cleanup.beforeSubjectDelete(tx, {
				type: "EMAIL_DRAFT",
				id: draft.id,
			});
			await tx.emailDraft.delete({ where: { id: draft.id } });
			return this.recordOutreachReceipt(tx, {
				key: clientRequestId,
				requestHash,
				operationKey: "outreach.draft.delete",
				result: {
					id: draftId,
					sequenceId: draft.sequenceId,
					deleted: true,
				},
			});
		});
	}

	async deleteSequence(
		sequenceId: string,
		userId: string,
		clientRequestId: string,
	) {
		await this.access.assertMember(userId);
		return this.db.$transaction(async (tx) => {
			const requestHash = kernelRequestHash({
				actorId: userId,
				operation: "outreach.sequence.delete",
				sequenceId,
			});
			await this.idempotency.lock(tx, clientRequestId);
			const replay = await this.replayOutreach(tx, {
				key: clientRequestId,
				requestHash,
				operationKey: "outreach.sequence.delete",
			});
			if (replay) return replay;
			const blocked = await tx.emailDraft.count({
				where: {
					sequenceId,
					status: { in: ["APPROVED", "SENDING", "SENT"] },
				},
			});
			if (blocked > 0) {
				throw new BadRequestException(
					"A started sequence can be stopped, but not deleted.",
				);
			}
			const drafts = await tx.emailDraft.findMany({
				where: { sequenceId, status: { in: [...EDITABLE] } },
				select: { id: true, prospectId: true },
			});
			if (drafts.length === 0) {
				throw new BadRequestException(
					"Only an unsent sequence can be deleted.",
				);
			}
			const prospectIds = [
				...new Set(
					drafts
						.map((draft) => draft.prospectId)
						.filter((id): id is string => id !== null),
				),
			];
			for (const prospectId of prospectIds) {
				await this.invalidateOutreachApprovals(tx, prospectId);
				await this.dismissOutreachWork(tx, prospectId, new Date(), {
					sequenceId,
					reason: "Sequence deleted by operator",
				});
			}
			for (const draft of drafts) {
				await this.cleanup.beforeSubjectDelete(tx, {
					type: "EMAIL_DRAFT",
					id: draft.id,
				});
			}
			const result = await tx.emailDraft.deleteMany({
				where: { id: { in: drafts.map((draft) => draft.id) } },
			});
			return this.recordOutreachReceipt(tx, {
				key: clientRequestId,
				requestHash,
				operationKey: "outreach.sequence.delete",
				result: { sequenceId, deleted: result.count },
			});
		});
	}

	private normalizeLeadDiscoveryInput(input: LeadDiscoveryInput) {
		return {
			count: Math.max(5, Math.min(100, input.count)),
			countryCodes: [...new Set(input.countryCodes)].sort(),
			cohortName: input.cohortName.trim(),
			budgetUsd: Math.max(0, Math.min(250, input.budgetUsd)),
		};
	}

	private async createPausedLeadDiscoveryRun(
		tx: Prisma.TransactionClient,
		input: {
			userId: string;
			targetCount: number;
			targetRegions: string[];
			cohortName: string;
			budgetUsd: number;
			clientRequestId: string;
			operationKey: string;
			parentTaskId: string | null;
		},
	) {
		const now = new Date();
		const sourceBatch = `lead-discovery:${input.clientRequestId}`;
		const estimatedCostUsd = moneyLimit(input.budgetUsd);
		const expiresAt = new Date(now.getTime() + OUTREACH_APPROVAL_TTL_MS);
		const contentSnapshot = {
			kind: "lead-discovery",
			targetCount: input.targetCount,
			targetRegions: input.targetRegions,
			cohortName: input.cohortName,
			sourceBatch,
			budgetUsd: moneyLimit(input.budgetUsd),
			estimatedCostUsd,
			parentTaskId: input.parentTaskId,
			executionPaused: true,
			providerExecutionDisabled: true,
		};
		const contentDigest = approvalContentDigest({
			action: LEAD_DISCOVERY_APPROVAL_ACTION,
			contentSnapshot,
			targetType: "WORKSPACE",
			targetId: WORKSPACE_ID,
			risk: "MEDIUM",
			policyVersion: LEAD_DISCOVERY_POLICY_VERSION,
			expiresAt,
			invalidationVersion: 0,
		});
		const approval = await tx.approvalRequest.create({
			data: {
				action: LEAD_DISCOVERY_APPROVAL_ACTION,
				contentDigest,
				contentSnapshot: contentSnapshot as Prisma.InputJsonValue,
				targetType: "WORKSPACE",
				targetId: WORKSPACE_ID,
				targetLabel: "Lead discovery run",
				risk: "MEDIUM",
				policyVersion: LEAD_DISCOVERY_POLICY_VERSION,
				requestorId: input.userId,
				expiresAt,
				status: "PENDING",
				idempotencyKey: `lead-discovery-approval:${input.clientRequestId}`,
			},
			select: { id: true, contentDigest: true },
		});
		const scope = {
			policyVersion: LEAD_DISCOVERY_POLICY_VERSION,
			targetCount: input.targetCount,
			targetRegions: input.targetRegions,
			cohortName: input.cohortName,
			sourceBatch,
			requiredGates: LEAD_DISCOVERY_REQUIRED_GATES,
			budgetUsd: moneyLimit(input.budgetUsd),
			estimate: { estimatedCostUsd },
			approvalRequestId: approval.id,
			approvalContentDigest: approval.contentDigest,
			parentTaskId: input.parentTaskId,
			executionPaused: true,
			providerExecutionDisabled: true,
			historicalReplayStatus:
				"No historical replay was executed for this local paused run.",
		};
		const task = await tx.agentTask.create({
			data: {
				kind: "lead-discovery",
				reason: `Find ${input.targetCount} ${input.cohortName} in ${input.targetRegions.join(", ")} after approval`,
				priority: PRIORITY.leadDiscovery,
				budget: input.targetCount,
				state: "WAITING_FOR_APPROVAL",
				dueAt: now,
				subjectType: "WORKSPACE",
				subjectId: WORKSPACE_ID,
				subjectLabel: "Lead supply",
				operationKey: input.operationKey,
				idempotencyKey: `lead-discovery:${input.clientRequestId}`,
				approvalRequestId: approval.id,
				approvalContentDigest: approval.contentDigest,
				budgetUsd: usdDecimal(input.budgetUsd),
				costUsd: usdDecimal(0),
				channel: OUTREACH_CHANNEL,
				provider: "agent",
				scopes: scope,
			},
			select: { id: true },
		});
		const work = await tx.workItem.create({
			data: {
				subjectType: "WORKSPACE",
				subjectId: WORKSPACE_ID,
				subjectLabel: "Lead supply",
				ownerId: input.userId,
				queue: "growth",
				urgency: "NORMAL",
				reason:
					"Review the paused lead discovery run, budget ceiling and mandatory evidence/contact/route gates before any research execution.",
				primaryAction: "Review lead discovery run",
				evidence: {
					source: input.operationKey,
					taskId: task.id,
					sourceBatch,
					targetCount: input.targetCount,
					targetRegions: input.targetRegions,
					cohortName: input.cohortName,
					budgetUsd: moneyLimit(input.budgetUsd),
					estimatedCostUsd,
					approvalRequestId: approval.id,
					approvalContentDigest: approval.contentDigest,
					executionPaused: true,
					providerExecutionDisabled: true,
				},
			},
			select: { id: true },
		});
		await tx.agentTask.update({
			where: { id: task.id },
			data: {
				scopes: {
					...scope,
					workItemId: work.id,
				},
			},
		});
		return {
			taskId: task.id,
			workItemId: work.id,
			approvalRequestId: approval.id,
			approvalContentDigest: approval.contentDigest,
			state: "WAITING_FOR_APPROVAL",
			targetCount: input.targetCount,
			targetRegions: input.targetRegions,
			cohortName: input.cohortName,
			sourceBatch,
			budgetUsd: moneyLimit(input.budgetUsd),
			estimatedCostUsd,
			actualCostUsd: "0.000000",
			executionPaused: true,
			providerExecutionDisabled: true,
		};
	}

	private async replayOutreach(
		tx: Prisma.TransactionClient,
		input: {
			key: string;
			requestHash: string;
			operationKey: string;
		},
	): Promise<OutreachMutationResult | null> {
		const receipt = await tx.actionReceipt.findUnique({
			where: { idempotencyKey: input.key },
			select: {
				provider: true,
				channel: true,
				requestHash: true,
				operationKey: true,
				status: true,
				result: true,
			},
		});
		if (!receipt) return null;
		if (
			receipt.provider !== OUTREACH_PROVIDER ||
			receipt.channel !== OUTREACH_CHANNEL ||
			receipt.requestHash !== input.requestHash ||
			receipt.operationKey !== input.operationKey
		) {
			throw new ConflictException(
				"That client request id has already been used.",
			);
		}
		if (receipt.status !== "SUCCEEDED" || receipt.result === null) {
			throw new ConflictException("That client request is not replayable.");
		}
		return receipt.result as OutreachMutationResult;
	}

	private async recordOutreachReceipt(
		tx: Prisma.TransactionClient,
		input: {
			key: string;
			requestHash: string;
			operationKey: string;
			result: Record<string, unknown>;
			approvalRequestId?: string;
		},
	): Promise<OutreachMutationResult> {
		const receipt = await tx.actionReceipt.create({
			data: {
				idempotencyKey: input.key,
				requestHash: input.requestHash,
				provider: OUTREACH_PROVIDER,
				channel: OUTREACH_CHANNEL,
				operationKey: input.operationKey,
				status: "SUCCEEDED",
				approvalRequestId: input.approvalRequestId ?? null,
				completedAt: new Date(),
				result: input.result as Prisma.InputJsonValue,
			},
			select: { id: true },
		});
		const result: OutreachMutationResult = {
			...input.result,
			receipt: {
				id: receipt.id,
				status: "SUCCEEDED",
				operationKey: input.operationKey,
			},
		};
		await tx.actionReceipt.update({
			where: { id: receipt.id },
			data: { result: result as Prisma.InputJsonValue },
		});
		return result;
	}

	private async ensureOutreachWork(
		tx: Prisma.TransactionClient,
		input: {
			prospectId: string;
			userId: string;
			subjectLabel: string;
			reason: string;
			primaryAction: string;
		},
	): Promise<void> {
		const existing = await tx.workItem.findFirst({
			where: {
				subjectType: "PROSPECT",
				subjectId: input.prospectId,
				queue: "outreach",
				state: { notIn: ["DONE", "DISMISSED"] },
			},
			select: { id: true },
		});
		if (existing) return;
		await tx.workItem.create({
			data: {
				subjectType: "PROSPECT",
				subjectId: input.prospectId,
				subjectLabel: input.subjectLabel,
				ownerId: input.userId,
				queue: "outreach",
				urgency: "HIGH",
				reason: input.reason,
				primaryAction: input.primaryAction,
				evidence: {
					source: "outreach.prepare",
					prospectId: input.prospectId,
				},
			},
		});
	}

	private async completeOutreachWork(
		tx: Prisma.TransactionClient,
		prospectId: string,
		now: Date,
		evidence: Record<string, unknown>,
	): Promise<void> {
		await tx.workItem.updateMany({
			where: {
				subjectType: "PROSPECT",
				subjectId: prospectId,
				queue: "outreach",
				state: { notIn: ["DONE", "DISMISSED"] },
			},
			data: {
				state: "DONE",
				completedAt: now,
				nextReviewAt: null,
				version: { increment: 1 },
				evidence: {
					source: "outreach.sequence.approve",
					...evidence,
					completedAt: now.toISOString(),
				},
			},
		});
	}

	private async dismissOutreachWork(
		tx: Prisma.TransactionClient,
		prospectId: string,
		now: Date,
		evidence: Record<string, unknown>,
	): Promise<void> {
		await tx.workItem.updateMany({
			where: {
				subjectType: "PROSPECT",
				subjectId: prospectId,
				queue: "outreach",
				state: { notIn: ["DONE", "DISMISSED"] },
			},
			data: {
				state: "DISMISSED",
				completedAt: now,
				nextReviewAt: null,
				version: { increment: 1 },
				evidence: {
					source: "outreach.sequence.stop",
					...evidence,
					completedAt: now.toISOString(),
				},
			},
		});
	}

	private async invalidateOutreachApprovals(
		tx: Prisma.TransactionClient,
		prospectId: string,
	): Promise<void> {
		await tx.approvalRequest.updateMany({
			where: {
				targetType: "PROSPECT",
				targetId: prospectId,
				action: { startsWith: "outreach." },
				status: { in: ["PENDING", "APPROVED"] },
			},
			data: {
				status: "INVALIDATED",
				invalidationVersion: { increment: 1 },
				version: { increment: 1 },
				decidedAt: new Date(),
			},
		});
	}

	private async cancelDraftTasks(
		tx: Prisma.TransactionClient,
		input: {
			draftIds?: string[];
			prospectId?: string;
			outcome: string;
		},
	): Promise<void> {
		const draftIds =
			input.draftIds ??
			(
				await tx.emailDraft.findMany({
					where: { prospectId: input.prospectId },
					select: { id: true },
				})
			).map((draft) => draft.id);
		if (draftIds.length === 0) return;
		await tx.agentTask.updateMany({
			where: {
				kind: "email-draft-send",
				state: { notIn: TERMINAL_TASK_STATES },
				emailDraftId: { in: draftIds },
			},
			data: {
				state: "CANCELLED",
				finishedAt: new Date(),
				outcome: input.outcome,
			},
		});
	}

	private async sequenceApprovalGate(
		tx: Prisma.TransactionClient,
		input: {
			prospectId: string;
			sequenceId: string;
			drafts: {
				sequenceId: string | null;
				sequenceStep: number | null;
				status: EmailDraftStatus;
			}[];
			externalInboxId: string;
		},
	) {
		const prospect = await tx.prospect.findUnique({
			where: { id: input.prospectId },
			select: {
				id: true,
				status: true,
				routeStatus: true,
				enrichmentStatus: true,
				countryCode: true,
				website: true,
				namedPerson: true,
				role: true,
				personSourceUrl: true,
				routeEmail: true,
				emailAllowed: true,
				companyId: true,
				contactId: true,
				draftSubject: true,
				draftBody: true,
				lastResearchedAt: true,
				nextResearchAt: true,
				evidence: {
					select: {
						receiptId: true,
						sourceType: true,
						url: true,
						signalDate: true,
						observed: true,
					},
				},
			},
		});
		if (!prospect) throw new NotFoundException("Prospect not found.");
		const recipient = prospect.routeEmail?.trim().toLowerCase() ?? null;
		const domain = recipient ? emailDomain(recipient) : null;
		const [queued, suppressedContact, suppressedDomain, inbox] =
			await Promise.all([
				tx.agentTask.findFirst({
					where: {
						prospectId: input.prospectId,
						kind: "prospect-research",
						finishedAt: null,
					},
					select: { id: true },
				}),
				recipient
					? tx.suppressedContact.findUnique({ where: { email: recipient } })
					: null,
				domain ? tx.suppressedDomain.findUnique({ where: { domain } }) : null,
				tx.emailInbox.findFirst({
					where: {
						provider: "AGENTMAIL",
						externalInboxId: input.externalInboxId,
						isEnabled: true,
					},
					select: { id: true },
				}),
			]);
		const sendingPaused =
			process.env.PROVIDER_MUTATIONS_PAUSED?.trim().toLowerCase() !== "false" ||
			process.env.OUTREACH_SENDS_PAUSED?.trim().toLowerCase() !== "false";
		const readiness = buildProspectReadiness(
			{
				...prospect,
				queued: queued !== null,
				emailDrafts: input.drafts,
			},
			{
				sendingPaused,
				agentMailReady: inbox !== null,
				routeSuppressed: Boolean(suppressedContact || suppressedDomain),
			},
		);
		if (!readiness.sendEligible || !recipient || !inbox) {
			const gaps = readiness.gaps.map((gap) => gap.label).join(", ");
			throw new BadRequestException(
				`Sequence approval is blocked by current gates: ${gaps || readiness.summary}.`,
			);
		}
		return { readiness, recipient, inboxId: inbox.id };
	}

	private assertSequenceSchedule(
		drafts: Array<{
			sequenceStep: number | null;
			scheduledFor: Date | null;
		}>,
		now: Date,
	): void {
		const ordered = [...drafts].sort(
			(left, right) => (left.sequenceStep ?? 0) - (right.sequenceStep ?? 0),
		);
		if (
			ordered.length !== 3 ||
			ordered.some((draft, index) => draft.sequenceStep !== index + 1)
		) {
			throw new BadRequestException("Sequence steps must be 1, 2 and 3.");
		}
		let previous = 0;
		for (const draft of ordered) {
			const scheduledAt = draft.scheduledFor?.getTime();
			if (!scheduledAt) {
				throw new BadRequestException(
					"Every sequence step needs a proposed send time.",
				);
			}
			if (scheduledAt < now.getTime() - SCHEDULE_GRACE_MS) {
				throw new BadRequestException(
					"Sequence send proposals cannot be scheduled in the past.",
				);
			}
			if (previous > 0 && scheduledAt <= previous) {
				throw new BadRequestException(
					"Sequence send proposals must be in step order.",
				);
			}
			previous = scheduledAt;
		}
	}

	private async createApprovedSequenceApproval(
		tx: Prisma.TransactionClient,
		input: {
			prospectId: string;
			sequenceId: string;
			userId: string;
			now: Date;
			drafts: {
				id: string;
				sequenceStep: number | null;
				variant: OutreachVariant | null;
				experimentKey: string | null;
				recipients: Prisma.JsonValue;
				subject: string;
				plainTextBody: string;
				scheduledFor: Date | null;
			}[];
			readinessSummary: string;
			clientRequestId: string;
		},
	) {
		const expiresAt = new Date(input.now.getTime() + OUTREACH_APPROVAL_TTL_MS);
		const contentSnapshot = {
			kind: "outreach-sequence",
			sequenceId: input.sequenceId,
			prospectId: input.prospectId,
			readinessSummary: input.readinessSummary,
			steps: input.drafts.map((draft) => ({
				id: draft.id,
				step: draft.sequenceStep,
				variant: draft.variant,
				experimentKey: draft.experimentKey,
				recipients: draft.recipients,
				subject: draft.subject,
				plainTextBody: draft.plainTextBody,
				scheduledFor: draft.scheduledFor?.toISOString() ?? null,
			})),
		};
		const contentDigest = approvalContentDigest({
			action: OUTREACH_SEQUENCE_APPROVAL_ACTION,
			contentSnapshot,
			targetType: "PROSPECT",
			targetId: input.prospectId,
			risk: "MEDIUM",
			policyVersion: OUTREACH_POLICY_VERSION,
			expiresAt,
			invalidationVersion: 0,
		});
		const approval = await tx.approvalRequest.create({
			data: {
				action: OUTREACH_SEQUENCE_APPROVAL_ACTION,
				contentDigest,
				contentSnapshot: contentSnapshot as Prisma.InputJsonValue,
				targetType: "PROSPECT",
				targetId: input.prospectId,
				targetLabel: `Outreach sequence ${input.sequenceId}`,
				risk: "MEDIUM",
				policyVersion: OUTREACH_POLICY_VERSION,
				requestorId: input.userId,
				approverId: input.userId,
				expiresAt,
				status: "APPROVED",
				decidedAt: input.now,
				version: 1,
				idempotencyKey: `outreach-approval:${input.sequenceId}:${contentDigest}`,
			},
			select: { id: true, contentDigest: true, version: true },
		});
		const receipt = await tx.actionReceipt.create({
			data: {
				idempotencyKey: `outreach-approval-receipt:${input.clientRequestId}`,
				requestHash: contentDigest,
				provider: OUTREACH_PROVIDER,
				channel: OUTREACH_CHANNEL,
				operationKey: "outreach.sequence.approval-receipt",
				status: "SUCCEEDED",
				approvalRequestId: approval.id,
				completedAt: input.now,
				result: {
					sequenceId: input.sequenceId,
					approved: input.drafts.length,
					approvalRequestId: approval.id,
					contentDigest,
				},
			},
			select: { id: true },
		});
		return {
			id: approval.id,
			contentDigest: approval.contentDigest,
			version: approval.version,
			receipt: {
				id: receipt.id,
				status: "SUCCEEDED" as const,
				operationKey: "outreach.sequence.approval-receipt",
			},
		};
	}

	async performance() {
		const rows = await this.db.emailDraft.findMany({
			where: { variant: { not: null }, sequenceStep: 1 },
			select: {
				variant: true,
				status: true,
				sentAt: true,
				thread: {
					select: {
						messages: {
							where: { direction: "INBOUND" },
							select: { id: true },
							take: 1,
						},
					},
				},
			},
		});
		return (["A", "B", "C"] as OutreachVariant[]).map((variant) => {
			const assigned = rows.filter((row) => row.variant === variant);
			const sent = assigned.filter((row) => row.sentAt).length;
			const replies = assigned.filter(
				(row) => row.thread?.messages.length,
			).length;
			return {
				variant,
				assigned: assigned.length,
				sent,
				replies,
				replyRate: sent === 0 ? null : replies / sent,
			};
		});
	}

	async sequences() {
		const sendingPaused =
			process.env.PROVIDER_MUTATIONS_PAUSED?.trim().toLowerCase() !== "false" ||
			process.env.OUTREACH_SENDS_PAUSED?.trim().toLowerCase() !== "false";
		const drafts = await this.db.emailDraft.findMany({
			where: { sequenceId: { not: null } },
			orderBy: [{ updatedAt: "desc" }, { sequenceStep: "asc" }],
			select: {
				id: true,
				sequenceId: true,
				sequenceStep: true,
				status: true,
				variant: true,
				subject: true,
				scheduledFor: true,
				sentAt: true,
				sendError: true,
				externalInboxId: true,
				recipients: true,
				approvalDigest: true,
				updatedAt: true,
				inbox: {
					select: { isEnabled: true, lastError: true },
				},
				events: {
					where: { eventType: { in: ["BOUNCED", "COMPLAINED", "REJECTED"] } },
					orderBy: { createdAt: "desc" },
					take: 1,
					select: { eventType: true },
				},
				prospect: {
					select: {
						id: true,
						companyName: true,
						namedPerson: true,
						countryCode: true,
						routeEmail: true,
					},
				},
				thread: {
					select: {
						messages: {
							where: { direction: "INBOUND" },
							select: { id: true, sentAt: true },
							orderBy: { sentAt: "desc" },
							take: 1,
						},
					},
				},
			},
		});
		const grouped = new Map<string, typeof drafts>();
		for (const draft of drafts) {
			if (!draft.sequenceId) continue;
			const rows = grouped.get(draft.sequenceId) ?? [];
			rows.push(draft);
			grouped.set(draft.sequenceId, rows);
		}
		const routeEmails = [
			...new Set(
				drafts
					.map((draft) => normalizeEmail(draft.prospect?.routeEmail ?? ""))
					.filter((email): email is string => email !== null),
			),
		];
		const routeDomains = [
			...new Set(
				routeEmails
					.map((email) => emailDomain(email))
					.filter((domain): domain is string => domain !== null),
			),
		];
		const prospectIds = [
			...new Set(
				drafts
					.map((draft) => draft.prospect?.id)
					.filter((id): id is string => Boolean(id)),
			),
		];
		const [suppressedContacts, suppressedDomains, approvals] =
			await Promise.all([
				routeEmails.length > 0
					? this.db.suppressedContact.findMany({
							where: { email: { in: routeEmails } },
							select: { email: true },
						})
					: [],
				routeDomains.length > 0
					? this.db.suppressedDomain.findMany({
							where: { domain: { in: routeDomains } },
							select: { domain: true },
						})
					: [],
				prospectIds.length > 0
					? this.db.approvalRequest.findMany({
							where: {
								targetType: "PROSPECT",
								targetId: { in: prospectIds },
								action: OUTREACH_SEQUENCE_APPROVAL_ACTION,
							},
							orderBy: { updatedAt: "desc" },
							select: {
								status: true,
								expiresAt: true,
								contentSnapshot: true,
							},
						})
					: [],
			]);
		const suppressedEmailSet = new Set(
			suppressedContacts
				.map((row) => normalizeEmail(row.email))
				.filter((email): email is string => email !== null),
		);
		const suppressedDomainSet = new Set(
			suppressedDomains.map((row) => row.domain),
		);
		const approvalBySequence = new Map<
			string,
			{ status: string; expiresAt: Date }
		>();
		for (const approval of approvals) {
			const sequenceId = approvalSnapshotSequenceId(approval.contentSnapshot);
			if (sequenceId && !approvalBySequence.has(sequenceId)) {
				approvalBySequence.set(sequenceId, {
					status: approval.status,
					expiresAt: approval.expiresAt,
				});
			}
		}
		const now = new Date();

		return [...grouped.entries()]
			.map(([sequenceId, rows]) => {
				const ordered = [...rows].sort(
					(a, b) => (a.sequenceStep ?? 0) - (b.sequenceStep ?? 0),
				);
				const statuses = new Set(ordered.map((row) => row.status));
				const replied = ordered.some((row) => row.thread?.messages.length);
				const routeEmail = normalizeEmail(
					ordered[0]?.prospect?.routeEmail ?? "",
				);
				const routeDomain = routeEmail ? emailDomain(routeEmail) : null;
				const routeSuppressed = Boolean(
					routeEmail &&
						(suppressedEmailSet.has(routeEmail) ||
							(routeDomain && suppressedDomainSet.has(routeDomain))),
				);
				const approval = approvalBySequence.get(sequenceId) ?? null;
				const stepReasons = ordered.map((row) =>
					outreachStepStopReason({
						status: row.status,
						sendError: row.sendError,
						hasInboundReply: Boolean(row.thread?.messages.length),
						events: row.events,
					}),
				);
				const firstStepReason =
					stepReasons.find((reason): reason is string => Boolean(reason)) ??
					null;
				const executionDisabledReason =
					firstStepReason ??
					outreachExecutionDisabledReason({
						approvalStatus: approval?.status ?? null,
						approvalExpired: Boolean(approval && approval.expiresAt <= now),
						sendingPaused,
						inboxEnabled: ordered.every((row) => row.inbox.isEnabled),
						inboxError:
							ordered.find((row) => row.inbox.lastError)?.inbox.lastError ??
							null,
						routeSuppressed,
						hasApprovalDigest: ordered.every((row) => row.approvalDigest),
					});
				const executionDisabled = executionDisabledReason !== null;
				const state = replied
					? "REPLIED"
					: firstStepReason || routeSuppressed
						? "STOPPED"
						: statuses.has("SENDING")
							? "ACTIVE"
							: statuses.has("APPROVED")
								? "APPROVED"
								: statuses.has("SENT")
									? "SENT"
									: statuses.size === 1 && statuses.has("REJECTED")
										? "STOPPED"
										: "REVIEW";
				return {
					sequenceId,
					state,
					stopReason: firstStepReason,
					executionDisabled,
					executionDisabledReason,
					variant: ordered[0]?.variant ?? null,
					prospect: ordered[0]?.prospect ?? null,
					updatedAt:
						ordered[0]?.updatedAt.toISOString() ?? new Date(0).toISOString(),
					steps: ordered.map((row, index) => ({
						id: row.id,
						step: row.sequenceStep,
						status: row.status,
						subject: row.subject,
						scheduledFor: row.scheduledFor?.toISOString() ?? null,
						sentAt: row.sentAt?.toISOString() ?? null,
						sendError: row.sendError,
						stopReason: stepReasons[index],
					})),
				};
			})
			.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
	}
}
