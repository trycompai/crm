import { type Db, type Prisma } from "@crm/db";
import { Injectable } from "@nestjs/common";
import {
	approvalCapabilities,
	approvalDigestMatches,
} from "../approval/approval.service";
import { InjectDatabase } from "../database/database.constants";
import {
	type OwnerSummary,
	type SubjectRef,
	type SubjectSummary,
} from "../operating-kernel/operating-kernel.contracts";
import {
	type KernelMember,
	OperatingKernelAccessService,
} from "../operating-kernel/operating-kernel-access.service";
import { SubjectResolverService } from "../operating-kernel/subject-resolver.service";
import { workCapabilities } from "../work/work-capabilities";
import type { TodayInput } from "./today.contracts";

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

const APPROVAL_SELECT = {
	id: true,
	action: true,
	contentDigest: true,
	contentSnapshot: true,
	targetType: true,
	targetId: true,
	risk: true,
	policyVersion: true,
	requestor: { select: OWNER_SELECT },
	expiresAt: true,
	invalidationVersion: true,
	version: true,
	status: true,
	requestedAt: true,
	decidedAt: true,
} satisfies Prisma.ApprovalRequestSelect;

type WorkRecord = Prisma.WorkItemGetPayload<{ select: typeof WORK_SELECT }>;
type TodayRow = {
	kind: string;
	id: string;
	state: string;
	queue: string | null;
	urgency: string | null;
	reason: string | null;
	primaryAction: string;
	evidence: Prisma.JsonValue | null;
	owner: OwnerSummary | null;
	subject: SubjectSummary | null;
	dueAt: string | null;
	nextReviewAt: string | null;
	version: number | null;
	startedAt: string | null;
	updatedAt: string;
	integrityValid?: boolean;
};

type TodaySection = {
	rows: TodayRow[];
	total: number;
};

function iso(value: Date | null): string | null {
	return value?.toISOString() ?? null;
}

function subjectRef(type: string | null, id: string | null): SubjectRef | null {
	if (!type || !id) return null;
	return { type: type as SubjectRef["type"], id };
}

function subjectKey(subject: SubjectRef): string {
	return `${subject.type}:${subject.id}`;
}

function ownerSummary(
	owner: {
		id: string;
		name: string;
		email: string;
		image: string | null;
	} | null,
): OwnerSummary | null {
	return owner;
}

function timestamp(row: TodayRow): number {
	return Date.parse(row.updatedAt);
}

function sortRows(rows: TodayRow[]): TodayRow[] {
	return [...rows].sort((left, right) => {
		const time = timestamp(right) - timestamp(left);
		return time || left.id.localeCompare(right.id);
	});
}

@Injectable()
export class TodayService {
	constructor(
		@InjectDatabase() private readonly db: Db,
		private readonly access: OperatingKernelAccessService,
		private readonly subjects: SubjectResolverService,
	) {}

	async get(input: TodayInput, userId: string) {
		const member = await this.access.assertMember(userId);
		const [
			doNext,
			needsApproval,
			waiting,
			blockedOrFailed,
			running,
			incidents,
		] = await Promise.all([
			this.workSection(
				{ ownerId: userId, state: { in: ["OPEN", "IN_PROGRESS"] } },
				input.limit,
				userId,
				member.isAdmin,
			),
			this.approvalSection(input.limit, member),
			this.workSection(
				{ ownerId: userId, state: "WAITING" },
				input.limit,
				userId,
				member.isAdmin,
			),
			this.blockedOrFailedSection(input.limit, userId, member.isAdmin),
			this.runningSection(input.limit, userId, member.isAdmin),
			this.incidentSection(input.limit, member.isAdmin),
		]);

		return {
			viewer: {
				role: member.role,
				isAdmin: member.isAdmin,
				mode: member.isAdmin ? "owner" : "operator",
			},
			sections: {
				doNext,
				needsApproval,
				waiting,
				blockedOrFailed,
				running,
				incidents,
			},
		};
	}

	private async workSection(
		where: Prisma.WorkItemWhereInput,
		limit: number,
		userId: string,
		isAdmin: boolean,
	): Promise<TodaySection> {
		const [rows, total] = await Promise.all([
			this.db.workItem.findMany({
				where,
				orderBy: [
					{ urgency: "desc" },
					{ dueAt: { sort: "asc", nulls: "last" } },
					{ updatedAt: "desc" },
					{ id: "asc" },
				],
				take: limit,
				select: WORK_SELECT,
			}),
			this.db.workItem.count({ where }),
		]);
		return { rows: await this.serializeWork(rows, userId, isAdmin), total };
	}

	private async serializeWork(
		rows: WorkRecord[],
		userId: string,
		isAdmin: boolean,
	): Promise<TodayRow[]> {
		const resolved = await this.subjects.resolveMany(
			rows.map((row) => ({ type: row.subjectType, id: row.subjectId })),
		);
		const subjectMap = new Map(
			resolved.map((subject) => [subjectKey(subject), subject]),
		);
		return rows.map((row) => ({
			kind: "work",
			id: row.id,
			state: row.state,
			queue: row.queue,
			urgency: row.urgency,
			reason: row.reason,
			primaryAction: row.primaryAction,
			evidence: row.evidence,
			owner: ownerSummary(row.owner),
			subject: subjectMap.get(`${row.subjectType}:${row.subjectId}`) ?? {
				type: row.subjectType,
				id: row.subjectId,
				label: null,
				missing: true,
			},
			dueAt: iso(row.dueAt),
			nextReviewAt: iso(row.nextReviewAt),
			version: row.version,
			startedAt: iso(row.startedAt),
			updatedAt: row.updatedAt.toISOString(),
			capabilities: workCapabilities({
				state: row.state,
				ownerId: row.ownerId,
				userId,
				isAdmin,
			}),
		})) as TodayRow[];
	}

	private async approvalSection(
		limit: number,
		member: KernelMember,
	): Promise<TodaySection> {
		const now = new Date();
		const where: Prisma.ApprovalRequestWhereInput = {
			status: "PENDING",
			expiresAt: { gt: now },
		};
		if (!member.isAdmin) {
			where.AND = [
				{ risk: { in: ["LOW", "MEDIUM"] } },
				{
					OR: [
						{ action: { startsWith: "outreach." } },
						{ action: { startsWith: "marketing." } },
					],
				},
			];
		}
		const [rows, total] = await Promise.all([
			this.db.approvalRequest.findMany({
				where,
				orderBy: [{ expiresAt: "asc" }, { requestedAt: "asc" }, { id: "asc" }],
				take: limit,
				select: APPROVAL_SELECT,
			}),
			this.db.approvalRequest.count({ where }),
		]);
		const targets = await this.subjects.resolveMany(
			rows.map((row) => ({ type: row.targetType, id: row.targetId })),
		);
		const targetMap = new Map(
			targets.map((target) => [subjectKey(target), target]),
		);
		return {
			rows: rows.map((row) => ({
				kind: "approval",
				id: row.id,
				state: row.status,
				queue: "approvals",
				urgency: row.risk,
				reason: "Approval requested",
				primaryAction: row.action,
				evidence: null,
				owner: ownerSummary(row.requestor),
				subject: targetMap.get(`${row.targetType}:${row.targetId}`) ?? {
					type: row.targetType,
					id: row.targetId,
					label: null,
					missing: true,
				},
				dueAt: row.expiresAt.toISOString(),
				nextReviewAt: null,
				version: row.version,
				startedAt: null,
				updatedAt: row.requestedAt.toISOString(),
				integrityValid: approvalDigestMatches(row),
				capabilities: approvalCapabilities(
					row,
					member,
					approvalDigestMatches(row),
				),
			})) as TodayRow[],
			total,
		};
	}

	private async blockedOrFailedSection(
		limit: number,
		userId: string,
		isAdmin: boolean,
	): Promise<TodaySection> {
		const work = await this.workSection(
			{ state: "BLOCKED", ...(isAdmin ? {} : { ownerId: userId }) },
			limit,
			userId,
			isAdmin,
		);
		if (!isAdmin) return work;
		const [tasks, taskTotal] = await Promise.all([
			this.db.agentTask.findMany({
				where: { state: { in: ["FAILED", "UNKNOWN"] } },
				orderBy: [{ dueAt: "asc" }, { id: "asc" }],
				take: limit,
				select: {
					id: true,
					subjectType: true,
					subjectId: true,
					kind: true,
					reason: true,
					state: true,
					dueAt: true,
					finishedAt: true,
					createdAt: true,
				},
			}),
			this.db.agentTask.count({
				where: { state: { in: ["FAILED", "UNKNOWN"] } },
			}),
		]);
		const taskRows = await this.serializeTaskRows(tasks);
		return {
			rows: sortRows([...work.rows, ...taskRows]).slice(0, limit),
			total: work.total + taskTotal,
		};
	}

	private async runningSection(
		limit: number,
		userId: string,
		isAdmin: boolean,
	): Promise<TodaySection> {
		const work = await this.workSection(
			{ state: "IN_PROGRESS", ...(isAdmin ? {} : { ownerId: userId }) },
			limit,
			userId,
			isAdmin,
		);
		if (!isAdmin) return work;
		const [tasks, taskTotal, runs, runTotal] = await Promise.all([
			this.db.agentTask.findMany({
				where: { state: "LEASED" },
				orderBy: [{ dueAt: "asc" }, { id: "asc" }],
				take: limit,
				select: {
					id: true,
					subjectType: true,
					subjectId: true,
					kind: true,
					reason: true,
					state: true,
					dueAt: true,
					startedAt: true,
					createdAt: true,
				},
			}),
			this.db.agentTask.count({ where: { state: "LEASED" } }),
			this.db.agentRun.findMany({
				where: { status: "RUNNING" },
				orderBy: [{ startedAt: "asc" }, { id: "asc" }],
				take: limit,
				select: {
					id: true,
					subjectType: true,
					subjectId: true,
					status: true,
					operationKey: true,
					summary: true,
					startedAt: true,
					createdAt: true,
				},
			}),
			this.db.agentRun.count({ where: { status: "RUNNING" } }),
		]);
		const taskRows = await this.serializeTaskRows(tasks);
		const runRows = await this.serializeRunRows(runs);
		return {
			rows: sortRows([...work.rows, ...taskRows, ...runRows]).slice(0, limit),
			total: work.total + taskTotal + runTotal,
		};
	}

	private async incidentSection(
		limit: number,
		isAdmin: boolean,
	): Promise<TodaySection> {
		if (!isAdmin) return { rows: [], total: 0 };
		const where: Prisma.IncidentWhereInput = {
			status: { notIn: ["RESOLVED", "CLOSED"] },
		};
		const [rows, total] = await Promise.all([
			this.db.incident.findMany({
				where,
				orderBy: [{ severity: "desc" }, { detectedAt: "asc" }, { id: "asc" }],
				take: limit,
				select: {
					id: true,
					instanceId: true,
					severity: true,
					status: true,
					title: true,
					summary: true,
					detectedAt: true,
					updatedAt: true,
				},
			}),
			this.db.incident.count({ where }),
		]);
		const subjects = await this.subjects.resolveMany(
			rows.map((row) => ({ type: "CUSTOMER_INSTANCE", id: row.instanceId })),
		);
		const subjectMap = new Map(
			subjects.map((subject) => [subjectKey(subject), subject]),
		);
		return {
			rows: rows.map((row) => ({
				kind: "incident",
				id: row.id,
				state: row.status,
				queue: "incidents",
				urgency: row.severity,
				reason: row.summary,
				primaryAction: row.title,
				evidence: null,
				owner: null,
				subject: subjectMap.get(`CUSTOMER_INSTANCE:${row.instanceId}`) ?? {
					type: "CUSTOMER_INSTANCE",
					id: row.instanceId,
					label: null,
					missing: true,
				},
				dueAt: row.detectedAt.toISOString(),
				nextReviewAt: null,
				version: null,
				startedAt: null,
				updatedAt: row.updatedAt.toISOString(),
			})) as TodayRow[],
			total,
		};
	}

	private async serializeTaskRows(
		rows: Array<{
			id: string;
			subjectType: string | null;
			subjectId: string | null;
			kind: string;
			reason: string;
			state: string;
			dueAt: Date;
			startedAt?: Date | null;
			finishedAt?: Date | null;
			createdAt: Date;
		}>,
	): Promise<TodayRow[]> {
		const refs = rows
			.map((row) => subjectRef(row.subjectType, row.subjectId))
			.filter((ref): ref is SubjectRef => ref !== null);
		const subjects = await this.subjects.resolveMany(refs);
		const subjectMap = new Map(
			subjects.map((subject) => [subjectKey(subject), subject]),
		);
		return rows.map((row) => ({
			kind: "agentTask",
			id: row.id,
			state: row.state,
			queue: "agent",
			urgency: null,
			reason: row.reason,
			primaryAction: row.kind,
			evidence: null,
			owner: null,
			subject: this.resolveOptionalSubject(row, subjectMap),
			dueAt: row.dueAt.toISOString(),
			nextReviewAt: null,
			version: null,
			startedAt: iso(row.startedAt ?? null),
			updatedAt: (row.finishedAt ?? row.createdAt).toISOString(),
		}));
	}

	private async serializeRunRows(
		rows: Array<{
			id: string;
			subjectType: string | null;
			subjectId: string | null;
			status: string;
			operationKey: string | null;
			summary: string | null;
			startedAt: Date | null;
			createdAt: Date;
		}>,
	): Promise<TodayRow[]> {
		const refs = rows
			.map((row) => subjectRef(row.subjectType, row.subjectId))
			.filter((ref): ref is SubjectRef => ref !== null);
		const subjects = await this.subjects.resolveMany(refs);
		const subjectMap = new Map(
			subjects.map((subject) => [subjectKey(subject), subject]),
		);
		return rows.map((row) => ({
			kind: "agentRun",
			id: row.id,
			state: row.status,
			queue: "agent",
			urgency: null,
			reason: row.summary,
			primaryAction: row.operationKey ?? "Agent run",
			evidence: null,
			owner: null,
			subject: this.resolveOptionalSubject(row, subjectMap),
			dueAt: null,
			nextReviewAt: null,
			version: null,
			startedAt: iso(row.startedAt),
			updatedAt: (row.startedAt ?? row.createdAt).toISOString(),
		}));
	}

	private resolveOptionalSubject(
		row: { subjectType: string | null; subjectId: string | null },
		subjectMap: Map<string, SubjectSummary>,
	): SubjectSummary | null {
		const ref = subjectRef(row.subjectType, row.subjectId);
		return ref
			? (subjectMap.get(subjectKey(ref)) ?? {
					...ref,
					label: null,
					missing: true,
				})
			: null;
	}
}
