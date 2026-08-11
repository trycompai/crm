import { type Db, type Prisma } from "@crm/db";
import {
	BadRequestException,
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
	type OwnerSummary,
	type SubjectSummary,
} from "../operating-kernel/operating-kernel.contracts";
import { OperatingKernelAccessService } from "../operating-kernel/operating-kernel-access.service";
import { SubjectResolverService } from "../operating-kernel/subject-resolver.service";
import { type ListResult, paginate, resolveOrderBy } from "../trpc/list-input";
import {
	type WorkAssignInput,
	type WorkListInput,
	type WorkMutationInput,
	type WorkReasonInput,
	type WorkWaitInput,
} from "./work.contracts";
import { workCapabilities } from "./work-capabilities";

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
	evidence: true,
	reason: true,
	state: true,
	primaryAction: true,
	startedAt: true,
	completedAt: true,
	createdAt: true,
	updatedAt: true,
} satisfies Prisma.WorkItemSelect;

type WorkRecord = Prisma.WorkItemGetPayload<{ select: typeof WORK_SELECT }>;

type WorkMutationResult = {
	id: string;
	state: string;
	version: number;
	ownerId: string | null;
	startedAt: string | null;
	completedAt: string | null;
	nextReviewAt: string | null;
};

type WorkOperation =
	| "claim"
	| "assign"
	| "start"
	| "wait"
	| "block"
	| "complete"
	| "dismiss";

function ownerSummary(owner: WorkRecord["owner"]): OwnerSummary | null {
	return owner;
}

function serializeMutation(work: WorkRecord): WorkMutationResult {
	return {
		id: work.id,
		state: work.state,
		version: work.version,
		ownerId: work.ownerId,
		startedAt: isoDate(work.startedAt),
		completedAt: isoDate(work.completedAt),
		nextReviewAt: isoDate(work.nextReviewAt),
	};
}

function serializeWork(
	work: WorkRecord,
	subject: SubjectSummary,
	userId: string,
	isAdmin: boolean,
) {
	return {
		id: work.id,
		state: work.state,
		queue: work.queue,
		urgency: work.urgency,
		dueAt: isoDate(work.dueAt),
		nextReviewAt: isoDate(work.nextReviewAt),
		reason: work.reason,
		primaryAction: work.primaryAction,
		evidence: work.evidence,
		owner: ownerSummary(work.owner),
		subject,
		capabilities: workCapabilities({
			state: work.state,
			ownerId: work.ownerId,
			userId,
			isAdmin,
		}),
		version: work.version,
		startedAt: isoDate(work.startedAt),
		completedAt: isoDate(work.completedAt),
		createdAt: work.createdAt.toISOString(),
		updatedAt: work.updatedAt.toISOString(),
	};
}

function facetCounts(
	groups: Array<{ _count: { _all: number }; [key: string]: unknown }>,
	key: string,
): Record<string, number> {
	const counts: Record<string, number> = {};
	for (const group of groups) {
		const value = group[key];
		if (typeof value !== "string" && value !== null) continue;
		const facet = value ?? "unassigned";
		counts[facet] = (counts[facet] ?? 0) + group._count._all;
	}
	return counts;
}

function dayStart(now: Date): Date {
	const start = new Date(now);
	start.setUTCHours(0, 0, 0, 0);
	return start;
}

function appendTransitionReason(
	evidence: Prisma.JsonValue | null,
	reason: string,
	now: Date,
): Prisma.InputJsonValue {
	const base =
		evidence && typeof evidence === "object" && !Array.isArray(evidence)
			? { ...(evidence as Record<string, unknown>) }
			: { previousEvidence: evidence ?? null };
	return {
		...base,
		lastTransitionReason: reason,
		lastTransitionAt: now.toISOString(),
	} as Prisma.InputJsonValue;
}

@Injectable()
export class WorkService {
	constructor(
		@InjectDatabase() private readonly db: Db,
		private readonly access: OperatingKernelAccessService,
		private readonly subjects: SubjectResolverService,
		private readonly idempotency: KernelIdempotencyService,
	) {}

	async list(
		input: WorkListInput,
		userId: string,
	): Promise<ListResult<ReturnType<typeof serializeWork>>> {
		const member = await this.access.assertMember(userId);
		const where = this.buildWhere(input, userId);
		const { skip, take } = paginate(input);
		const orderBy = [
			resolveOrderBy<Prisma.WorkItemOrderByWithRelationInput>(
				input,
				{
					createdAt: (dir) => ({ createdAt: dir }),
					updatedAt: (dir) => ({ updatedAt: dir }),
					dueAt: (dir) => ({ dueAt: { sort: dir, nulls: "last" } }),
					nextReviewAt: (dir) => ({
						nextReviewAt: { sort: dir, nulls: "last" },
					}),
					urgency: (dir) => ({ urgency: dir }),
					state: (dir) => ({ state: dir }),
					queue: (dir) => ({ queue: dir }),
				},
				{ updatedAt: "desc" },
			),
			{ id: input.dir },
		] as Prisma.WorkItemOrderByWithRelationInput[];

		const [rows, total, states, queues, owners, urgencies, subjectTypes] =
			await Promise.all([
				this.db.workItem.findMany({
					where,
					orderBy,
					skip,
					take,
					select: WORK_SELECT,
				}),
				this.db.workItem.count({ where }),
				this.db.workItem.groupBy({
					by: ["state"],
					where,
					_count: { _all: true },
				}),
				this.db.workItem.groupBy({
					by: ["queue"],
					where,
					_count: { _all: true },
				}),
				this.db.workItem.groupBy({
					by: ["ownerId"],
					where,
					_count: { _all: true },
				}),
				this.db.workItem.groupBy({
					by: ["urgency"],
					where,
					_count: { _all: true },
				}),
				this.db.workItem.groupBy({
					by: ["subjectType"],
					where,
					_count: { _all: true },
				}),
			]);

		const subjects = await this.subjects.resolveMany(
			rows.map((row) => ({ type: row.subjectType, id: row.subjectId })),
		);
		const subjectMap = new Map(
			subjects.map((subject) => [`${subject.type}:${subject.id}`, subject]),
		);

		return {
			rows: rows.map((row) =>
				serializeWork(
					row,
					subjectMap.get(`${row.subjectType}:${row.subjectId}`) ?? {
						type: row.subjectType,
						id: row.subjectId,
						label: null,
						missing: true,
					},
					userId,
					member.isAdmin,
				),
			),
			total,
			facetCounts: {
				state: facetCounts(states, "state"),
				queue: facetCounts(queues, "queue"),
				owner: facetCounts(owners, "ownerId"),
				urgency: facetCounts(urgencies, "urgency"),
				subjectType: facetCounts(subjectTypes, "subjectType"),
			},
		};
	}

	async detail(id: string, userId: string) {
		const member = await this.access.assertMember(userId);
		const work = await this.db.workItem.findUnique({
			where: { id },
			select: WORK_SELECT,
		});
		if (!work) throw new NotFoundException(`No work item with id ${id}.`);
		const subject = await this.subjects.resolveOne({
			type: work.subjectType,
			id: work.subjectId,
		});
		return serializeWork(work, subject, userId, member.isAdmin);
	}

	claim(input: WorkMutationInput, userId: string) {
		return this.mutate("claim", input, userId);
	}

	assign(input: WorkAssignInput, userId: string) {
		return this.mutate("assign", input, userId);
	}

	start(input: WorkMutationInput, userId: string) {
		return this.mutate("start", input, userId);
	}

	wait(input: WorkWaitInput, userId: string) {
		return this.mutate("wait", input, userId);
	}

	block(input: WorkReasonInput, userId: string) {
		return this.mutate("block", input, userId);
	}

	complete(input: WorkMutationInput, userId: string) {
		return this.mutate("complete", input, userId);
	}

	dismiss(input: WorkReasonInput, userId: string) {
		return this.mutate("dismiss", input, userId);
	}

	private buildWhere(
		input: WorkListInput,
		userId: string,
	): Prisma.WorkItemWhereInput {
		const where: Prisma.WorkItemWhereInput = {};
		if (input.state !== "all") where.state = input.state;
		if (input.queue !== "all") where.queue = input.queue;
		if (input.owner === "me") where.ownerId = userId;
		if (input.owner === "unassigned") where.ownerId = null;
		if (input.ownerId) where.ownerId = input.ownerId;
		if (input.subjectType) where.subjectType = input.subjectType;
		if (input.q) {
			where.OR = [
				{ reason: { contains: input.q, mode: "insensitive" } },
				{ primaryAction: { contains: input.q, mode: "insensitive" } },
				{ queue: { contains: input.q, mode: "insensitive" } },
				{ subjectLabel: { contains: input.q, mode: "insensitive" } },
			];
		}
		const now = new Date();
		if (input.due === "overdue") where.dueAt = { lt: now };
		if (input.due === "today") {
			const start = dayStart(now);
			const end = new Date(start);
			end.setUTCDate(end.getUTCDate() + 1);
			where.dueAt = { gte: start, lt: end };
		}
		if (input.due === "upcoming") {
			const end = dayStart(now);
			end.setUTCDate(end.getUTCDate() + 1);
			where.dueAt = { gte: end };
		}
		if (input.due === "none") where.dueAt = null;
		return where;
	}

	private async mutate(
		operation: WorkOperation,
		input:
			| WorkMutationInput
			| WorkAssignInput
			| WorkWaitInput
			| WorkReasonInput,
		userId: string,
	) {
		const requestHash = kernelRequestHash({
			actorId: userId,
			operation,
			...input,
		});
		return this.db.$transaction(async (tx) => {
			await this.idempotency.lock(tx, input.clientRequestId);
			const member = await this.access.assertMember(userId, tx);
			const work = await tx.workItem.findUnique({
				where: { id: input.id },
				select: WORK_SELECT,
			});
			if (!work)
				throw new NotFoundException(`No work item with id ${input.id}.`);
			if (operation === "assign") {
				if (!member.isAdmin) {
					throw new ForbiddenException(
						"Only a workspace owner or admin can assign work.",
					);
				}
			} else if (
				operation !== "claim" ||
				(work.ownerId !== null && work.ownerId !== userId && !member.isAdmin)
			) {
				await this.access.assertCanActOnWork(userId, work.ownerId, tx);
			}
			const replay = await this.idempotency.replay<WorkMutationResult>(
				tx,
				input.clientRequestId,
				requestHash,
			);
			if (replay) return replay;

			if (work.version !== input.expectedVersion) {
				throw new ConflictException("Work item version is stale.");
			}

			const now = new Date();
			let data: Prisma.WorkItemUncheckedUpdateManyInput;
			if (operation === "claim") {
				if (
					work.ownerId !== null &&
					work.ownerId !== userId &&
					!member.isAdmin
				) {
					throw new ForbiddenException(
						"You can only claim unassigned work or replay your own claim.",
					);
				}
				if (work.state !== "OPEN" || work.ownerId !== null) {
					throw new ConflictException(
						"Only unassigned open work can be claimed.",
					);
				}
				data = { ownerId: userId, version: { increment: 1 } };
			} else if (operation === "assign") {
				if (!member.isAdmin) {
					throw new ForbiddenException(
						"Only a workspace owner or admin can assign work.",
					);
				}
				if (work.state === "DONE" || work.state === "DISMISSED") {
					throw new ConflictException("Terminal work cannot be assigned.");
				}
				const assigneeId = (input as WorkAssignInput).assigneeId;
				if (assigneeId)
					await this.access.assertAssignmentTarget(assigneeId, tx);
				data = { ownerId: assigneeId, version: { increment: 1 } };
			} else {
				await this.access.assertCanActOnWork(userId, work.ownerId, tx);
				data = this.transitionData(operation, work, input, now);
			}

			const updated = await tx.workItem.updateMany({
				where: {
					id: work.id,
					version: input.expectedVersion,
					state: work.state,
				},
				data,
			});
			if (updated.count !== 1)
				throw new ConflictException("Work item changed during the request.");

			const result = await tx.workItem.findUnique({
				where: { id: work.id },
				select: WORK_SELECT,
			});
			if (!result)
				throw new ConflictException(
					"Work item disappeared during the request.",
				);
			const output = serializeMutation(result);
			await this.idempotency.record(tx, {
				key: input.clientRequestId,
				requestHash,
				operation,
				result: output,
			});
			return output;
		});
	}

	private transitionData(
		operation: Exclude<WorkOperation, "claim" | "assign">,
		work: WorkRecord,
		input: WorkMutationInput | WorkWaitInput | WorkReasonInput,
		now: Date,
	): Prisma.WorkItemUncheckedUpdateManyInput {
		const nonTerminal = ["OPEN", "IN_PROGRESS", "WAITING", "BLOCKED"] as const;
		if (!nonTerminal.includes(work.state as (typeof nonTerminal)[number])) {
			throw new ConflictException("Terminal work cannot transition.");
		}

		if (operation === "start") {
			if (work.state !== "OPEN")
				throw new ConflictException("Only open work can start.");
			return {
				state: "IN_PROGRESS",
				startedAt: work.startedAt ?? now,
				completedAt: null,
				nextReviewAt: null,
				version: { increment: 1 },
			};
		}
		if (operation === "wait") {
			if (work.state !== "OPEN" && work.state !== "IN_PROGRESS") {
				throw new ConflictException("Only open or active work can wait.");
			}
			const nextReviewAt = new Date((input as WorkWaitInput).nextReviewAt);
			if (nextReviewAt <= now)
				throw new BadRequestException("Next review must be in the future.");
			return {
				state: "WAITING",
				nextReviewAt,
				completedAt: null,
				evidence: appendTransitionReason(
					work.evidence,
					(input as WorkWaitInput).reason,
					now,
				),
				version: { increment: 1 },
			};
		}
		if (operation === "block") {
			if (
				work.state !== "OPEN" &&
				work.state !== "IN_PROGRESS" &&
				work.state !== "WAITING"
			) {
				throw new ConflictException(
					"This work cannot be blocked from its current state.",
				);
			}
			return {
				state: "BLOCKED",
				nextReviewAt: null,
				completedAt: null,
				evidence: appendTransitionReason(
					work.evidence,
					(input as WorkReasonInput).reason,
					now,
				),
				version: { increment: 1 },
			};
		}
		return {
			state: operation === "complete" ? "DONE" : "DISMISSED",
			completedAt: now,
			nextReviewAt: null,
			evidence:
				operation === "dismiss"
					? appendTransitionReason(
							work.evidence,
							(input as WorkReasonInput).reason,
							now,
						)
					: undefined,
			version: { increment: 1 },
		};
	}
}
