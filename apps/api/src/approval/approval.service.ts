import { type Db, type Prisma } from "@crm/db";
import { approvalContentDigest } from "@crm/db/approval";
import {
	ConflictException,
	ForbiddenException,
	Injectable,
	NotFoundException,
} from "@nestjs/common";
import { InjectDatabase } from "../database/database.constants";
import {
	KernelIdempotencyService,
	kernelRequestHash,
} from "../operating-kernel/kernel-idempotency.service";
import {
	isoDate,
	memberCanReviewApproval,
	type OwnerSummary,
	type SubjectSummary,
} from "../operating-kernel/operating-kernel.contracts";
import {
	type KernelMember,
	OperatingKernelAccessService,
} from "../operating-kernel/operating-kernel-access.service";
import { SubjectResolverService } from "../operating-kernel/subject-resolver.service";
import { type ListResult, paginate, resolveOrderBy } from "../trpc/list-input";
import {
	type ApprovalListInput,
	type ApprovalMutationInput,
} from "./approval.contracts";

const USER_SELECT = {
	id: true,
	name: true,
	email: true,
	image: true,
} satisfies Prisma.UserSelect;

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
	requestorId: true,
	requestor: { select: USER_SELECT },
	approverId: true,
	approver: { select: USER_SELECT },
	expiresAt: true,
	invalidationVersion: true,
	version: true,
	status: true,
	requestedAt: true,
	decidedAt: true,
	createdAt: true,
	updatedAt: true,
} satisfies Prisma.ApprovalRequestSelect;

type ApprovalRecord = Prisma.ApprovalRequestGetPayload<{
	select: typeof APPROVAL_SELECT;
}>;

type ApprovalOperation = "approve" | "reject" | "invalidate";

type ApprovalCapabilities = {
	canApprove: boolean;
	canReject: boolean;
	canInvalidate: boolean;
};

type ApprovalMutationResult = {
	approval: ReturnType<typeof serializeApproval>;
	receipt: {
		id: string;
		status: "SUCCEEDED";
	};
};

export function approvalCapabilities(
	approval: Pick<ApprovalRecord, "status" | "expiresAt" | "risk" | "action">,
	member: KernelMember,
	integrityValid = true,
	now = new Date(),
): ApprovalCapabilities {
	if (!integrityValid) {
		return { canApprove: false, canReject: false, canInvalidate: false };
	}
	const active =
		(approval.status === "PENDING" || approval.status === "APPROVED") &&
		approval.expiresAt > now;
	const canReview =
		member.isAdmin || memberCanReviewApproval(approval.risk, approval.action);
	return {
		canApprove: active && approval.status === "PENDING" && canReview,
		canReject: active && canReview,
		canInvalidate: active && member.isAdmin,
	};
}

function userSummary(user: ApprovalRecord["requestor"]): OwnerSummary | null {
	return user;
}

export function approvalDigestMatches(
	approval: Pick<
		ApprovalRecord,
		| "action"
		| "contentSnapshot"
		| "targetType"
		| "targetId"
		| "risk"
		| "policyVersion"
		| "expiresAt"
		| "invalidationVersion"
		| "contentDigest"
	>,
): boolean {
	return (
		approvalContentDigest({
			action: approval.action,
			contentSnapshot: approval.contentSnapshot,
			targetType: approval.targetType,
			targetId: approval.targetId,
			risk: approval.risk,
			policyVersion: approval.policyVersion,
			expiresAt: approval.expiresAt,
			invalidationVersion: approval.invalidationVersion,
		}) === approval.contentDigest
	);
}

function serializeApproval(
	approval: ApprovalRecord,
	target: SubjectSummary,
	member: KernelMember,
	includeSnapshot: boolean,
	integrityValid: boolean,
) {
	return {
		id: approval.id,
		action: approval.action,
		...(includeSnapshot ? { contentSnapshot: approval.contentSnapshot } : {}),
		contentDigest: approval.contentDigest,
		integrityValid,
		target,
		risk: approval.risk,
		policyVersion: approval.policyVersion,
		requestor: userSummary(approval.requestor),
		approver: userSummary(approval.approver),
		expiresAt: approval.expiresAt.toISOString(),
		invalidationVersion: approval.invalidationVersion,
		version: approval.version,
		status: approval.status,
		requestedAt: approval.requestedAt.toISOString(),
		decidedAt: isoDate(approval.decidedAt),
		createdAt: approval.createdAt.toISOString(),
		updatedAt: approval.updatedAt.toISOString(),
		viewer: approvalCapabilities(approval, member, integrityValid),
	};
}

function facetCounts(
	groups: Array<{ _count: { _all: number }; [key: string]: unknown }>,
	key: string,
): Record<string, number> {
	const counts: Record<string, number> = {};
	for (const group of groups) {
		const value = group[key];
		if (typeof value !== "string") continue;
		counts[value] = (counts[value] ?? 0) + group._count._all;
	}
	return counts;
}

@Injectable()
export class ApprovalService {
	constructor(
		@InjectDatabase() private readonly db: Db,
		private readonly access: OperatingKernelAccessService,
		private readonly subjects: SubjectResolverService,
		private readonly idempotency: KernelIdempotencyService,
	) {}

	async list(
		input: ApprovalListInput,
		userId: string,
	): Promise<ListResult<ReturnType<typeof serializeApproval>>> {
		const member = await this.access.assertMember(userId);
		const where = this.buildWhere(input);
		const { skip, take } = paginate(input);
		const orderBy = [
			resolveOrderBy<Prisma.ApprovalRequestOrderByWithRelationInput>(
				input,
				{
					requestedAt: (dir) => ({ requestedAt: dir }),
					expiresAt: (dir) => ({ expiresAt: dir }),
					updatedAt: (dir) => ({ updatedAt: dir }),
					status: (dir) => ({ status: dir }),
					risk: (dir) => ({ risk: dir }),
					action: (dir) => ({ action: dir }),
				},
				{ requestedAt: "desc" },
			),
			{ id: input.dir },
		] as Prisma.ApprovalRequestOrderByWithRelationInput[];

		const [rows, total, statuses, risks, targetTypes, actions] =
			await Promise.all([
				this.db.approvalRequest.findMany({
					where,
					orderBy,
					skip,
					take,
					select: APPROVAL_SELECT,
				}),
				this.db.approvalRequest.count({ where }),
				this.db.approvalRequest.groupBy({
					by: ["status"],
					where,
					_count: { _all: true },
				}),
				this.db.approvalRequest.groupBy({
					by: ["risk"],
					where,
					_count: { _all: true },
				}),
				this.db.approvalRequest.groupBy({
					by: ["targetType"],
					where,
					_count: { _all: true },
				}),
				this.db.approvalRequest.groupBy({
					by: ["action"],
					where,
					_count: { _all: true },
				}),
			]);

		const targets = await this.subjects.resolveMany(
			rows.map((row) => ({ type: row.targetType, id: row.targetId })),
		);
		const targetMap = new Map(
			targets.map((target) => [`${target.type}:${target.id}`, target]),
		);
		return {
			rows: rows.map((row) =>
				serializeApproval(
					row,
					targetMap.get(`${row.targetType}:${row.targetId}`) ?? {
						type: row.targetType,
						id: row.targetId,
						label: null,
						missing: true,
					},
					member,
					false,
					approvalDigestMatches(row),
				),
			),
			total,
			facetCounts: {
				status: facetCounts(statuses, "status"),
				risk: facetCounts(risks, "risk"),
				targetType: facetCounts(targetTypes, "targetType"),
				action: facetCounts(actions, "action"),
			},
		};
	}

	async detail(id: string, userId: string) {
		const member = await this.access.assertMember(userId);
		const approval = await this.db.approvalRequest.findUnique({
			where: { id },
			select: APPROVAL_SELECT,
		});
		if (!approval)
			throw new NotFoundException(`No approval request with id ${id}.`);
		const integrityValid = approvalDigestMatches(approval);
		if (
			!member.isAdmin &&
			!memberCanReviewApproval(approval.risk, approval.action)
		) {
			throw new ForbiddenException("You cannot inspect this approval request.");
		}
		const target = await this.subjects.resolveOne({
			type: approval.targetType,
			id: approval.targetId,
		});
		return serializeApproval(approval, target, member, true, integrityValid);
	}

	approve(input: ApprovalMutationInput, userId: string) {
		return this.mutate("approve", input, userId);
	}

	reject(input: ApprovalMutationInput, userId: string) {
		return this.mutate("reject", input, userId);
	}

	invalidate(input: ApprovalMutationInput, userId: string) {
		return this.mutate("invalidate", input, userId);
	}

	private async mutate(
		operation: ApprovalOperation,
		input: ApprovalMutationInput,
		userId: string,
	): Promise<ApprovalMutationResult> {
		const requestHash = kernelRequestHash({
			actorId: userId,
			operation,
			...input,
		});
		const result = await this.db.$transaction(async (tx) => {
			await this.idempotency.lock(tx, input.clientRequestId);
			const member = await this.access.assertMember(userId, tx);
			const approval = await tx.approvalRequest.findUnique({
				where: { id: input.id },
				select: APPROVAL_SELECT,
			});
			if (!approval)
				throw new NotFoundException(`No approval request with id ${input.id}.`);
			this.assertAuthorized(operation, approval, member);

			const replay = await this.idempotency.replay<ApprovalMutationResult>(
				tx,
				input.clientRequestId,
				requestHash,
			);
			if (replay) {
				this.assertReplayState(operation, approval, input);
				return replay;
			}
			this.assertDigest(approval);

			const now = new Date();
			if (
				(approval.status === "PENDING" || approval.status === "APPROVED") &&
				approval.expiresAt <= now
			) {
				await tx.approvalRequest.updateMany({
					where: {
						id: approval.id,
						status: approval.status,
						version: approval.version,
					},
					data: { status: "EXPIRED", version: { increment: 1 } },
				});
				return { expired: true as const };
			}

			const allowedStatuses =
				operation === "approve"
					? (["PENDING"] as const)
					: (["PENDING", "APPROVED"] as const);
			if (!allowedStatuses.includes(approval.status as never)) {
				throw new ConflictException(
					`Approval request cannot be ${operation}d from ${approval.status}.`,
				);
			}
			if (
				approval.contentDigest !== input.contentDigest ||
				approval.version !== input.expectedVersion ||
				approval.invalidationVersion !== input.invalidationVersion
			) {
				throw new ConflictException("Approval request is stale.");
			}

			const updated = await tx.approvalRequest.updateMany({
				where: {
					id: approval.id,
					status: { in: [...allowedStatuses] },
					contentDigest: input.contentDigest,
					version: input.expectedVersion,
					invalidationVersion: input.invalidationVersion,
					expiresAt: { gt: now },
				},
				data: {
					status:
						operation === "approve"
							? "APPROVED"
							: operation === "reject"
								? "REJECTED"
								: "INVALIDATED",
					approverId: userId,
					decidedAt: now,
					...(operation === "invalidate"
						? { invalidationVersion: { increment: 1 } }
						: {}),
					version: { increment: 1 },
				},
			});
			if (updated.count !== 1)
				throw new ConflictException(
					"Approval request changed during the request.",
				);

			const current = await tx.approvalRequest.findUnique({
				where: { id: approval.id },
				select: APPROVAL_SELECT,
			});
			if (!current)
				throw new ConflictException(
					"Approval request disappeared during the request.",
				);
			const target = await this.subjects.resolveOne(
				{ type: current.targetType, id: current.targetId },
				tx,
			);
			const output: ApprovalMutationResult = {
				approval: serializeApproval(
					current,
					target,
					member,
					false,
					approvalDigestMatches(current),
				),
				receipt: { id: "", status: "SUCCEEDED" },
			};
			await this.idempotency.record(tx, {
				key: input.clientRequestId,
				requestHash,
				operation: `approval.${operation}`,
				result: output,
			});
			const receipt = await tx.actionReceipt.findUnique({
				where: { idempotencyKey: input.clientRequestId },
				select: { id: true, status: true },
			});
			if (receipt?.status !== "SUCCEEDED")
				throw new ConflictException("Approval receipt was not recorded.");
			output.receipt = { id: receipt.id, status: "SUCCEEDED" };
			await tx.actionReceipt.update({
				where: { id: receipt.id },
				data: { result: output as Prisma.InputJsonValue },
			});
			return output;
		});
		if ("expired" in result) {
			throw new ConflictException("Approval request has expired.");
		}
		return result;
	}

	private assertDigest(approval: ApprovalRecord): void {
		if (!approvalDigestMatches(approval)) {
			throw new ConflictException("Approval content digest is invalid.");
		}
	}

	private assertReplayState(
		operation: ApprovalOperation,
		approval: ApprovalRecord,
		input: ApprovalMutationInput,
	): void {
		const status =
			operation === "approve"
				? "APPROVED"
				: operation === "reject"
					? "REJECTED"
					: "INVALIDATED";
		const invalidationVersion =
			operation === "invalidate"
				? input.invalidationVersion + 1
				: input.invalidationVersion;
		if (
			approval.status !== status ||
			approval.version !== input.expectedVersion + 1 ||
			approval.invalidationVersion !== invalidationVersion ||
			approval.contentDigest !== input.contentDigest
		) {
			throw new ConflictException("Approval replay state is stale.");
		}
	}

	private assertAuthorized(
		operation: ApprovalOperation,
		approval: ApprovalRecord,
		member: KernelMember,
	): void {
		if (operation === "invalidate") {
			if (!member.isAdmin)
				throw new ForbiddenException(
					"Only a workspace owner or admin can invalidate approvals.",
				);
			return;
		}
		if (
			!member.isAdmin &&
			!memberCanReviewApproval(approval.risk, approval.action)
		) {
			throw new ForbiddenException(
				"Members can only review low or medium outreach and marketing approvals.",
			);
		}
	}

	private buildWhere(
		input: ApprovalListInput,
	): Prisma.ApprovalRequestWhereInput {
		const where: Prisma.ApprovalRequestWhereInput = {};
		if (input.status !== "all") where.status = input.status;
		if (input.risk !== "all") where.risk = input.risk;
		if (input.targetType !== "all") where.targetType = input.targetType;
		if (input.action)
			where.action = { contains: input.action, mode: "insensitive" };
		if (input.q) {
			where.OR = [
				{ action: { contains: input.q, mode: "insensitive" } },
				{ targetLabel: { contains: input.q, mode: "insensitive" } },
			];
		}
		return where;
	}
}
