import { createHash } from "node:crypto";
import { type Db, type Prisma } from "@crm/db";
import { approvalContentDigest } from "@crm/db/approval";
import { lockIdempotencyKey } from "@crm/db/idempotency";
import {
	BadRequestException,
	ConflictException,
	Injectable,
	NotFoundException,
} from "@nestjs/common";
import { InjectDatabase } from "../database/database.constants";
import { kernelRequestHash } from "../operating-kernel/kernel-idempotency.service";
import { OperatingKernelAccessService } from "../operating-kernel/operating-kernel-access.service";
import {
	countsByKey,
	FACET_ALL,
	type ListResult,
	paginate,
	resolveOrderBy,
} from "../trpc/list-input";
import type {
	ServiceListInput,
	ServiceRecoverInboundInput,
} from "./service.contracts";

const SERVICE_PROVIDER = "lode-crm";
const SERVICE_CHANNEL = "service";
const SERVICE_RECOVERY_OPERATION = "service.inbound.recover";
const SERVICE_REPLY_APPROVAL_ACTION = "service.reply.approve";
const SERVICE_POLICY_VERSION = "service-reply-local-v1";
const SUPPORT_WORK_STATE = [
	"OPEN",
	"IN_PROGRESS",
	"WAITING",
	"BLOCKED",
] as const;
const CLOSED_CASE_STATES = ["RESOLVED", "CLOSED"] as const;

const OWNER_SELECT = {
	id: true,
	name: true,
	email: true,
	image: true,
} satisfies Prisma.UserSelect;

const CASE_SELECT = {
	id: true,
	customerAccountId: true,
	customerAccount: {
		select: {
			id: true,
			name: true,
			status: true,
			company: {
				select: {
					id: true,
					name: true,
					domain: true,
					iconUrl: true,
					iconDarkUrl: true,
					iconTone: true,
					logoUrl: true,
				},
			},
		},
	},
	dedupeKey: true,
	subjectType: true,
	subjectId: true,
	provider: true,
	externalId: true,
	channel: true,
	queue: true,
	title: true,
	description: true,
	status: true,
	priority: true,
	matchState: true,
	matchMethod: true,
	matchEvidence: true,
	matchedAt: true,
	ownerId: true,
	owner: { select: OWNER_SELECT },
	slaPolicy: {
		select: {
			id: true,
			policyKey: true,
			name: true,
			channel: true,
			priority: true,
			firstResponseMinutes: true,
			resolutionMinutes: true,
			status: true,
		},
	},
	openedAt: true,
	firstResponseAt: true,
	dueAt: true,
	resolvedAt: true,
	sources: {
		orderBy: [{ receivedAt: "desc" }, { id: "asc" }],
		take: 12,
		select: {
			id: true,
			source: true,
			externalId: true,
			url: true,
			contentHash: true,
			payload: true,
			receivedAt: true,
			createdAt: true,
		},
	},
	events: {
		orderBy: [{ occurredAt: "desc" }, { id: "asc" }],
		take: 25,
		select: {
			id: true,
			eventType: true,
			actorType: true,
			actorId: true,
			body: true,
			data: true,
			occurredAt: true,
			createdAt: true,
		},
	},
	triageProposals: {
		orderBy: [{ createdAt: "desc" }, { id: "asc" }],
		take: 10,
		select: {
			id: true,
			queue: true,
			priority: true,
			category: true,
			reason: true,
			evidence: true,
			status: true,
			createdAt: true,
			updatedAt: true,
		},
	},
	replyDrafts: {
		orderBy: [{ createdAt: "desc" }, { id: "asc" }],
		take: 10,
		select: {
			id: true,
			channel: true,
			provider: true,
			recipients: true,
			subject: true,
			body: true,
			contentDigest: true,
			status: true,
			approvalRequestId: true,
			idempotencyKey: true,
			sentAt: true,
			errorMessage: true,
			createdAt: true,
			updatedAt: true,
		},
	},
	escalations: {
		orderBy: [{ createdAt: "desc" }, { id: "asc" }],
		take: 10,
		select: {
			id: true,
			queue: true,
			severity: true,
			reason: true,
			status: true,
			dueAt: true,
			resolvedAt: true,
			createdAt: true,
			updatedAt: true,
		},
	},
	productHandoffs: {
		orderBy: [{ createdAt: "desc" }, { id: "asc" }],
		take: 10,
		select: {
			id: true,
			productArea: true,
			summary: true,
			impact: true,
			status: true,
			externalKey: true,
			createdAt: true,
			updatedAt: true,
		},
	},
	_count: {
		select: {
			sources: true,
			events: true,
			triageProposals: true,
			replyDrafts: true,
			escalations: true,
			productHandoffs: true,
		},
	},
	createdAt: true,
	updatedAt: true,
} satisfies Prisma.SupportCaseSelect;

type SupportCaseRecord = Prisma.SupportCaseGetPayload<{
	select: typeof CASE_SELECT;
}>;

type InboundSource = {
	sourceType: ServiceRecoverInboundInput["sourceType"];
	source: string;
	provider: string;
	channel: string;
	externalId: string;
	url: string | null;
	title: string;
	description: string | null;
	receivedAt: Date;
	contentHash: string;
	payload: Prisma.InputJsonObject;
	companyId: string | null;
	contactId: string | null;
	customerAccountId: string | null;
	routeEmail: string | null;
	routeName: string | null;
	dedupeSubject: string;
};

type ServiceRecoveryPayload = {
	supportCaseId: string;
	workItemId: string;
	approvalRequestId: string;
	replyDraftId: string;
	sourceType: InboundSource["sourceType"];
	source: string;
	sourceExternalId: string;
	customerAccountId: string | null;
	providerMutationDisabled: true;
	customerReplySendDisabled: true;
	modelExecutionDisabled: true;
};

type ServiceRecoveryResult = ServiceRecoveryPayload & {
	receipt: {
		id: string;
		status: string;
		operationKey: typeof SERVICE_RECOVERY_OPERATION;
		completedAt: string | null;
	};
};

type SupportMatchCreateFields = Pick<
	Prisma.SupportCaseUncheckedCreateInput,
	"matchState" | "matchMethod" | "matchEvidence" | "matchedAt" | "matchedById"
>;

const SORTABLE: Record<
	string,
	(dir: Prisma.SortOrder) => Prisma.SupportCaseOrderByWithRelationInput[]
> = {
	updatedAt: (dir) => [{ updatedAt: dir }],
	openedAt: (dir) => [{ openedAt: dir }],
	dueAt: (dir) => [{ dueAt: dir }],
	status: (dir) => [{ status: dir }, { updatedAt: "desc" }],
	priority: (dir) => [{ priority: dir }, { dueAt: "asc" }],
	customer: (dir) => [
		{ customerAccount: { name: dir } },
		{ updatedAt: "desc" },
	],
};

function iso(value: Date | null): string | null {
	return value?.toISOString() ?? null;
}

function objectValue(value: unknown): Record<string, unknown> {
	return value && typeof value === "object" && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: {};
}

function stringValue(value: unknown): string | null {
	if (typeof value !== "string") return null;
	const trimmed = value.trim();
	return trimmed.length > 0 ? trimmed : null;
}

function firstString(value: unknown, keys: readonly string[]): string | null {
	const record = objectValue(value);
	for (const key of keys) {
		const candidate = stringValue(record[key]);
		if (candidate) return candidate;
	}
	return null;
}

function hashValue(value: unknown): string {
	return createHash("sha256")
		.update(JSON.stringify(canonicalize(value)))
		.digest("hex");
}

function canonicalize(value: unknown): unknown {
	if (value instanceof Date) return value.toISOString();
	if (Array.isArray(value)) return value.map(canonicalize);
	if (value && typeof value === "object") {
		return Object.fromEntries(
			Object.entries(value)
				.sort(([left], [right]) => left.localeCompare(right))
				.map(([key, entry]) => [key, canonicalize(entry)]),
		);
	}
	return value;
}

function normalizeSubject(value: string | null): string {
	return (value ?? "untitled")
		.toLocaleLowerCase()
		.replace(/^(re|fw|fwd):\s*/i, "")
		.replace(/\s+/g, " ")
		.trim();
}

function label(value: string): string {
	return value
		.toLocaleLowerCase()
		.replaceAll("_", " ")
		.replace(/(^| )\S/g, (letter) => letter.toUpperCase());
}

function replyRecipients(routeEmail: string | null, routeName: string | null) {
	return {
		to: routeEmail ? [{ email: routeEmail, name: routeName }] : [],
		verifiedRoute: Boolean(routeEmail),
	};
}

function hasRoute(value: Prisma.JsonValue): boolean {
	const object = objectValue(value);
	const to = object.to;
	return Array.isArray(to) && to.length > 0;
}

function providerPaused(): boolean {
	return (
		process.env.PROVIDER_MUTATIONS_PAUSED?.trim().toLowerCase() !== "false"
	);
}

function disabledReasons(row: SupportCaseRecord): string[] {
	const reasons = [
		"Service reply sending is disabled in this local foundation.",
	];
	if (providerPaused()) reasons.push("Global provider mutations are paused.");
	else reasons.push("No customer-service provider executor is enabled.");
	if (row.matchState !== "MATCHED") {
		reasons.push(
			"Customer identity must be matched before any reply can send.",
		);
	}
	if (!row.replyDrafts.some((draft) => draft.status === "APPROVED")) {
		reasons.push("A human-approved reply draft is required.");
	}
	if (!row.replyDrafts.some((draft) => hasRoute(draft.recipients))) {
		reasons.push("No verified customer reply route is available.");
	}
	if (!row.slaPolicy) reasons.push("No active SLA policy is linked.");
	return reasons;
}

function serializeCase(
	row: SupportCaseRecord,
	openWorkCount: number,
	pendingApprovalCount: number,
) {
	return {
		id: row.id,
		customerAccount: row.customerAccount,
		dedupeKey: row.dedupeKey,
		subjectType: row.subjectType,
		subjectId: row.subjectId,
		provider: row.provider,
		externalId: row.externalId,
		channel: row.channel,
		queue: row.queue,
		title: row.title,
		description: row.description,
		status: row.status,
		priority: row.priority,
		matchState: row.matchState,
		matchMethod: row.matchMethod,
		matchEvidence: row.matchEvidence,
		matchedAt: iso(row.matchedAt),
		owner: row.owner,
		slaPolicy: row.slaPolicy,
		openedAt: row.openedAt.toISOString(),
		firstResponseAt: iso(row.firstResponseAt),
		dueAt: iso(row.dueAt),
		resolvedAt: iso(row.resolvedAt),
		sources: row.sources.map((source) => ({
			...source,
			receivedAt: source.receivedAt.toISOString(),
			createdAt: source.createdAt.toISOString(),
		})),
		events: row.events.map((event) => ({
			...event,
			occurredAt: event.occurredAt.toISOString(),
			createdAt: event.createdAt.toISOString(),
		})),
		triageProposals: row.triageProposals.map((proposal) => ({
			...proposal,
			createdAt: proposal.createdAt.toISOString(),
			updatedAt: proposal.updatedAt.toISOString(),
		})),
		replyDrafts: row.replyDrafts.map((draft) => ({
			...draft,
			sentAt: iso(draft.sentAt),
			createdAt: draft.createdAt.toISOString(),
			updatedAt: draft.updatedAt.toISOString(),
		})),
		escalations: row.escalations.map((escalation) => ({
			...escalation,
			dueAt: iso(escalation.dueAt),
			resolvedAt: iso(escalation.resolvedAt),
			createdAt: escalation.createdAt.toISOString(),
			updatedAt: escalation.updatedAt.toISOString(),
		})),
		productHandoffs: row.productHandoffs.map((handoff) => ({
			...handoff,
			createdAt: handoff.createdAt.toISOString(),
			updatedAt: handoff.updatedAt.toISOString(),
		})),
		counts: {
			sources: row._count.sources,
			events: row._count.events,
			triageProposals: row._count.triageProposals,
			replyDrafts: row._count.replyDrafts,
			escalations: row._count.escalations,
			productHandoffs: row._count.productHandoffs,
			openWork: openWorkCount,
			pendingApprovals: pendingApprovalCount,
		},
		disabledReasons: disabledReasons(row),
		createdAt: row.createdAt.toISOString(),
		updatedAt: row.updatedAt.toISOString(),
	};
}

function sourcePayload(value: Record<string, unknown>): Prisma.InputJsonObject {
	return value as Prisma.InputJsonObject;
}

function receiptPayload(
	source: InboundSource,
	caseId: string,
	workItemId: string,
	approvalRequestId: string,
	replyDraftId: string,
): ServiceRecoveryPayload {
	return {
		supportCaseId: caseId,
		workItemId,
		approvalRequestId,
		replyDraftId,
		sourceType: source.sourceType,
		source: source.source,
		sourceExternalId: source.externalId,
		customerAccountId: source.customerAccountId,
		providerMutationDisabled: true,
		customerReplySendDisabled: true,
		modelExecutionDisabled: true,
	};
}

@Injectable()
export class ServiceService {
	constructor(
		@InjectDatabase() private readonly db: Db,
		private readonly access: OperatingKernelAccessService,
	) {}

	async list(
		input: ServiceListInput,
	): Promise<ListResult<ReturnType<typeof serializeCase>>> {
		const where = this.buildWhere(input);
		const { skip, take } = paginate(input);
		const [rows, total, statuses, priorities, matchStates, queues, customers] =
			await Promise.all([
				this.db.supportCase.findMany({
					where,
					orderBy: [
						...resolveOrderBy(input, SORTABLE, [{ updatedAt: "desc" }]),
						{ id: input.dir },
					],
					skip,
					take,
					select: CASE_SELECT,
				}),
				this.db.supportCase.count({ where }),
				this.db.supportCase.groupBy({
					by: ["status"],
					where,
					_count: { _all: true },
				}),
				this.db.supportCase.groupBy({
					by: ["priority"],
					where,
					_count: { _all: true },
				}),
				this.db.supportCase.groupBy({
					by: ["matchState"],
					where,
					_count: { _all: true },
				}),
				this.db.supportCase.groupBy({
					by: ["queue"],
					where,
					_count: { _all: true },
				}),
				this.db.supportCase.groupBy({
					by: ["customerAccountId"],
					where,
					_count: { _all: true },
				}),
			]);
		const counts = await this.kernelCounts(rows);
		return {
			rows: rows.map((row) =>
				serializeCase(
					row,
					counts.openWork.get(row.id) ?? 0,
					counts.pendingApprovals.get(row.id) ?? 0,
				),
			),
			total,
			facetCounts: {
				status: countsByKey(statuses, "status"),
				priority: countsByKey(priorities, "priority"),
				matchState: countsByKey(matchStates, "matchState"),
				queue: countsByKey(queues, "queue", "unassigned"),
				customer: countsByKey(customers, "customerAccountId", "unmatched"),
			},
		};
	}

	async byId(id: string) {
		const row = await this.db.supportCase.findUnique({
			where: { id },
			select: CASE_SELECT,
		});
		if (!row) throw new NotFoundException(`No support case with id ${id}.`);

		const [counts, work, approvals, receipts] = await Promise.all([
			this.kernelCounts([row]),
			this.db.workItem.findMany({
				where: { subjectType: "SUPPORT_CASE", subjectId: id },
				orderBy: [{ updatedAt: "desc" }, { id: "asc" }],
				take: 25,
				select: {
					id: true,
					queue: true,
					state: true,
					urgency: true,
					reason: true,
					primaryAction: true,
					evidence: true,
					updatedAt: true,
				},
			}),
			this.db.approvalRequest.findMany({
				where: { targetType: "SUPPORT_CASE", targetId: id },
				orderBy: [{ requestedAt: "desc" }, { id: "asc" }],
				take: 25,
				select: {
					id: true,
					action: true,
					status: true,
					risk: true,
					contentDigest: true,
					contentSnapshot: true,
					expiresAt: true,
					requestedAt: true,
				},
			}),
			this.receiptsFor(id),
		]);

		return {
			...serializeCase(
				row,
				counts.openWork.get(row.id) ?? 0,
				counts.pendingApprovals.get(row.id) ?? 0,
			),
			work: work.map((item) => ({
				...item,
				updatedAt: item.updatedAt.toISOString(),
			})),
			approvals: approvals.map((approval) => ({
				...approval,
				expiresAt: approval.expiresAt.toISOString(),
				requestedAt: approval.requestedAt.toISOString(),
			})),
			receipts,
		};
	}

	async recoverInbound(
		input: ServiceRecoverInboundInput,
		userId: string,
	): Promise<ServiceRecoveryResult> {
		await this.access.assertMember(userId);
		const source = await this.loadSource(input);
		const sourceWithCustomer = await this.bindCustomer(source, input);
		const requestHash = kernelRequestHash({
			actorId: userId,
			operation: SERVICE_RECOVERY_OPERATION,
			sourceType: input.sourceType,
			sourceId: input.sourceId,
			customerAccountId: sourceWithCustomer.customerAccountId,
		});

		return this.db.$transaction(async (tx) => {
			await lockIdempotencyKey(tx, input.clientRequestId);
			const replay = await this.replayRecovery(tx, {
				key: input.clientRequestId,
				requestHash,
			});
			if (replay) return replay;

			const result = await this.recoverSource(tx, {
				source: sourceWithCustomer,
				userId,
			});
			const receipt = await tx.actionReceipt.create({
				data: {
					idempotencyKey: input.clientRequestId,
					requestHash,
					provider: SERVICE_PROVIDER,
					channel: SERVICE_CHANNEL,
					operationKey: SERVICE_RECOVERY_OPERATION,
					status: "SUCCEEDED",
					completedAt: new Date(),
					result: result as Prisma.InputJsonValue,
				},
				select: { id: true, status: true, completedAt: true },
			});
			return {
				...result,
				receipt: {
					id: receipt.id,
					status: receipt.status,
					operationKey: SERVICE_RECOVERY_OPERATION,
					completedAt: receipt.completedAt?.toISOString() ?? null,
				},
			};
		});
	}

	private buildWhere(input: ServiceListInput): Prisma.SupportCaseWhereInput {
		const where: Prisma.SupportCaseWhereInput = {};
		if (input.status !== FACET_ALL) where.status = input.status;
		if (input.priority !== FACET_ALL) where.priority = input.priority;
		if (input.matchState !== FACET_ALL) where.matchState = input.matchState;
		if (input.queue !== FACET_ALL) {
			where.queue = input.queue === "unassigned" ? null : input.queue;
		}
		if (input.customer !== FACET_ALL) {
			where.customerAccountId =
				input.customer === "unmatched" ? null : input.customer;
		}
		if (input.q) {
			where.OR = [
				{ title: { contains: input.q, mode: "insensitive" } },
				{ description: { contains: input.q, mode: "insensitive" } },
				{
					customerAccount: {
						name: { contains: input.q, mode: "insensitive" },
					},
				},
				{
					customerAccount: {
						company: {
							name: { contains: input.q, mode: "insensitive" },
						},
					},
				},
				{
					sources: {
						some: { externalId: { contains: input.q, mode: "insensitive" } },
					},
				},
			];
		}
		return where;
	}

	private async kernelCounts(rows: SupportCaseRecord[]) {
		const caseIds = rows.map((row) => row.id);
		if (caseIds.length === 0) {
			return {
				openWork: new Map<string, number>(),
				pendingApprovals: new Map<string, number>(),
			};
		}
		const [work, approvals] = await Promise.all([
			this.db.workItem.groupBy({
				by: ["subjectId"],
				where: {
					subjectType: "SUPPORT_CASE",
					subjectId: { in: caseIds },
					state: { in: [...SUPPORT_WORK_STATE] },
				},
				_count: { _all: true },
			}),
			this.db.approvalRequest.groupBy({
				by: ["targetId"],
				where: {
					targetType: "SUPPORT_CASE",
					targetId: { in: caseIds },
					status: "PENDING",
				},
				_count: { _all: true },
			}),
		]);
		return {
			openWork: new Map(work.map((row) => [row.subjectId, row._count._all])),
			pendingApprovals: new Map(
				approvals.map((row) => [row.targetId, row._count._all]),
			),
		};
	}

	private async receiptsFor(caseId: string) {
		const receipts = await this.db.actionReceipt.findMany({
			where: {
				provider: SERVICE_PROVIDER,
				channel: SERVICE_CHANNEL,
				operationKey: SERVICE_RECOVERY_OPERATION,
			},
			orderBy: [{ createdAt: "desc" }, { id: "asc" }],
			take: 100,
			select: {
				id: true,
				operationKey: true,
				status: true,
				provider: true,
				channel: true,
				result: true,
				completedAt: true,
				createdAt: true,
			},
		});
		return receipts
			.filter((receipt) => objectValue(receipt.result).supportCaseId === caseId)
			.map((receipt) => ({
				...receipt,
				completedAt: iso(receipt.completedAt),
				createdAt: receipt.createdAt.toISOString(),
			}));
	}

	private async replayRecovery(
		tx: Prisma.TransactionClient,
		input: { key: string; requestHash: string },
	): Promise<ServiceRecoveryResult | null> {
		const receipt = await tx.actionReceipt.findUnique({
			where: { idempotencyKey: input.key },
			select: {
				provider: true,
				channel: true,
				requestHash: true,
				operationKey: true,
				status: true,
				result: true,
				id: true,
				completedAt: true,
			},
		});
		if (!receipt) return null;
		if (
			receipt.provider !== SERVICE_PROVIDER ||
			receipt.channel !== SERVICE_CHANNEL ||
			receipt.operationKey !== SERVICE_RECOVERY_OPERATION ||
			receipt.requestHash !== input.requestHash
		) {
			throw new ConflictException(
				"That client request id has already been used.",
			);
		}
		if (receipt.status !== "SUCCEEDED" || receipt.result == null) {
			throw new ConflictException("That client request is not replayable.");
		}
		return {
			...(receipt.result as ServiceRecoveryPayload),
			receipt: {
				id: receipt.id,
				status: receipt.status,
				operationKey: SERVICE_RECOVERY_OPERATION,
				completedAt: receipt.completedAt?.toISOString() ?? null,
			},
		};
	}

	private async recoverSource(
		tx: Prisma.TransactionClient,
		input: { source: InboundSource; userId: string },
	): Promise<ServiceRecoveryPayload> {
		const existingSource = await tx.supportCaseSource.findFirst({
			where: {
				source: input.source.source,
				externalId: input.source.externalId,
			},
			select: { caseId: true },
		});
		if (existingSource) {
			const caseRow = await tx.supportCase.findUniqueOrThrow({
				where: { id: existingSource.caseId },
				select: { id: true },
			});
			const work = await this.ensureSupportWork(tx, {
				caseId: caseRow.id,
				title: input.source.title,
				userId: input.userId,
				source: input.source,
			});
			const approval = await this.ensureReplyDraftApproval(tx, {
				caseId: caseRow.id,
				title: input.source.title,
				userId: input.userId,
				source: input.source,
			});
			return receiptPayload(
				input.source,
				caseRow.id,
				work.id,
				approval.approvalRequestId,
				approval.replyDraftId,
			);
		}

		const dedupeKey = this.dedupeKey(input.source);
		const now = new Date();
		const matched = Boolean(input.source.customerAccountId);
		const slaPolicy = await this.matchSlaPolicy(tx, input.source);
		const dueAt = slaPolicy
			? new Date(
					input.source.receivedAt.getTime() +
						slaPolicy.firstResponseMinutes * 60_000,
				)
			: null;
		const matchData: SupportMatchCreateFields = matched
			? ({
					matchState: "MATCHED",
					matchMethod: "customer-account-link",
					matchEvidence: {
						customerAccountId: input.source.customerAccountId,
						sourceType: input.source.sourceType,
						sourceId: input.source.externalId,
					} satisfies Prisma.InputJsonObject,
					matchedAt: now,
					matchedById: input.userId,
				} satisfies SupportMatchCreateFields)
			: ({ matchState: "UNMATCHED" } satisfies SupportMatchCreateFields);
		const existingCase = await tx.supportCase.findUnique({
			where: { dedupeKey },
			select: { id: true, status: true },
		});
		const reopened = Boolean(
			existingCase &&
				CLOSED_CASE_STATES.some((state) => state === existingCase.status),
		);

		const caseRow = existingCase
			? await tx.supportCase.update({
					where: { id: existingCase.id },
					data: {
						status: reopened ? "OPEN" : undefined,
						resolvedAt: reopened ? null : undefined,
						updatedAt: now,
					},
					select: { id: true },
				})
			: await tx.supportCase.create({
					data: {
						customerAccountId: input.source.customerAccountId,
						dedupeKey,
						subjectType: input.source.companyId ? "COMPANY" : null,
						subjectId: input.source.companyId,
						provider: input.source.provider,
						externalId: dedupeKey,
						channel: input.source.channel,
						queue: "service",
						title: input.source.title,
						description: input.source.description,
						status: "NEW",
						priority: "NORMAL",
						...matchData,
						slaPolicyId: slaPolicy?.id ?? null,
						openedAt: input.source.receivedAt,
						dueAt,
					},
					select: { id: true },
				});

		await tx.supportCaseSource.create({
			data: {
				caseId: caseRow.id,
				source: input.source.source,
				externalId: input.source.externalId,
				url: input.source.url,
				contentHash: input.source.contentHash,
				payload: input.source.payload,
				receivedAt: input.source.receivedAt,
			},
		});
		if (!existingCase) {
			await tx.supportCaseEvent.create({
				data: {
					caseId: caseRow.id,
					eventType: "CREATED",
					actorType: "SYSTEM",
					body: "Service case recovered from stored inbound source.",
					data: sourcePayload({
						source: input.source.source,
						externalId: input.source.externalId,
						customerReplySendDisabled: true,
					}),
					occurredAt: now,
				},
			});
		}
		await tx.supportCaseEvent.create({
			data: {
				caseId: caseRow.id,
				eventType: "MESSAGE",
				actorType: "SOURCE",
				body: input.source.description ?? input.source.title,
				data: sourcePayload({
					source: input.source.source,
					externalId: input.source.externalId,
					contentHash: input.source.contentHash,
				}),
				occurredAt: input.source.receivedAt,
			},
		});
		if (reopened) {
			await tx.supportCaseEvent.create({
				data: {
					caseId: caseRow.id,
					eventType: "STATUS_CHANGE",
					actorType: "SYSTEM",
					body: "Reopened because a new inbound source matched the case.",
					data: sourcePayload({
						from: existingCase?.status,
						to: "OPEN",
						source: input.source.source,
						externalId: input.source.externalId,
					}),
					occurredAt: now,
				},
			});
		}

		await tx.supportTriageProposal.upsert({
			where: { idempotencyKey: `service:triage:${caseRow.id}` },
			create: {
				caseId: caseRow.id,
				queue: "service",
				priority: "NORMAL",
				category: "inbound-recovery",
				reason:
					"Verify identity, SLA, customer-safe knowledge and escalation path before any customer-facing reply.",
				evidence: sourcePayload({
					source: input.source.source,
					externalId: input.source.externalId,
					customerMatched: matched,
					slaPolicyId: slaPolicy?.id ?? null,
					customerReplySendDisabled: true,
				}),
				idempotencyKey: `service:triage:${caseRow.id}`,
			},
			update: {
				evidence: sourcePayload({
					source: input.source.source,
					externalId: input.source.externalId,
					customerMatched: matched,
					slaPolicyId: slaPolicy?.id ?? null,
					customerReplySendDisabled: true,
				}),
			},
		});

		const work = await this.ensureSupportWork(tx, {
			caseId: caseRow.id,
			title: input.source.title,
			userId: input.userId,
			source: input.source,
		});
		const approval = await this.ensureReplyDraftApproval(tx, {
			caseId: caseRow.id,
			title: input.source.title,
			userId: input.userId,
			source: input.source,
		});
		return receiptPayload(
			input.source,
			caseRow.id,
			work.id,
			approval.approvalRequestId,
			approval.replyDraftId,
		);
	}

	private async ensureSupportWork(
		tx: Prisma.TransactionClient,
		input: {
			caseId: string;
			title: string;
			userId: string;
			source: InboundSource;
		},
	) {
		return tx.workItem.upsert({
			where: { id: `support-case:${input.caseId}:triage` },
			create: {
				id: `support-case:${input.caseId}:triage`,
				subjectType: "SUPPORT_CASE",
				subjectId: input.caseId,
				subjectLabel: input.title,
				ownerId: input.userId,
				queue: "service",
				urgency: "NORMAL",
				reason:
					"Triage inbound support case, verify customer identity and approve any customer-facing reply before execution.",
				primaryAction: "Triage service case",
				evidence: sourcePayload({
					source: input.source.source,
					externalId: input.source.externalId,
					customerAccountId: input.source.customerAccountId,
					providerMutationDisabled: true,
					customerReplySendDisabled: true,
				}),
			},
			update: {
				subjectLabel: input.title,
				ownerId: input.userId,
				evidence: sourcePayload({
					source: input.source.source,
					externalId: input.source.externalId,
					customerAccountId: input.source.customerAccountId,
					providerMutationDisabled: true,
					customerReplySendDisabled: true,
				}),
			},
			select: { id: true },
		});
	}

	private async ensureReplyDraftApproval(
		tx: Prisma.TransactionClient,
		input: {
			caseId: string;
			title: string;
			userId: string;
			source: InboundSource;
		},
	) {
		const draftId = `support-reply:${input.caseId}`;
		const recipients = replyRecipients(
			input.source.routeEmail,
			input.source.routeName,
		);
		const body =
			"Thanks for sending this through. We are reviewing the details and will come back with next steps once they have been confirmed.";
		const subject = input.source.title.startsWith("Re:")
			? input.source.title
			: `Re: ${input.source.title}`;
		const expiresAt = new Date(Date.now() + 14 * 24 * 60 * 60_000);
		const contentSnapshot = {
			kind: "support-reply-draft",
			caseId: input.caseId,
			replyDraftId: draftId,
			channel: input.source.channel,
			provider: input.source.provider,
			recipients,
			subject,
			body,
			source: input.source.source,
			sourceExternalId: input.source.externalId,
			customerSafeKnowledgeOnly: true,
			customerReplySendDisabled: true,
			providerMutationDisabled: true,
			modelExecutionDisabled: true,
		};
		const contentDigest = approvalContentDigest({
			action: SERVICE_REPLY_APPROVAL_ACTION,
			contentSnapshot,
			targetType: "SUPPORT_CASE",
			targetId: input.caseId,
			risk: "HIGH",
			policyVersion: SERVICE_POLICY_VERSION,
			expiresAt,
			invalidationVersion: 0,
		});
		const approval = await tx.approvalRequest.upsert({
			where: { idempotencyKey: `service:reply:${input.caseId}:approval` },
			create: {
				action: SERVICE_REPLY_APPROVAL_ACTION,
				contentDigest,
				contentSnapshot: contentSnapshot as Prisma.InputJsonValue,
				targetType: "SUPPORT_CASE",
				targetId: input.caseId,
				targetLabel: input.title,
				risk: "HIGH",
				policyVersion: SERVICE_POLICY_VERSION,
				requestorId: input.userId,
				expiresAt,
				status: "PENDING",
				idempotencyKey: `service:reply:${input.caseId}:approval`,
			},
			update: {
				targetLabel: input.title,
				requestorId: input.userId,
			},
			select: { id: true, contentDigest: true },
		});
		await tx.supportReplyDraft.upsert({
			where: { idempotencyKey: `service:reply:${input.caseId}:draft` },
			create: {
				id: draftId,
				caseId: input.caseId,
				channel: input.source.channel,
				provider: input.source.provider,
				recipients: recipients as Prisma.InputJsonValue,
				subject,
				body,
				contentDigest: approval.contentDigest,
				status: "PENDING_APPROVAL",
				approvalRequestId: approval.id,
				idempotencyKey: `service:reply:${input.caseId}:draft`,
			},
			update: {
				updatedAt: new Date(),
			},
		});
		return { approvalRequestId: approval.id, replyDraftId: draftId };
	}

	private async matchSlaPolicy(
		tx: Prisma.TransactionClient,
		source: InboundSource,
	) {
		return tx.supportSlaPolicy.findFirst({
			where: {
				status: "ACTIVE",
				priority: "NORMAL",
				OR: [
					{
						customerAccountId: source.customerAccountId,
						channel: source.channel,
					},
					{ customerAccountId: source.customerAccountId, channel: null },
					{ customerAccountId: null, channel: source.channel },
					{ customerAccountId: null, channel: null },
				],
			},
			orderBy: [{ customerAccountId: "desc" }, { channel: "desc" }],
			select: { id: true, firstResponseMinutes: true },
		});
	}

	private dedupeKey(source: InboundSource): string {
		return `support:${hashValue({
			customerAccountId: source.customerAccountId,
			companyId: source.companyId,
			contactId: source.contactId,
			routeEmail: source.routeEmail?.toLocaleLowerCase() ?? null,
			subject: normalizeSubject(source.dedupeSubject),
		})}`;
	}

	private async bindCustomer(
		source: InboundSource,
		input: ServiceRecoverInboundInput,
	): Promise<InboundSource> {
		if (input.customerAccountId) {
			const account = await this.db.customerAccount.findUnique({
				where: { id: input.customerAccountId },
				select: { id: true },
			});
			if (!account) {
				throw new NotFoundException(
					`No customer account with id ${input.customerAccountId}.`,
				);
			}
			return { ...source, customerAccountId: account.id };
		}
		if (source.customerAccountId) return source;
		if (!source.companyId) return source;
		const account = await this.db.customerAccount.findUnique({
			where: { companyId: source.companyId },
			select: { id: true },
		});
		return account ? { ...source, customerAccountId: account.id } : source;
	}

	private async loadSource(input: ServiceRecoverInboundInput) {
		switch (input.sourceType) {
			case "inboundSourceReceipt":
				return this.loadInboundReceipt(input.sourceId);
			case "emailMessage":
				return this.loadEmailMessage(input.sourceId);
			case "websiteEnquiry":
				return this.loadWebsiteEnquiry(input.sourceId);
			case "granolaNote":
				return this.loadGranolaNote(input.sourceId);
		}
	}

	private async loadInboundReceipt(id: string): Promise<InboundSource> {
		const receipt = await this.db.inboundSourceReceipt.findUnique({
			where: { id },
			select: {
				id: true,
				connector: true,
				provider: true,
				accountId: true,
				sourceObjectType: true,
				sourceObjectId: true,
				sourceDigest: true,
				sourceCreatedAt: true,
				sourceUpdatedAt: true,
				capturedAt: true,
				sourceUrl: true,
				redactedMetadata: true,
			},
		});
		if (!receipt)
			throw new NotFoundException(`No inbound receipt with id ${id}.`);
		const metadata = objectValue(receipt.redactedMetadata);
		const title =
			firstString(metadata, ["subject", "title", "name", "summary"]) ??
			`${label(receipt.sourceObjectType)} inbound`;
		const routeEmail = firstString(metadata, [
			"email",
			"fromEmail",
			"canonicalEmail",
			"replyTo",
		]);
		return {
			sourceType: "inboundSourceReceipt",
			source: `inbound:${receipt.connector}:${receipt.sourceObjectType}`,
			provider: receipt.provider,
			channel: receipt.connector,
			externalId: [
				receipt.connector,
				receipt.provider,
				receipt.accountId,
				receipt.sourceObjectType,
				receipt.sourceObjectId,
				receipt.sourceDigest,
			].join(":"),
			url: receipt.sourceUrl,
			title,
			description: firstString(metadata, [
				"snippet",
				"body",
				"notes",
				"summary",
			]),
			receivedAt:
				receipt.sourceCreatedAt ??
				receipt.sourceUpdatedAt ??
				receipt.capturedAt,
			contentHash: receipt.sourceDigest,
			payload: sourcePayload({
				receiptId: receipt.id,
				connector: receipt.connector,
				provider: receipt.provider,
				accountId: receipt.accountId,
				sourceObjectType: receipt.sourceObjectType,
				sourceObjectId: receipt.sourceObjectId,
				sourceDigest: receipt.sourceDigest,
				redactedMetadata: metadata,
			}),
			companyId: firstString(metadata, ["companyId"]),
			contactId: firstString(metadata, ["contactId"]),
			customerAccountId: firstString(metadata, ["customerAccountId"]),
			routeEmail,
			routeName: firstString(metadata, ["name", "fromName"]),
			dedupeSubject: title,
		};
	}

	private async loadEmailMessage(id: string): Promise<InboundSource> {
		const message = await this.db.emailMessage.findUnique({
			where: { id },
			select: {
				id: true,
				provider: true,
				externalMessageId: true,
				rfcMessageId: true,
				externalThreadId: true,
				outlookWebLink: true,
				direction: true,
				fromEmail: true,
				fromName: true,
				recipients: true,
				subject: true,
				snippet: true,
				body: true,
				sentAt: true,
				thread: { select: { companyId: true, contactId: true } },
			},
		});
		if (!message)
			throw new NotFoundException(`No email message with id ${id}.`);
		if (message.direction !== "INBOUND") {
			throw new BadRequestException(
				"Only inbound messages can open service cases.",
			);
		}
		const title = message.subject?.trim() || "Inbound email";
		return {
			sourceType: "emailMessage",
			source: `email:${message.provider.toLocaleLowerCase()}`,
			provider: message.provider.toLocaleLowerCase(),
			channel: "email",
			externalId: message.externalMessageId ?? message.rfcMessageId,
			url: message.outlookWebLink,
			title,
			description: message.snippet ?? message.body ?? null,
			receivedAt: message.sentAt,
			contentHash: hashValue({
				provider: message.provider,
				externalMessageId: message.externalMessageId,
				rfcMessageId: message.rfcMessageId,
				subject: message.subject,
				body: message.body,
			}),
			payload: sourcePayload({
				messageId: message.id,
				provider: message.provider,
				externalThreadId: message.externalThreadId,
				externalMessageId: message.externalMessageId,
				rfcMessageId: message.rfcMessageId,
				recipients: message.recipients,
			}),
			companyId: message.thread.companyId,
			contactId: message.thread.contactId,
			customerAccountId: null,
			routeEmail: message.fromEmail,
			routeName: message.fromName,
			dedupeSubject: title,
		};
	}

	private async loadWebsiteEnquiry(id: string): Promise<InboundSource> {
		const enquiry = await this.db.websiteEnquiry.findUnique({
			where: { id },
			select: {
				id: true,
				externalId: true,
				createdAtSource: true,
				name: true,
				email: true,
				company: true,
				country: true,
				biggestPain: true,
				source: true,
				sourcePath: true,
				utm: true,
				qaTag: true,
				notes: true,
				test: true,
				companyId: true,
				contactId: true,
			},
		});
		if (!enquiry)
			throw new NotFoundException(`No website enquiry with id ${id}.`);
		const title = enquiry.biggestPain?.trim() || "Website enquiry";
		return {
			sourceType: "websiteEnquiry",
			source: "website:enquiry",
			provider: "website",
			channel: "website",
			externalId: enquiry.externalId,
			url: enquiry.sourcePath,
			title,
			description: enquiry.notes ?? enquiry.biggestPain ?? null,
			receivedAt: enquiry.createdAtSource,
			contentHash: hashValue({
				externalId: enquiry.externalId,
				email: enquiry.email,
				biggestPain: enquiry.biggestPain,
				notes: enquiry.notes,
			}),
			payload: sourcePayload({
				websiteEnquiryId: enquiry.id,
				externalId: enquiry.externalId,
				name: enquiry.name,
				email: enquiry.email,
				company: enquiry.company,
				country: enquiry.country,
				source: enquiry.source,
				sourcePath: enquiry.sourcePath,
				utm: enquiry.utm,
				qaTag: enquiry.qaTag,
				test: enquiry.test,
			}),
			companyId: enquiry.companyId,
			contactId: enquiry.contactId,
			customerAccountId: null,
			routeEmail: enquiry.email,
			routeName: enquiry.name,
			dedupeSubject: title,
		};
	}

	private async loadGranolaNote(id: string): Promise<InboundSource> {
		const note = await this.db.granolaNote.findUnique({
			where: { id },
			select: {
				id: true,
				externalId: true,
				title: true,
				sourceUrl: true,
				ownerName: true,
				ownerEmail: true,
				summary: true,
				attendees: true,
				folders: true,
				sourceCreatedAt: true,
				sourceUpdatedAt: true,
				companyId: true,
				contactId: true,
			},
		});
		if (!note) throw new NotFoundException(`No Granola note with id ${id}.`);
		return {
			sourceType: "granolaNote",
			source: "granola:note",
			provider: "granola",
			channel: "meeting-note",
			externalId: note.externalId,
			url: note.sourceUrl,
			title: note.title,
			description: note.summary,
			receivedAt: note.sourceUpdatedAt ?? note.sourceCreatedAt,
			contentHash: hashValue({
				externalId: note.externalId,
				title: note.title,
				summary: note.summary,
				sourceUpdatedAt: note.sourceUpdatedAt,
			}),
			payload: sourcePayload({
				granolaNoteId: note.id,
				externalId: note.externalId,
				ownerName: note.ownerName,
				ownerEmail: note.ownerEmail,
				attendees: note.attendees,
				folders: note.folders,
			}),
			companyId: note.companyId,
			contactId: note.contactId,
			customerAccountId: null,
			routeEmail: note.ownerEmail,
			routeName: note.ownerName,
			dedupeSubject: note.title,
		};
	}
}
