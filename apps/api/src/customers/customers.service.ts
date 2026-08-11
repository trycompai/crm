import { type Db, type Prisma } from "@crm/db";
import { Injectable, NotFoundException } from "@nestjs/common";
import { InjectDatabase } from "../database/database.constants";
import {
	FACET_ALL,
	FACET_UNASSIGNED,
	type ListResult,
	paginate,
	resolveOrderBy,
} from "../trpc/list-input";
import type { CustomerListInput } from "./customers.contracts";

const OWNER_SELECT = {
	id: true,
	name: true,
	email: true,
	image: true,
} satisfies Prisma.UserSelect;

const CUSTOMER_SELECT = {
	id: true,
	name: true,
	status: true,
	metadata: true,
	ownerId: true,
	owner: { select: OWNER_SELECT },
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
	customerOnboarding: {
		select: {
			id: true,
			dealId: true,
			status: true,
			objective: true,
			systemsSummary: true,
			dataSummary: true,
			brainPlan: true,
			targetLiveAt: true,
			updatedAt: true,
			deal: { select: { id: true, name: true, stage: true } },
			items: {
				orderBy: [{ kind: "asc" }, { position: "asc" }],
				select: {
					id: true,
					kind: true,
					status: true,
					name: true,
					details: true,
					ownerName: true,
					source: true,
					dueAt: true,
					position: true,
					updatedAt: true,
				},
			},
		},
	},
	instances: {
		orderBy: [{ createdAt: "asc" }, { id: "asc" }],
		select: {
			id: true,
			key: true,
			name: true,
			environment: true,
			region: true,
			status: true,
			metadata: true,
			updatedAt: true,
		},
	},
	_count: {
		select: {
			providerAccounts: true,
			providerResources: true,
			supportCases: true,
		},
	},
	createdAt: true,
	updatedAt: true,
} satisfies Prisma.CustomerAccountSelect;

type CustomerRecord = Prisma.CustomerAccountGetPayload<{
	select: typeof CUSTOMER_SELECT;
}>;

const NON_TERMINAL_WORK = [
	"OPEN",
	"IN_PROGRESS",
	"WAITING",
	"BLOCKED",
] as const;

const SORTABLE: Record<
	string,
	(dir: Prisma.SortOrder) => Prisma.CustomerAccountOrderByWithRelationInput[]
> = {
	name: (dir) => [{ name: dir }],
	status: (dir) => [{ status: dir }, { name: "asc" }],
	company: (dir) => [{ company: { name: dir } }, { name: "asc" }],
	createdAt: (dir) => [{ createdAt: dir }],
	updatedAt: (dir) => [{ updatedAt: dir }],
	owner: (dir) => [{ owner: { name: dir } }, { name: "asc" }],
};

function iso(value: Date | null): string | null {
	return value?.toISOString() ?? null;
}

function objectValue(value: Prisma.JsonValue | null | undefined) {
	return value && typeof value === "object" && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: {};
}

function stringArray(value: unknown): string[] {
	return Array.isArray(value)
		? value.filter((item): item is string => typeof item === "string")
		: [];
}

function foundationGaps(metadata: Prisma.JsonValue | null): string[] {
	const foundation = objectValue(
		objectValue(metadata).onboardingFoundation as Prisma.JsonValue | undefined,
	);
	return stringArray(foundation.requiredGaps);
}

function disabledReasons() {
	return [
		"Customer and provider mutations are disabled for this foundation.",
		"Model execution is not started by API reads or closed-won transition.",
		"Human approval is required before any customer-facing or provider action.",
	];
}

function serializeCustomer(
	row: CustomerRecord,
	openWorkCount: number,
	pendingApprovalCount: number,
) {
	const onboarding = row.customerOnboarding;
	const incompleteItems =
		onboarding?.items.filter((item) => item.status !== "COMPLETE").length ?? 0;
	return {
		id: row.id,
		name: row.name,
		status: row.status,
		company: row.company,
		owner: row.owner,
		onboarding: onboarding
			? {
					id: onboarding.id,
					dealId: onboarding.dealId,
					deal: onboarding.deal,
					status: onboarding.status,
					objective: onboarding.objective,
					systemsSummary: onboarding.systemsSummary,
					dataSummary: onboarding.dataSummary,
					brainPlan: onboarding.brainPlan,
					targetLiveAt: iso(onboarding.targetLiveAt),
					incompleteItems,
					items: onboarding.items.map((item) => ({
						...item,
						dueAt: iso(item.dueAt),
						updatedAt: item.updatedAt.toISOString(),
					})),
					updatedAt: onboarding.updatedAt.toISOString(),
				}
			: null,
		instances: row.instances.map((instance) => ({
			...instance,
			updatedAt: instance.updatedAt.toISOString(),
		})),
		counts: {
			instances: row.instances.length,
			openWork: openWorkCount,
			pendingApprovals: pendingApprovalCount,
			providerAccounts: row._count.providerAccounts,
			providerResources: row._count.providerResources,
			supportCases: row._count.supportCases,
		},
		gaps: foundationGaps(row.metadata),
		disabledReasons: disabledReasons(),
		createdAt: row.createdAt.toISOString(),
		updatedAt: row.updatedAt.toISOString(),
	};
}

function facetCounts(
	groups: Array<{ _count: { _all: number }; [key: string]: unknown }>,
	key: string,
	nullKey?: string,
): Record<string, number> {
	const counts: Record<string, number> = {};
	for (const group of groups) {
		const value = group[key] ?? nullKey;
		if (typeof value !== "string") continue;
		counts[value] = (counts[value] ?? 0) + group._count._all;
	}
	return counts;
}

@Injectable()
export class CustomersService {
	constructor(@InjectDatabase() private readonly db: Db) {}

	async list(
		input: CustomerListInput,
	): Promise<ListResult<ReturnType<typeof serializeCustomer>>> {
		const where = this.buildWhere(input);
		const { skip, take } = paginate(input);
		const [rows, total, statuses, owners] = await Promise.all([
			this.db.customerAccount.findMany({
				where,
				orderBy: [
					...resolveOrderBy(input, SORTABLE, [{ updatedAt: "desc" }]),
					{ id: input.dir },
				],
				skip,
				take,
				select: CUSTOMER_SELECT,
			}),
			this.db.customerAccount.count({ where }),
			this.db.customerAccount.groupBy({
				by: ["status"],
				where,
				_count: { _all: true },
			}),
			this.db.customerAccount.groupBy({
				by: ["ownerId"],
				where,
				_count: { _all: true },
			}),
		]);
		const counts = await this.kernelCounts(rows);
		return {
			rows: rows.map((row) =>
				serializeCustomer(
					row,
					counts.openWork.get(row.id) ?? 0,
					counts.pendingApprovals.get(row.id) ?? 0,
				),
			),
			total,
			facetCounts: {
				status: facetCounts(statuses, "status"),
				owner: facetCounts(owners, "ownerId", FACET_UNASSIGNED),
			},
		};
	}

	async byId(id: string) {
		const row = await this.db.customerAccount.findUnique({
			where: { id },
			select: CUSTOMER_SELECT,
		});
		if (!row) throw new NotFoundException(`No customer account with id ${id}.`);

		const instanceIds = row.instances.map((instance) => instance.id);
		const [counts, work, approvals, receipts, supportCases] = await Promise.all(
			[
				this.kernelCounts([row]),
				this.db.workItem.findMany({
					where: {
						OR: [
							{ subjectType: "CUSTOMER_ACCOUNT", subjectId: row.id },
							{
								subjectType: "CUSTOMER_INSTANCE",
								subjectId: { in: instanceIds },
							},
						],
					},
					orderBy: [{ updatedAt: "desc" }, { id: "asc" }],
					take: 25,
					select: {
						id: true,
						subjectType: true,
						subjectId: true,
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
					where: {
						OR: [
							{ targetType: "CUSTOMER_ACCOUNT", targetId: row.id },
							{
								targetType: "CUSTOMER_INSTANCE",
								targetId: { in: instanceIds },
							},
						],
					},
					orderBy: [{ requestedAt: "desc" }, { id: "asc" }],
					take: 25,
					select: {
						id: true,
						action: true,
						status: true,
						risk: true,
						contentDigest: true,
						expiresAt: true,
						requestedAt: true,
					},
				}),
				this.receiptsFor(row),
				this.db.supportCase.findMany({
					where: { customerAccountId: row.id },
					orderBy: [{ updatedAt: "desc" }, { id: "asc" }],
					take: 10,
					select: {
						id: true,
						title: true,
						status: true,
						priority: true,
						channel: true,
						dueAt: true,
						updatedAt: true,
					},
				}),
			],
		);

		return {
			...serializeCustomer(
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
			supportCases: supportCases.map((supportCase) => ({
				...supportCase,
				dueAt: iso(supportCase.dueAt),
				updatedAt: supportCase.updatedAt.toISOString(),
			})),
		};
	}

	private buildWhere(
		input: CustomerListInput,
	): Prisma.CustomerAccountWhereInput {
		const where: Prisma.CustomerAccountWhereInput = {};
		if (input.status !== FACET_ALL) where.status = input.status;
		if (input.onboardingStatus !== FACET_ALL) {
			where.customerOnboarding = { is: { status: input.onboardingStatus } };
		}
		if (input.owner !== FACET_ALL) {
			where.ownerId = input.owner === FACET_UNASSIGNED ? null : input.owner;
		}
		if (input.q) {
			where.OR = [
				{ name: { contains: input.q, mode: "insensitive" } },
				{ company: { name: { contains: input.q, mode: "insensitive" } } },
				{ company: { domain: { contains: input.q, mode: "insensitive" } } },
				{
					customerOnboarding: {
						is: {
							deal: { name: { contains: input.q, mode: "insensitive" } },
						},
					},
				},
			];
		}
		return where;
	}

	private async kernelCounts(rows: CustomerRecord[]) {
		const accountIds = rows.map((row) => row.id);
		const instanceToAccount = new Map(
			rows.flatMap((row) =>
				row.instances.map((instance) => [instance.id, row.id] as const),
			),
		);
		const instanceIds = [...instanceToAccount.keys()];
		if (accountIds.length === 0) {
			return {
				openWork: new Map<string, number>(),
				pendingApprovals: new Map<string, number>(),
			};
		}
		const [work, approvals] = await Promise.all([
			this.db.workItem.groupBy({
				by: ["subjectType", "subjectId"],
				where: {
					OR: [
						{
							subjectType: "CUSTOMER_ACCOUNT",
							subjectId: { in: accountIds },
						},
						{
							subjectType: "CUSTOMER_INSTANCE",
							subjectId: { in: instanceIds },
						},
					],
					state: { in: [...NON_TERMINAL_WORK] },
				},
				_count: { _all: true },
			}),
			this.db.approvalRequest.groupBy({
				by: ["targetType", "targetId"],
				where: {
					OR: [
						{
							targetType: "CUSTOMER_ACCOUNT",
							targetId: { in: accountIds },
						},
						{
							targetType: "CUSTOMER_INSTANCE",
							targetId: { in: instanceIds },
						},
					],
					status: "PENDING",
				},
				_count: { _all: true },
			}),
		]);
		const openWork = new Map(accountIds.map((id) => [id, 0]));
		for (const row of work) {
			const accountId =
				row.subjectType === "CUSTOMER_ACCOUNT"
					? row.subjectId
					: instanceToAccount.get(row.subjectId);
			if (!accountId) continue;
			openWork.set(accountId, (openWork.get(accountId) ?? 0) + row._count._all);
		}
		const pendingApprovals = new Map(accountIds.map((id) => [id, 0]));
		for (const row of approvals) {
			const accountId =
				row.targetType === "CUSTOMER_ACCOUNT"
					? row.targetId
					: instanceToAccount.get(row.targetId);
			if (!accountId) continue;
			pendingApprovals.set(
				accountId,
				(pendingApprovals.get(accountId) ?? 0) + row._count._all,
			);
		}
		return {
			openWork,
			pendingApprovals,
		};
	}

	private async receiptsFor(row: CustomerRecord) {
		const dealId = row.customerOnboarding?.dealId;
		if (!dealId) return [];
		const receipts = await this.db.actionReceipt.findMany({
			where: { idempotencyKey: `customers:closed-won:${dealId}` },
			orderBy: [{ createdAt: "desc" }],
			take: 10,
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
		return receipts.map((receipt) => ({
			...receipt,
			completedAt: iso(receipt.completedAt),
			createdAt: receipt.createdAt.toISOString(),
		}));
	}
}
