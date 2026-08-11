import { createHash } from "node:crypto";
import { type Db, type Prisma } from "@crm/db";
import { approvalContentDigest } from "@crm/db/approval";
import { lockIdempotencyKey } from "@crm/db/idempotency";
import {
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
	FACET_UNASSIGNED,
	type ListResult,
	paginate,
	resolveOrderBy,
} from "../trpc/list-input";
import type {
	MarketingListInput,
	MarketingPlanInput,
} from "./marketing.contracts";

const MARKETING_PROVIDER = "lode-crm";
const MARKETING_CHANNEL = "marketing";
const MARKETING_PLAN_OPERATION = "marketing.plan.propose";
const MARKETING_PUBLICATION_OPERATION = "marketing.publication.propose";
const MARKETING_APPROVAL_ACTION = "marketing.publication.approve";
const MARKETING_POLICY_VERSION = "marketing-publication-local-v1";
const OPEN_WORK_STATES = ["OPEN", "IN_PROGRESS", "WAITING", "BLOCKED"] as const;

const OWNER_SELECT = {
	id: true,
	name: true,
	email: true,
	image: true,
} satisfies Prisma.UserSelect;

const CAMPAIGN_SELECT = {
	id: true,
	name: true,
	channel: true,
	objective: true,
	status: true,
	ownerId: true,
	owner: { select: OWNER_SELECT },
	budget: true,
	currency: true,
	startsAt: true,
	endsAt: true,
	metadata: true,
	contentItems: {
		orderBy: [{ updatedAt: "desc" }, { id: "asc" }],
		take: 12,
		select: {
			id: true,
			kind: true,
			title: true,
			brief: true,
			body: true,
			status: true,
			sourceUrl: true,
			metadata: true,
			createdAt: true,
			updatedAt: true,
			variants: {
				orderBy: [{ updatedAt: "desc" }, { id: "asc" }],
				take: 12,
				select: {
					id: true,
					key: true,
					channel: true,
					content: true,
					status: true,
					metadata: true,
					createdAt: true,
					updatedAt: true,
				},
			},
		},
	},
	experiments: {
		orderBy: [{ updatedAt: "desc" }, { id: "asc" }],
		take: 12,
		select: {
			id: true,
			key: true,
			name: true,
			hypothesis: true,
			metric: true,
			status: true,
			startsAt: true,
			endsAt: true,
			metadata: true,
			createdAt: true,
			updatedAt: true,
		},
	},
	triageProposals: {
		orderBy: [{ createdAt: "desc" }, { id: "asc" }],
		take: 12,
		select: {
			id: true,
			action: true,
			reason: true,
			evidence: true,
			status: true,
			createdAt: true,
			updatedAt: true,
		},
	},
	touchpoints: {
		orderBy: [{ occurredAt: "desc" }, { id: "asc" }],
		take: 12,
		select: {
			id: true,
			experimentId: true,
			subjectType: true,
			subjectId: true,
			channel: true,
			provider: true,
			externalId: true,
			occurredAt: true,
			metadata: true,
			createdAt: true,
			attributionCredits: {
				orderBy: [{ createdAt: "desc" }, { id: "asc" }],
				take: 6,
				select: {
					id: true,
					subjectType: true,
					subjectId: true,
					model: true,
					credit: true,
					value: true,
					currency: true,
					createdAt: true,
				},
			},
		},
	},
	publications: {
		orderBy: [{ scheduledAt: "asc" }, { createdAt: "desc" }, { id: "asc" }],
		take: 20,
		select: {
			id: true,
			contentItemId: true,
			contentVariantId: true,
			channel: true,
			provider: true,
			externalId: true,
			idempotencyKey: true,
			contentDigest: true,
			status: true,
			approvalRequestId: true,
			actionReceiptId: true,
			scheduledAt: true,
			publishedAt: true,
			receipt: true,
			errorMessage: true,
			createdAt: true,
			updatedAt: true,
		},
	},
	sourceReceipts: {
		orderBy: [{ capturedAt: "desc" }, { id: "asc" }],
		take: 12,
		select: {
			id: true,
			contentItemId: true,
			source: true,
			externalId: true,
			url: true,
			contentHash: true,
			payload: true,
			capturedAt: true,
			createdAt: true,
		},
	},
	_count: {
		select: {
			contentItems: true,
			experiments: true,
			triageProposals: true,
			touchpoints: true,
			attributionCredits: true,
			publications: true,
			sourceReceipts: true,
		},
	},
	createdAt: true,
	updatedAt: true,
} satisfies Prisma.CampaignSelect;

type CampaignRecord = Prisma.CampaignGetPayload<{
	select: typeof CAMPAIGN_SELECT;
}>;

type MarketingPlanPayload = {
	campaignId: string;
	contentItemId: string;
	contentVariantId: string;
	experimentId: string;
	publicationId: string;
	approvalRequestId: string;
	proposalReceiptId: string;
	sourceReceiptId: string;
	touchpointId: string;
	attributionCreditId: string;
	triageProposalId: string;
	workItemId: string;
	configuredBudgetAmount: string;
	currency: string;
	estimatedCostUsd: string;
	actualCostUsd: string;
	publishingDisabled: true;
	socialMutationDisabled: true;
	adSpendMutationDisabled: true;
	providerMutationDisabled: true;
	modelExecutionDisabled: true;
};

type MarketingPlanResult = MarketingPlanPayload & {
	receipt: {
		id: string;
		status: string;
		operationKey: typeof MARKETING_PLAN_OPERATION;
		completedAt: string | null;
	};
};

const SORTABLE: Record<
	string,
	(dir: Prisma.SortOrder) => Prisma.CampaignOrderByWithRelationInput[]
> = {
	updatedAt: (dir) => [{ updatedAt: dir }],
	name: (dir) => [{ name: dir }],
	status: (dir) => [{ status: dir }, { updatedAt: "desc" }],
	channel: (dir) => [{ channel: dir }, { updatedAt: "desc" }],
	startsAt: (dir) => [{ startsAt: { sort: dir, nulls: "last" } }],
	budget: (dir) => [{ budget: { sort: dir, nulls: "last" } }],
};

function iso(value: Date | null): string | null {
	return value?.toISOString() ?? null;
}

function objectValue(value: unknown): Record<string, unknown> {
	return value && typeof value === "object" && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: {};
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

function hashValue(value: unknown): string {
	return createHash("sha256")
		.update(JSON.stringify(canonicalize(value)))
		.digest("hex");
}

function jsonObject(value: Record<string, unknown>): Prisma.InputJsonObject {
	return value as Prisma.InputJsonObject;
}

function money(value: Prisma.Decimal | null): string | null {
	return value?.toString() ?? null;
}

function decimalString(value: number, places: number): string {
	return value.toFixed(places);
}

function parseDate(value: string | undefined): Date | null {
	return value ? new Date(value) : null;
}

function slugify(value: string): string {
	const slug = value
		.toLocaleLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "")
		.slice(0, 80);
	return slug || "campaign";
}

function providerPaused(): boolean {
	return (
		process.env.PROVIDER_MUTATIONS_PAUSED?.trim().toLowerCase() !== "false"
	);
}

function disabledReasons(row: CampaignRecord): string[] {
	const reasons = [
		"Marketing publishing is disabled in this local foundation.",
		"Social account, ad-spend and provider mutations are disabled.",
		"Human approval is required before any public-facing campaign change.",
	];
	if (providerPaused()) reasons.push("Global provider mutations are paused.");
	else reasons.push("No marketing publication executor is enabled.");
	if (
		!row.publications.some((publication) => publication.status === "PLANNED")
	) {
		reasons.push("No planned publication proposal is recorded.");
	}
	if (!row.publications.some((publication) => publication.approvalRequestId)) {
		reasons.push("No approval request is linked to the content calendar.");
	}
	return reasons;
}

function serializeCampaign(
	row: CampaignRecord,
	openWorkCount: number,
	pendingApprovalCount: number,
) {
	return {
		id: row.id,
		name: row.name,
		channel: row.channel,
		objective: row.objective,
		status: row.status,
		owner: row.owner,
		budget: money(row.budget),
		currency: row.currency,
		startsAt: iso(row.startsAt),
		endsAt: iso(row.endsAt),
		metadata: row.metadata,
		contentItems: row.contentItems.map((item) => ({
			...item,
			createdAt: item.createdAt.toISOString(),
			updatedAt: item.updatedAt.toISOString(),
			variants: item.variants.map((variant) => ({
				...variant,
				createdAt: variant.createdAt.toISOString(),
				updatedAt: variant.updatedAt.toISOString(),
			})),
		})),
		experiments: row.experiments.map((experiment) => ({
			...experiment,
			startsAt: iso(experiment.startsAt),
			endsAt: iso(experiment.endsAt),
			createdAt: experiment.createdAt.toISOString(),
			updatedAt: experiment.updatedAt.toISOString(),
		})),
		triageProposals: row.triageProposals.map((proposal) => ({
			...proposal,
			createdAt: proposal.createdAt.toISOString(),
			updatedAt: proposal.updatedAt.toISOString(),
		})),
		touchpoints: row.touchpoints.map((touchpoint) => ({
			...touchpoint,
			occurredAt: touchpoint.occurredAt.toISOString(),
			createdAt: touchpoint.createdAt.toISOString(),
			attributionCredits: touchpoint.attributionCredits.map((credit) => ({
				...credit,
				credit: credit.credit.toString(),
				value: money(credit.value),
				createdAt: credit.createdAt.toISOString(),
			})),
		})),
		publications: row.publications.map((publication) => ({
			...publication,
			scheduledAt: iso(publication.scheduledAt),
			publishedAt: iso(publication.publishedAt),
			createdAt: publication.createdAt.toISOString(),
			updatedAt: publication.updatedAt.toISOString(),
		})),
		sourceReceipts: row.sourceReceipts.map((receipt) => ({
			...receipt,
			capturedAt: receipt.capturedAt.toISOString(),
			createdAt: receipt.createdAt.toISOString(),
		})),
		counts: {
			contentItems: row._count.contentItems,
			experiments: row._count.experiments,
			triageProposals: row._count.triageProposals,
			touchpoints: row._count.touchpoints,
			attributionCredits: row._count.attributionCredits,
			publications: row._count.publications,
			sourceReceipts: row._count.sourceReceipts,
			openWork: openWorkCount,
			pendingApprovals: pendingApprovalCount,
		},
		disabledReasons: disabledReasons(row),
		createdAt: row.createdAt.toISOString(),
		updatedAt: row.updatedAt.toISOString(),
	};
}

@Injectable()
export class MarketingService {
	constructor(
		@InjectDatabase() private readonly db: Db,
		private readonly access: OperatingKernelAccessService,
	) {}

	async list(
		input: MarketingListInput,
	): Promise<ListResult<ReturnType<typeof serializeCampaign>>> {
		const where = this.buildWhere(input);
		const { skip, take } = paginate(input);
		const [rows, total, statuses, channels, owners] = await Promise.all([
			this.db.campaign.findMany({
				where,
				orderBy: [
					...resolveOrderBy(input, SORTABLE, [{ updatedAt: "desc" }]),
					{ id: input.dir },
				],
				skip,
				take,
				select: CAMPAIGN_SELECT,
			}),
			this.db.campaign.count({ where }),
			this.db.campaign.groupBy({
				by: ["status"],
				where,
				_count: { _all: true },
			}),
			this.db.campaign.groupBy({
				by: ["channel"],
				where,
				_count: { _all: true },
			}),
			this.db.campaign.groupBy({
				by: ["ownerId"],
				where,
				_count: { _all: true },
			}),
		]);
		const counts = await this.kernelCounts(rows);
		return {
			rows: rows.map((row) =>
				serializeCampaign(
					row,
					counts.openWork.get(row.id) ?? 0,
					counts.pendingApprovals.get(row.id) ?? 0,
				),
			),
			total,
			facetCounts: {
				status: countsByKey(statuses, "status"),
				channel: countsByKey(channels, "channel", FACET_UNASSIGNED),
				owner: countsByKey(owners, "ownerId", FACET_UNASSIGNED),
			},
		};
	}

	async byId(id: string) {
		const row = await this.db.campaign.findUnique({
			where: { id },
			select: CAMPAIGN_SELECT,
		});
		if (!row) throw new NotFoundException(`No campaign with id ${id}.`);

		const [counts, work, approvals, receipts] = await Promise.all([
			this.kernelCounts([row]),
			this.db.workItem.findMany({
				where: { subjectType: "CAMPAIGN", subjectId: id },
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
				where: { targetType: "CAMPAIGN", targetId: id },
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
			...serializeCampaign(
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

	async plan(
		input: MarketingPlanInput,
		userId: string,
	): Promise<MarketingPlanResult> {
		await this.access.assertMember(userId);
		const requestHash = kernelRequestHash({
			actorId: userId,
			operation: MARKETING_PLAN_OPERATION,
			name: input.name,
			channel: input.channel,
			objective: input.objective ?? null,
			contentKind: input.contentKind,
			contentTitle: input.contentTitle,
			contentBody: input.contentBody,
			audience: input.audience ?? null,
			sourceUrl: input.sourceUrl ?? null,
			startsAt: input.startsAt ?? null,
			scheduledAt: input.scheduledAt ?? null,
			budgetAmount: decimalString(input.budgetAmount, 2),
			currency: input.currency.toUpperCase(),
		});

		return this.db.$transaction(async (tx) => {
			await lockIdempotencyKey(tx, input.clientRequestId);
			const replay = await this.replayPlan(tx, {
				key: input.clientRequestId,
				requestHash,
			});
			if (replay) return replay;

			const result = await this.createPlan(tx, input, userId);
			const receipt = await tx.actionReceipt.create({
				data: {
					idempotencyKey: input.clientRequestId,
					requestHash,
					provider: MARKETING_PROVIDER,
					channel: MARKETING_CHANNEL,
					operationKey: MARKETING_PLAN_OPERATION,
					status: "SUCCEEDED",
					costUsd: result.actualCostUsd,
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
					operationKey: MARKETING_PLAN_OPERATION,
					completedAt: receipt.completedAt?.toISOString() ?? null,
				},
			};
		});
	}

	private buildWhere(input: MarketingListInput): Prisma.CampaignWhereInput {
		const where: Prisma.CampaignWhereInput = {};
		if (input.status !== FACET_ALL) where.status = input.status;
		if (input.channel !== FACET_ALL) {
			where.channel = input.channel === FACET_UNASSIGNED ? null : input.channel;
		}
		if (input.owner !== FACET_ALL) {
			where.ownerId = input.owner === FACET_UNASSIGNED ? null : input.owner;
		}
		if (input.q) {
			where.OR = [
				{ name: { contains: input.q, mode: "insensitive" } },
				{ objective: { contains: input.q, mode: "insensitive" } },
				{ channel: { contains: input.q, mode: "insensitive" } },
				{
					contentItems: {
						some: {
							OR: [
								{ title: { contains: input.q, mode: "insensitive" } },
								{ brief: { contains: input.q, mode: "insensitive" } },
								{ body: { contains: input.q, mode: "insensitive" } },
							],
						},
					},
				},
			];
		}
		return where;
	}

	private async kernelCounts(rows: CampaignRecord[]) {
		const campaignIds = rows.map((row) => row.id);
		if (campaignIds.length === 0) {
			return {
				openWork: new Map<string, number>(),
				pendingApprovals: new Map<string, number>(),
			};
		}
		const [work, approvals] = await Promise.all([
			this.db.workItem.groupBy({
				by: ["subjectId"],
				where: {
					subjectType: "CAMPAIGN",
					subjectId: { in: campaignIds },
					state: { in: [...OPEN_WORK_STATES] },
				},
				_count: { _all: true },
			}),
			this.db.approvalRequest.groupBy({
				by: ["targetId"],
				where: {
					targetType: "CAMPAIGN",
					targetId: { in: campaignIds },
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

	private async receiptsFor(campaignId: string) {
		const receipts = await this.db.actionReceipt.findMany({
			where: {
				provider: MARKETING_PROVIDER,
				operationKey: {
					in: [MARKETING_PLAN_OPERATION, MARKETING_PUBLICATION_OPERATION],
				},
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
				costUsd: true,
				completedAt: true,
				createdAt: true,
			},
		});
		return receipts
			.filter(
				(receipt) => objectValue(receipt.result).campaignId === campaignId,
			)
			.map((receipt) => ({
				...receipt,
				costUsd: money(receipt.costUsd),
				completedAt: iso(receipt.completedAt),
				createdAt: receipt.createdAt.toISOString(),
			}));
	}

	private async replayPlan(
		tx: Prisma.TransactionClient,
		input: { key: string; requestHash: string },
	): Promise<MarketingPlanResult | null> {
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
			receipt.provider !== MARKETING_PROVIDER ||
			receipt.channel !== MARKETING_CHANNEL ||
			receipt.operationKey !== MARKETING_PLAN_OPERATION ||
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
			...(receipt.result as MarketingPlanPayload),
			receipt: {
				id: receipt.id,
				status: receipt.status,
				operationKey: MARKETING_PLAN_OPERATION,
				completedAt: receipt.completedAt?.toISOString() ?? null,
			},
		};
	}

	private async createPlan(
		tx: Prisma.TransactionClient,
		input: MarketingPlanInput,
		userId: string,
	): Promise<MarketingPlanPayload> {
		const now = new Date();
		const startsAt = parseDate(input.startsAt) ?? now;
		const scheduledAt = parseDate(input.scheduledAt);
		const currency = input.currency.toUpperCase();
		const configuredBudgetAmount = decimalString(input.budgetAmount, 2);
		const estimatedCostUsd = "0.000000";
		const actualCostUsd = "0.000000";
		const planKey = input.clientRequestId;
		const campaignId = `campaign-${planKey}`;
		const contentItemId = `content-${planKey}`;
		const contentVariantId = `variant-${planKey}-a`;
		const experimentId = `experiment-${planKey}`;
		const publicationId = `publication-${planKey}`;
		const sourceExternalId = `plan:${planKey}`;
		const source = "operator-marketing-plan";
		const utm = {
			utm_source: "lode-crm",
			utm_medium: input.channel,
			utm_campaign: slugify(input.name),
			utm_content: "variant-a",
		};
		const disabled = {
			publishingDisabled: true,
			socialMutationDisabled: true,
			adSpendMutationDisabled: true,
			providerMutationDisabled: true,
			modelExecutionDisabled: true,
		};
		const calendar = {
			status: "PLANNED",
			scheduledAt: scheduledAt?.toISOString() ?? null,
			channel: input.channel,
			provider: MARKETING_PROVIDER,
			providerExecutionDisabled: true,
		};
		const contentSnapshot = {
			kind: "marketing-publication-proposal",
			campaignId,
			contentItemId,
			contentVariantId,
			publicationId,
			name: input.name,
			channel: input.channel,
			objective: input.objective ?? null,
			audience: input.audience ?? null,
			contentKind: input.contentKind,
			contentTitle: input.contentTitle,
			contentBody: input.contentBody,
			sourceUrl: input.sourceUrl ?? null,
			budgetLimit: {
				amount: configuredBudgetAmount,
				currency,
				estimatedCostUsd,
				actualCostUsd,
			},
			utm,
			calendar,
			approvalExecution: "proposal-only",
			...disabled,
		};
		const expiresAt = new Date(startsAt.getTime() + 14 * 24 * 60 * 60_000);
		const contentDigest = approvalContentDigest({
			action: MARKETING_APPROVAL_ACTION,
			contentSnapshot,
			targetType: "CAMPAIGN",
			targetId: campaignId,
			risk: "MEDIUM",
			policyVersion: MARKETING_POLICY_VERSION,
			expiresAt,
			invalidationVersion: 0,
		});
		const campaign = await tx.campaign.upsert({
			where: { id: campaignId },
			create: {
				id: campaignId,
				name: input.name,
				channel: input.channel,
				objective: input.objective ?? null,
				status: "DRAFT",
				ownerId: userId,
				budget: configuredBudgetAmount,
				currency,
				startsAt,
				metadata: jsonObject({
					foundation: "marketing-planning-local-v1",
					source,
					sourceExternalId,
					utm,
					calendar,
					budgetLimit: {
						amount: configuredBudgetAmount,
						currency,
						estimatedCostUsd,
						actualCostUsd,
					},
					...disabled,
				}),
			},
			update: {
				name: input.name,
				channel: input.channel,
				objective: input.objective ?? null,
				ownerId: userId,
				budget: configuredBudgetAmount,
				currency,
				startsAt,
				metadata: jsonObject({
					foundation: "marketing-planning-local-v1",
					source,
					sourceExternalId,
					utm,
					calendar,
					budgetLimit: {
						amount: configuredBudgetAmount,
						currency,
						estimatedCostUsd,
						actualCostUsd,
					},
					...disabled,
				}),
			},
			select: { id: true },
		});
		await tx.experiment.upsert({
			where: { id: experimentId },
			create: {
				id: experimentId,
				campaignId,
				key: "foundation",
				name: "Foundation content variant review",
				hypothesis:
					"Human-reviewed content and attribution setup should precede any public execution.",
				metric: "approved-publication-proposal",
				status: "DRAFT",
				startsAt,
				metadata: jsonObject({
					requiresApproval: true,
					providerExecutionDisabled: true,
					...disabled,
				}),
			},
			update: {
				startsAt,
				metadata: jsonObject({
					requiresApproval: true,
					providerExecutionDisabled: true,
					...disabled,
				}),
			},
		});
		await tx.contentItem.upsert({
			where: { id: contentItemId },
			create: {
				id: contentItemId,
				campaignId,
				kind: input.contentKind,
				title: input.contentTitle,
				brief: input.objective ?? null,
				body: input.contentBody,
				status: "DRAFT",
				sourceUrl: input.sourceUrl ?? null,
				metadata: jsonObject({
					audience: input.audience ?? null,
					requiresApproval: true,
					...disabled,
				}),
			},
			update: {
				kind: input.contentKind,
				title: input.contentTitle,
				brief: input.objective ?? null,
				body: input.contentBody,
				sourceUrl: input.sourceUrl ?? null,
				metadata: jsonObject({
					audience: input.audience ?? null,
					requiresApproval: true,
					...disabled,
				}),
			},
		});
		await tx.contentVariant.upsert({
			where: { id: contentVariantId },
			create: {
				id: contentVariantId,
				contentItemId,
				key: "A",
				channel: input.channel,
				content: input.contentBody,
				status: "DRAFT",
				experimentId,
				metadata: jsonObject({
					variant: "A",
					utm,
					requiresApproval: true,
					...disabled,
				}),
			},
			update: {
				channel: input.channel,
				content: input.contentBody,
				experimentId,
				metadata: jsonObject({
					variant: "A",
					utm,
					requiresApproval: true,
					...disabled,
				}),
			},
		});
		const approval = await tx.approvalRequest.upsert({
			where: {
				idempotencyKey: `marketing:publication:${publicationId}:approval`,
			},
			create: {
				action: MARKETING_APPROVAL_ACTION,
				contentDigest,
				contentSnapshot: contentSnapshot as Prisma.InputJsonValue,
				targetType: "CAMPAIGN",
				targetId: campaignId,
				targetLabel: input.name,
				risk: "MEDIUM",
				policyVersion: MARKETING_POLICY_VERSION,
				requestorId: userId,
				expiresAt,
				status: "PENDING",
				idempotencyKey: `marketing:publication:${publicationId}:approval`,
			},
			update: {
				targetLabel: input.name,
				requestorId: userId,
			},
			select: { id: true, contentDigest: true },
		});
		const proposalReceipt = await tx.actionReceipt.upsert({
			where: {
				idempotencyKey: `marketing:publication:${publicationId}:proposal-receipt`,
			},
			create: {
				idempotencyKey: `marketing:publication:${publicationId}:proposal-receipt`,
				requestHash: approval.contentDigest,
				provider: MARKETING_PROVIDER,
				channel: input.channel,
				operationKey: MARKETING_PUBLICATION_OPERATION,
				status: "SUCCEEDED",
				costUsd: actualCostUsd,
				completedAt: now,
				approvalRequestId: approval.id,
				result: jsonObject({
					campaignId,
					contentItemId,
					contentVariantId,
					publicationId,
					approvalRequestId: approval.id,
					contentDigest: approval.contentDigest,
					estimatedCostUsd,
					actualCostUsd,
					...disabled,
				}),
			},
			update: {
				status: "SUCCEEDED",
				completedAt: now,
				result: jsonObject({
					campaignId,
					contentItemId,
					contentVariantId,
					publicationId,
					approvalRequestId: approval.id,
					contentDigest: approval.contentDigest,
					estimatedCostUsd,
					actualCostUsd,
					...disabled,
				}),
			},
			select: { id: true },
		});
		await tx.publication.upsert({
			where: { idempotencyKey: `marketing:publication:${publicationId}` },
			create: {
				id: publicationId,
				campaignId,
				contentItemId,
				contentVariantId,
				channel: input.channel,
				provider: MARKETING_PROVIDER,
				externalId: null,
				idempotencyKey: `marketing:publication:${publicationId}`,
				contentDigest: approval.contentDigest,
				status: "PLANNED",
				approvalRequestId: approval.id,
				actionReceiptId: proposalReceipt.id,
				scheduledAt,
				receipt: jsonObject({
					status: "proposal-only",
					publishingDisabled: true,
					providerMutationDisabled: true,
				}),
			},
			update: {
				channel: input.channel,
				contentDigest: approval.contentDigest,
				approvalRequestId: approval.id,
				actionReceiptId: proposalReceipt.id,
				scheduledAt,
				receipt: jsonObject({
					status: "proposal-only",
					publishingDisabled: true,
					providerMutationDisabled: true,
				}),
			},
		});
		const sourceHash = hashValue({ contentSnapshot, contentDigest });
		const sourceReceipt = await tx.marketingSourceReceipt.upsert({
			where: {
				source_externalId: {
					source,
					externalId: sourceExternalId,
				},
			},
			create: {
				campaignId,
				contentItemId,
				source,
				externalId: sourceExternalId,
				url: input.sourceUrl ?? null,
				contentHash: sourceHash,
				payload: jsonObject({
					contentSnapshot,
					contentDigest,
					capturedFrom: "operator-input",
					...disabled,
				}),
				capturedAt: now,
			},
			update: {
				contentHash: sourceHash,
				url: input.sourceUrl ?? null,
				payload: jsonObject({
					contentSnapshot,
					contentDigest,
					capturedFrom: "operator-input",
					...disabled,
				}),
				capturedAt: now,
			},
			select: { id: true },
		});
		const touchpoint = await tx.marketingTouchpoint.upsert({
			where: { idempotencyKey: `marketing:touchpoint:${planKey}` },
			create: {
				campaignId,
				experimentId,
				subjectType: "CAMPAIGN",
				subjectId: campaign.id,
				channel: input.channel,
				provider: MARKETING_PROVIDER,
				externalId: sourceExternalId,
				idempotencyKey: `marketing:touchpoint:${planKey}`,
				occurredAt: scheduledAt ?? startsAt,
				metadata: jsonObject({
					utm,
					sourceReceiptId: sourceReceipt.id,
					attributionStatus: "planned",
					...disabled,
				}),
			},
			update: {
				channel: input.channel,
				occurredAt: scheduledAt ?? startsAt,
				metadata: jsonObject({
					utm,
					sourceReceiptId: sourceReceipt.id,
					attributionStatus: "planned",
					...disabled,
				}),
			},
			select: { id: true },
		});
		const attribution = await tx.attributionCredit.upsert({
			where: { idempotencyKey: `marketing:attribution:${planKey}` },
			create: {
				campaignId,
				touchpointId: touchpoint.id,
				subjectType: "CAMPAIGN",
				subjectId: campaign.id,
				model: "MANUAL",
				credit: "0.000000",
				value: null,
				currency,
				idempotencyKey: `marketing:attribution:${planKey}`,
			},
			update: {
				touchpointId: touchpoint.id,
				currency,
			},
			select: { id: true },
		});
		const triageProposal = await tx.triageProposal.upsert({
			where: { idempotencyKey: `marketing:triage:${campaignId}` },
			create: {
				campaignId,
				contentItemId,
				subjectType: "CAMPAIGN",
				subjectId: campaign.id,
				action: "marketing.plan.review",
				reason:
					"Review campaign objective, content, UTM plan, attribution and disabled publication proposal before any public execution.",
				evidence: jsonObject({
					publicationId,
					approvalRequestId: approval.id,
					sourceReceiptId: sourceReceipt.id,
					touchpointId: touchpoint.id,
					attributionCreditId: attribution.id,
					...disabled,
				}),
				status: "PROPOSED",
				idempotencyKey: `marketing:triage:${campaignId}`,
			},
			update: {
				evidence: jsonObject({
					publicationId,
					approvalRequestId: approval.id,
					sourceReceiptId: sourceReceipt.id,
					touchpointId: touchpoint.id,
					attributionCreditId: attribution.id,
					...disabled,
				}),
			},
			select: { id: true },
		});
		const work = await tx.workItem.upsert({
			where: { id: `marketing-campaign:${campaignId}:planning` },
			create: {
				id: `marketing-campaign:${campaignId}:planning`,
				subjectType: "CAMPAIGN",
				subjectId: campaign.id,
				subjectLabel: input.name,
				ownerId: userId,
				queue: "marketing",
				urgency: "NORMAL",
				reason:
					"Review marketing plan, source receipt, UTM attribution and approval-only publication proposal.",
				primaryAction: "Review marketing plan",
				evidence: jsonObject({
					publicationId,
					approvalRequestId: approval.id,
					contentDigest: approval.contentDigest,
					configuredBudgetAmount,
					currency,
					estimatedCostUsd,
					actualCostUsd,
					...disabled,
				}),
			},
			update: {
				subjectLabel: input.name,
				ownerId: userId,
				evidence: jsonObject({
					publicationId,
					approvalRequestId: approval.id,
					contentDigest: approval.contentDigest,
					configuredBudgetAmount,
					currency,
					estimatedCostUsd,
					actualCostUsd,
					...disabled,
				}),
			},
			select: { id: true },
		});
		return {
			campaignId,
			contentItemId,
			contentVariantId,
			experimentId,
			publicationId,
			approvalRequestId: approval.id,
			proposalReceiptId: proposalReceipt.id,
			sourceReceiptId: sourceReceipt.id,
			touchpointId: touchpoint.id,
			attributionCreditId: attribution.id,
			triageProposalId: triageProposal.id,
			workItemId: work.id,
			configuredBudgetAmount,
			currency,
			estimatedCostUsd,
			actualCostUsd,
			publishingDisabled: true,
			socialMutationDisabled: true,
			adSpendMutationDisabled: true,
			providerMutationDisabled: true,
			modelExecutionDisabled: true,
		};
	}
}
