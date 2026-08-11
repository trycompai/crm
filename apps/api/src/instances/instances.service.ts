import { type Db, type Prisma } from "@crm/db";
import { Injectable, NotFoundException } from "@nestjs/common";
import {
	approvalCapabilities,
	approvalDigestMatches,
} from "../approval/approval.service";
import { InjectDatabase } from "../database/database.constants";
import { OperatingKernelAccessService } from "../operating-kernel/operating-kernel-access.service";
import {
	countsByKey,
	FACET_ALL,
	type ListResult,
	paginate,
	resolveOrderBy,
} from "../trpc/list-input";
import { workCapabilities } from "../work/work-capabilities";
import type { InstancesListInput } from "./instances.contracts";

const OPEN_WORK_STATES = ["OPEN", "IN_PROGRESS", "WAITING", "BLOCKED"] as const;
const OPEN_INCIDENT_STATES = ["OPEN", "ACKNOWLEDGED", "MITIGATING"] as const;

const OWNER_SELECT = {
	id: true,
	name: true,
	email: true,
	image: true,
} satisfies Prisma.UserSelect;

const WORK_SELECT = {
	id: true,
	subjectType: true,
	subjectId: true,
	subjectLabel: true,
	ownerId: true,
	owner: { select: OWNER_SELECT },
	queue: true,
	urgency: true,
	dueAt: true,
	nextReviewAt: true,
	version: true,
	reason: true,
	state: true,
	primaryAction: true,
	evidence: true,
	startedAt: true,
	completedAt: true,
	createdAt: true,
	updatedAt: true,
} satisfies Prisma.WorkItemSelect;

const APPROVAL_SELECT = {
	id: true,
	action: true,
	contentDigest: true,
	contentSnapshot: true,
	targetType: true,
	targetId: true,
	targetLabel: true,
	risk: true,
	policyVersion: true,
	requestor: { select: OWNER_SELECT },
	expiresAt: true,
	invalidationVersion: true,
	version: true,
	status: true,
	requestedAt: true,
	decidedAt: true,
	createdAt: true,
	updatedAt: true,
} satisfies Prisma.ApprovalRequestSelect;

const INSTANCE_SELECT = {
	id: true,
	accountId: true,
	account: {
		select: {
			id: true,
			name: true,
			status: true,
			metadata: true,
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
	key: true,
	name: true,
	environment: true,
	region: true,
	status: true,
	externalId: true,
	providerAccounts: {
		orderBy: [{ provider: "asc" }, { updatedAt: "desc" }, { id: "asc" }],
		take: 25,
		select: {
			id: true,
			provider: true,
			externalAccountId: true,
			displayName: true,
			status: true,
			createdAt: true,
			updatedAt: true,
		},
	},
	resources: {
		orderBy: [
			{ status: "asc" },
			{ resourceType: "asc" },
			{ updatedAt: "desc" },
			{ id: "asc" },
		],
		take: 50,
		select: {
			id: true,
			providerAccountId: true,
			provider: true,
			resourceType: true,
			externalId: true,
			name: true,
			status: true,
			observedAt: true,
			createdAt: true,
			updatedAt: true,
		},
	},
	desiredRevisions: {
		orderBy: [{ revision: "desc" }, { createdAt: "desc" }],
		take: 8,
		select: {
			id: true,
			revision: true,
			digest: true,
			status: true,
			source: true,
			createdAt: true,
		},
	},
	observedStates: {
		orderBy: [{ observedAt: "desc" }, { createdAt: "desc" }],
		take: 8,
		select: {
			id: true,
			digest: true,
			status: true,
			source: true,
			observedAt: true,
			createdAt: true,
		},
	},
	plans: {
		orderBy: [{ createdAt: "desc" }, { id: "asc" }],
		take: 12,
		select: {
			id: true,
			desiredRevisionId: true,
			observedStateId: true,
			preconditionDigest: true,
			contentDigest: true,
			status: true,
			approvalRequestId: true,
			summary: true,
			errorMessage: true,
			createdAt: true,
			startedAt: true,
			completedAt: true,
			updatedAt: true,
			steps: {
				orderBy: [{ position: "asc" }, { id: "asc" }],
				take: 30,
				select: {
					id: true,
					position: true,
					operation: true,
					provider: true,
					resourceType: true,
					resourceId: true,
					status: true,
					operationKey: true,
					idempotencyKey: true,
					errorMessage: true,
					createdAt: true,
					startedAt: true,
					completedAt: true,
					updatedAt: true,
				},
			},
		},
	},
	commands: {
		orderBy: [{ createdAt: "desc" }, { id: "asc" }],
		take: 12,
		select: {
			id: true,
			command: true,
			contentDigest: true,
			status: true,
			idempotencyKey: true,
			approvalRequestId: true,
			requestedByType: true,
			requestedById: true,
			errorMessage: true,
			createdAt: true,
			startedAt: true,
			completedAt: true,
			updatedAt: true,
		},
	},
	operations: {
		orderBy: [{ createdAt: "desc" }, { id: "asc" }],
		take: 20,
		select: {
			id: true,
			providerAccountId: true,
			planStepId: true,
			controlCommandId: true,
			provider: true,
			operation: true,
			operationKey: true,
			idempotencyKey: true,
			status: true,
			externalId: true,
			attemptCount: true,
			errorCode: true,
			errorMessage: true,
			createdAt: true,
			startedAt: true,
			completedAt: true,
			updatedAt: true,
		},
	},
	incidents: {
		orderBy: [{ detectedAt: "desc" }, { id: "asc" }],
		take: 12,
		select: {
			id: true,
			provider: true,
			fingerprint: true,
			severity: true,
			status: true,
			title: true,
			summary: true,
			detectedAt: true,
			acknowledgedAt: true,
			resolvedAt: true,
			createdAt: true,
			updatedAt: true,
		},
	},
	usageSamples: {
		orderBy: [{ observedAt: "desc" }, { id: "asc" }],
		take: 12,
		select: {
			id: true,
			provider: true,
			metric: true,
			quantity: true,
			unit: true,
			observedAt: true,
			source: true,
			createdAt: true,
		},
	},
	costLineItems: {
		orderBy: [{ periodEnd: "desc" }, { id: "asc" }],
		take: 12,
		select: {
			id: true,
			provider: true,
			category: true,
			description: true,
			quantity: true,
			unitCost: true,
			totalCost: true,
			currency: true,
			periodStart: true,
			periodEnd: true,
			createdAt: true,
		},
	},
	_count: {
		select: {
			providerAccounts: true,
			resources: true,
			desiredRevisions: true,
			observedStates: true,
			plans: true,
			commands: true,
			operations: true,
			incidents: true,
			usageSamples: true,
			costLineItems: true,
		},
	},
	createdAt: true,
	updatedAt: true,
} satisfies Prisma.CustomerInstanceSelect;

type InstanceRecord = Prisma.CustomerInstanceGetPayload<{
	select: typeof INSTANCE_SELECT;
}>;

type KernelCounts = {
	openWork: Map<string, number>;
	pendingApprovals: Map<string, number>;
	openIncidents: Map<string, number>;
};

const SORTABLE: Record<
	string,
	(dir: Prisma.SortOrder) => Prisma.CustomerInstanceOrderByWithRelationInput[]
> = {
	updatedAt: (dir) => [{ updatedAt: dir }],
	name: (dir) => [{ name: dir }],
	status: (dir) => [{ status: dir }, { updatedAt: "desc" }],
	environment: (dir) => [{ environment: dir }, { updatedAt: "desc" }],
	account: (dir) => [{ account: { name: dir } }, { name: "asc" }],
};

function iso(value: Date | null): string | null {
	return value?.toISOString() ?? null;
}

function money(value: Prisma.Decimal | null): string | null {
	return value?.toString() ?? null;
}

function objectValue(value: unknown): Record<string, unknown> {
	return value && typeof value === "object" && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: {};
}

function stringArray(value: unknown): string[] {
	return Array.isArray(value)
		? value.filter((item): item is string => typeof item === "string")
		: [];
}

function accountGaps(metadata: Prisma.JsonValue | null): string[] {
	const foundation = objectValue(
		objectValue(metadata).onboardingFoundation as Prisma.JsonValue | undefined,
	);
	return stringArray(foundation.requiredGaps);
}

function safety(requiredGaps: string[]) {
	return {
		readOnly: true,
		customerMutationDisabled: true,
		providerMutationDisabled: true,
		providerExecutionDisabled: true,
		modelExecutionDisabled: true,
		humanApprovalRequired: true,
		secretValuesHidden: true,
		requiredGaps,
		disabledReasons: [
			"Customer and provider mutations are disabled for this foundation.",
			"Model execution is not started by API reads or instance discovery.",
			"Human approval is required before any customer-facing or provider action.",
			"Provider commands are read-only here; execution remains disabled.",
			"Secret references and raw provider payloads are hidden.",
		],
	};
}

function serializeInstance(
	row: InstanceRecord,
	counts: KernelCounts,
	includeIncidentDetails: boolean,
) {
	const latestObservedState = row.observedStates[0] ?? null;
	const latestDesiredRevision = row.desiredRevisions[0] ?? null;
	const requiredGaps = accountGaps(row.account.metadata);
	return {
		id: row.id,
		accountId: row.accountId,
		account: {
			id: row.account.id,
			name: row.account.name,
			status: row.account.status,
			company: row.account.company,
		},
		key: row.key,
		name: row.name,
		environment: row.environment,
		region: row.region,
		status: row.status,
		externalId: row.externalId,
		latestObservedState: latestObservedState
			? {
					...latestObservedState,
					observedAt: latestObservedState.observedAt.toISOString(),
					createdAt: latestObservedState.createdAt.toISOString(),
				}
			: null,
		latestDesiredRevision: latestDesiredRevision
			? {
					...latestDesiredRevision,
					createdAt: latestDesiredRevision.createdAt.toISOString(),
				}
			: null,
		providerAccounts: row.providerAccounts.map((account) => ({
			...account,
			createdAt: account.createdAt.toISOString(),
			updatedAt: account.updatedAt.toISOString(),
		})),
		resources: row.resources.map((resource) => ({
			...resource,
			observedAt: iso(resource.observedAt),
			createdAt: resource.createdAt.toISOString(),
			updatedAt: resource.updatedAt.toISOString(),
		})),
		desiredRevisions: row.desiredRevisions.map((revision) => ({
			...revision,
			createdAt: revision.createdAt.toISOString(),
		})),
		observedStates: row.observedStates.map((state) => ({
			...state,
			observedAt: state.observedAt.toISOString(),
			createdAt: state.createdAt.toISOString(),
		})),
		plans: row.plans.map((plan) => ({
			...plan,
			createdAt: plan.createdAt.toISOString(),
			startedAt: iso(plan.startedAt),
			completedAt: iso(plan.completedAt),
			updatedAt: plan.updatedAt.toISOString(),
			steps: plan.steps.map((step) => ({
				...step,
				createdAt: step.createdAt.toISOString(),
				startedAt: iso(step.startedAt),
				completedAt: iso(step.completedAt),
				updatedAt: step.updatedAt.toISOString(),
			})),
		})),
		commands: row.commands.map((command) => ({
			...command,
			createdAt: command.createdAt.toISOString(),
			startedAt: iso(command.startedAt),
			completedAt: iso(command.completedAt),
			updatedAt: command.updatedAt.toISOString(),
		})),
		operations: row.operations.map((operation) => ({
			...operation,
			createdAt: operation.createdAt.toISOString(),
			startedAt: iso(operation.startedAt),
			completedAt: iso(operation.completedAt),
			updatedAt: operation.updatedAt.toISOString(),
		})),
		incidents: includeIncidentDetails
			? row.incidents.map((incident) => ({
					...incident,
					detectedAt: incident.detectedAt.toISOString(),
					acknowledgedAt: iso(incident.acknowledgedAt),
					resolvedAt: iso(incident.resolvedAt),
					createdAt: incident.createdAt.toISOString(),
					updatedAt: incident.updatedAt.toISOString(),
				}))
			: [],
		usageSamples: row.usageSamples.map((sample) => ({
			...sample,
			quantity: sample.quantity.toString(),
			observedAt: sample.observedAt.toISOString(),
			createdAt: sample.createdAt.toISOString(),
		})),
		costLineItems: row.costLineItems.map((item) => ({
			...item,
			quantity: item.quantity.toString(),
			unitCost: item.unitCost.toString(),
			totalCost: item.totalCost.toString(),
			periodStart: item.periodStart.toISOString(),
			periodEnd: item.periodEnd.toISOString(),
			createdAt: item.createdAt.toISOString(),
		})),
		counts: {
			providerAccounts: row._count.providerAccounts,
			resources: row._count.resources,
			desiredRevisions: row._count.desiredRevisions,
			observedStates: row._count.observedStates,
			plans: row._count.plans,
			commands: row._count.commands,
			operations: row._count.operations,
			incidents: row._count.incidents,
			openIncidents: counts.openIncidents.get(row.id) ?? 0,
			usageSamples: row._count.usageSamples,
			costLineItems: row._count.costLineItems,
			openWork: counts.openWork.get(row.id) ?? 0,
			pendingApprovals: counts.pendingApprovals.get(row.id) ?? 0,
		},
		safety: safety(requiredGaps),
		createdAt: row.createdAt.toISOString(),
		updatedAt: row.updatedAt.toISOString(),
	};
}

@Injectable()
export class InstancesService {
	constructor(
		@InjectDatabase() private readonly db: Db,
		private readonly access: OperatingKernelAccessService,
	) {}

	async list(
		input: InstancesListInput,
		userId: string,
	): Promise<ListResult<ReturnType<typeof serializeInstance>>> {
		const member = await this.access.assertMember(userId);
		const where = this.buildWhere(input);
		const { skip, take } = paginate(input);
		const [rows, total, statuses, environments, providers] = await Promise.all([
			this.db.customerInstance.findMany({
				where,
				orderBy: [
					...resolveOrderBy(input, SORTABLE, [{ updatedAt: "desc" }]),
					{ id: input.dir },
				],
				skip,
				take,
				select: INSTANCE_SELECT,
			}),
			this.db.customerInstance.count({ where }),
			this.db.customerInstance.groupBy({
				by: ["status"],
				where,
				_count: { _all: true },
			}),
			this.db.customerInstance.groupBy({
				by: ["environment"],
				where,
				_count: { _all: true },
			}),
			this.db.providerAccount.groupBy({
				by: ["provider"],
				where: { instance: { is: where } },
				_count: { _all: true },
			}),
		]);
		const counts = await this.kernelCounts(rows);
		return {
			rows: rows.map((row) => serializeInstance(row, counts, member.isAdmin)),
			total,
			facetCounts: {
				status: countsByKey(statuses, "status"),
				environment: countsByKey(environments, "environment"),
				provider: countsByKey(providers, "provider"),
			},
		};
	}

	async byId(id: string, userId: string) {
		const member = await this.access.assertMember(userId);
		const row = await this.db.customerInstance.findUnique({
			where: { id },
			select: INSTANCE_SELECT,
		});
		if (!row)
			throw new NotFoundException(`No customer instance with id ${id}.`);

		const [counts, work, approvals, receipts] = await Promise.all([
			this.kernelCounts([row]),
			this.workFor(row, userId, member.isAdmin),
			this.approvalsFor(row, member),
			this.receiptsFor(row),
		]);

		return {
			...serializeInstance(row, counts, member.isAdmin),
			work,
			approvals,
			receipts,
			viewer: {
				role: member.role,
				isAdmin: member.isAdmin,
			},
		};
	}

	private buildWhere(
		input: InstancesListInput,
	): Prisma.CustomerInstanceWhereInput {
		const where: Prisma.CustomerInstanceWhereInput = {};
		if (input.status !== FACET_ALL) where.status = input.status;
		if (input.environment !== FACET_ALL) where.environment = input.environment;
		if (input.provider !== FACET_ALL) {
			where.OR = [
				{ providerAccounts: { some: { provider: input.provider } } },
				{ resources: { some: { provider: input.provider } } },
				{ operations: { some: { provider: input.provider } } },
			];
		}
		if (input.q) {
			where.AND = [
				...(Array.isArray(where.AND) ? where.AND : []),
				{
					OR: [
						{ name: { contains: input.q, mode: "insensitive" } },
						{ key: { contains: input.q, mode: "insensitive" } },
						{ environment: { contains: input.q, mode: "insensitive" } },
						{ region: { contains: input.q, mode: "insensitive" } },
						{
							account: { name: { contains: input.q, mode: "insensitive" } },
						},
						{
							account: {
								company: {
									name: { contains: input.q, mode: "insensitive" },
								},
							},
						},
						{
							resources: {
								some: {
									OR: [
										{
											name: { contains: input.q, mode: "insensitive" },
										},
										{
											resourceType: {
												contains: input.q,
												mode: "insensitive",
											},
										},
										{
											externalId: {
												contains: input.q,
												mode: "insensitive",
											},
										},
									],
								},
							},
						},
					],
				},
			];
		}
		return where;
	}

	private async kernelCounts(rows: InstanceRecord[]): Promise<KernelCounts> {
		const instanceIds = rows.map((row) => row.id);
		if (instanceIds.length === 0) {
			return {
				openWork: new Map<string, number>(),
				pendingApprovals: new Map<string, number>(),
				openIncidents: new Map<string, number>(),
			};
		}
		const planIds = rows.flatMap((row) => row.plans.map((plan) => plan.id));
		const commandIds = rows.flatMap((row) =>
			row.commands.map((command) => command.id),
		);
		const [work, approvals, incidents] = await Promise.all([
			this.db.workItem.groupBy({
				by: ["subjectId"],
				where: {
					subjectType: "CUSTOMER_INSTANCE",
					subjectId: { in: instanceIds },
					state: { in: [...OPEN_WORK_STATES] },
				},
				_count: { _all: true },
			}),
			this.db.approvalRequest.findMany({
				where: {
					status: "PENDING",
					OR: [
						{ targetType: "CUSTOMER_INSTANCE", targetId: { in: instanceIds } },
						{ targetType: "PLAN", targetId: { in: planIds } },
						{ targetType: "CONTROL_COMMAND", targetId: { in: commandIds } },
					],
				},
				select: { targetType: true, targetId: true },
			}),
			this.db.incident.groupBy({
				by: ["instanceId"],
				where: {
					instanceId: { in: instanceIds },
					status: { in: [...OPEN_INCIDENT_STATES] },
				},
				_count: { _all: true },
			}),
		]);
		const planInstance = new Map(
			rows.flatMap((row) => row.plans.map((plan) => [plan.id, row.id])),
		);
		const commandInstance = new Map(
			rows.flatMap((row) =>
				row.commands.map((command) => [command.id, row.id]),
			),
		);
		const pendingApprovals = new Map<string, number>();
		for (const approval of approvals) {
			const instanceId =
				approval.targetType === "CUSTOMER_INSTANCE"
					? approval.targetId
					: approval.targetType === "PLAN"
						? planInstance.get(approval.targetId)
						: commandInstance.get(approval.targetId);
			if (!instanceId) continue;
			pendingApprovals.set(
				instanceId,
				(pendingApprovals.get(instanceId) ?? 0) + 1,
			);
		}
		return {
			openWork: new Map(work.map((row) => [row.subjectId, row._count._all])),
			pendingApprovals,
			openIncidents: new Map(
				incidents.map((row) => [row.instanceId, row._count._all]),
			),
		};
	}

	private async workFor(row: InstanceRecord, userId: string, isAdmin: boolean) {
		const work = await this.db.workItem.findMany({
			where: { subjectType: "CUSTOMER_INSTANCE", subjectId: row.id },
			orderBy: [{ updatedAt: "desc" }, { id: "asc" }],
			take: 25,
			select: WORK_SELECT,
		});
		return work.map((item) => ({
			...item,
			dueAt: iso(item.dueAt),
			nextReviewAt: iso(item.nextReviewAt),
			startedAt: iso(item.startedAt),
			completedAt: iso(item.completedAt),
			createdAt: item.createdAt.toISOString(),
			updatedAt: item.updatedAt.toISOString(),
			capabilities: workCapabilities({
				state: item.state,
				ownerId: item.ownerId,
				userId,
				isAdmin,
			}),
		}));
	}

	private async approvalsFor(
		row: InstanceRecord,
		member: Awaited<ReturnType<OperatingKernelAccessService["assertMember"]>>,
	) {
		const planIds = row.plans.map((plan) => plan.id);
		const commandIds = row.commands.map((command) => command.id);
		const approvals = await this.db.approvalRequest.findMany({
			where: {
				OR: [
					{ targetType: "CUSTOMER_INSTANCE", targetId: row.id },
					{ targetType: "PLAN", targetId: { in: planIds } },
					{ targetType: "CONTROL_COMMAND", targetId: { in: commandIds } },
				],
			},
			orderBy: [{ requestedAt: "desc" }, { id: "asc" }],
			take: 25,
			select: APPROVAL_SELECT,
		});
		return approvals.map((approval) => {
			const integrityValid = approvalDigestMatches(approval);
			return {
				...approval,
				expiresAt: approval.expiresAt.toISOString(),
				requestedAt: approval.requestedAt.toISOString(),
				decidedAt: iso(approval.decidedAt),
				createdAt: approval.createdAt.toISOString(),
				updatedAt: approval.updatedAt.toISOString(),
				integrityValid,
				capabilities: approvalCapabilities(approval, member, integrityValid),
			};
		});
	}

	private async receiptsFor(row: InstanceRecord) {
		const operationIds = row.operations.map((operation) => operation.id);
		if (operationIds.length === 0) return [];
		const receipts = await this.db.actionReceipt.findMany({
			where: { providerOperationId: { in: operationIds } },
			orderBy: [{ createdAt: "desc" }, { id: "asc" }],
			take: 50,
			select: {
				id: true,
				operationKey: true,
				idempotencyKey: true,
				requestHash: true,
				provider: true,
				channel: true,
				externalId: true,
				costUsd: true,
				errorCode: true,
				errorMessage: true,
				status: true,
				providerAccountId: true,
				providerOperationId: true,
				completedAt: true,
				createdAt: true,
				updatedAt: true,
			},
		});
		return receipts.map((receipt) => ({
			...receipt,
			costUsd: money(receipt.costUsd),
			completedAt: iso(receipt.completedAt),
			createdAt: receipt.createdAt.toISOString(),
			updatedAt: receipt.updatedAt.toISOString(),
		}));
	}
}
