import { db, Prisma } from "@crm/db";
import {
	DIRECT_KINDS as DIRECT_TASK_KINDS,
	MAX_ATTEMPTS,
	PRIORITY,
	RETIRED_OUTCOME,
} from "@crm/db/agent-tasks";

export type LeasedTask = {
	id: string;
	contactId: string | null;
	companyId: string | null;
	prospectId: string | null;
	dealId: string | null;
	emailDraftId: string | null;
	kind: string;
	reason: string;
	budget: number;
	attempts: number;
	priority: number;
	dueAt: Date;
};

export type TaskSubject = {
	id: string;
	contactId: string | null;
	companyId: string | null;
	prospectId: string | null;
	dealId: string | null;
	emailDraftId: string | null;
	kind: string;
};

const LEASE_MS = 10 * 60_000;

export { DIRECT_KINDS, MAX_ATTEMPTS } from "@crm/db/agent-tasks";

export async function researchInFlightCount(): Promise<number> {
	return db.agentTask.count({
		where: {
			finishedAt: null,
			leasedUntil: { gt: new Date() },
			kind: { notIn: [...DIRECT_TASK_KINDS] },
		},
	});
}

export async function claimDue(
	limit: number,
	kinds: { only: readonly string[] } | { except: readonly string[] },
	leaseMs = LEASE_MS,
): Promise<LeasedTask[]> {
	const now = new Date();
	const until = new Date(now.getTime() + leaseMs);

	const list = "only" in kinds ? kinds.only : kinds.except;
	if ("only" in kinds && list.length === 0) return [];

	const claimed =
		"only" in kinds
			? await db.$queryRaw<LeasedTask[]>`
				UPDATE "agentTask" AS t
				SET "leasedUntil" = ${until},
					"startedAt" = COALESCE(t."startedAt", ${now}),
					"attempts" = t."attempts" + 1,
					"state" = 'LEASED'
				FROM (
					SELECT t2.id FROM "agentTask" AS t2
					WHERE t2."finishedAt" IS NULL
						AND t2."state" IN ('QUEUED', 'LEASED')
						AND t2."dueAt" <= ${now}
						AND (t2."leasedUntil" IS NULL OR t2."leasedUntil" < ${now})
						AND t2."attempts" < ${MAX_ATTEMPTS}
						AND t2.kind IN (${Prisma.join(list)})
					ORDER BY t2."priority" DESC, t2."dueAt" ASC
					LIMIT ${limit}
					FOR UPDATE SKIP LOCKED
				) AS due
				WHERE t.id = due.id
				RETURNING t.id, t."contactId", t."companyId", t."prospectId", t."dealId", t."emailDraftId", t.kind, t.reason,
					t.budget, t.attempts, t.priority, t."dueAt";
			`
			: await db.$queryRaw<LeasedTask[]>`
				UPDATE "agentTask" AS t
				SET "leasedUntil" = ${until},
					"startedAt" = COALESCE(t."startedAt", ${now}),
					"attempts" = t."attempts" + 1,
					"state" = 'LEASED'
				FROM (
					SELECT t2.id FROM "agentTask" AS t2
					WHERE t2."finishedAt" IS NULL
						AND t2."state" IN ('QUEUED', 'LEASED')
						AND t2."dueAt" <= ${now}
						AND (t2."leasedUntil" IS NULL OR t2."leasedUntil" < ${now})
						AND t2."attempts" < ${MAX_ATTEMPTS}
						AND t2.kind NOT IN (${Prisma.join(list)})
					ORDER BY t2."priority" DESC, t2."dueAt" ASC
					LIMIT ${limit}
					FOR UPDATE SKIP LOCKED
				) AS due
				WHERE t.id = due.id
				RETURNING t.id, t."contactId", t."companyId", t."prospectId", t."dealId", t."emailDraftId", t.kind, t.reason,
					t.budget, t.attempts, t.priority, t."dueAt";
			`;

	return claimed.sort(
		(a, b) => b.priority - a.priority || a.dueAt.getTime() - b.dueAt.getTime(),
	);
}

export async function retireExhausted(
	excludedKinds: readonly string[] = [],
): Promise<TaskSubject[]> {
	const now = new Date();
	const excluded =
		excludedKinds.length > 0
			? Prisma.sql`AND t.kind NOT IN (${Prisma.join(excludedKinds)})`
			: Prisma.empty;

	return db.$queryRaw<TaskSubject[]>`
		UPDATE "agentTask" AS t
		SET "finishedAt" = ${now},
			"outcome" = ${RETIRED_OUTCOME},
			"state" = 'FAILED'
		WHERE t."finishedAt" IS NULL
			AND t."state" IN ('QUEUED', 'LEASED')
			AND t."attempts" >= ${MAX_ATTEMPTS}
			AND (t."leasedUntil" IS NULL OR t."leasedUntil" < ${now})
			${excluded}
		RETURNING t.id, t."contactId", t."companyId", t."prospectId", t."dealId", t."emailDraftId", t.kind;
	`;
}

export async function completeTask(
	taskId: string,
	expectedAttempt: number,
	outcome: string,
	sessionId?: string,
): Promise<TaskSubject | null> {
	const { count } = await db.agentTask.updateMany({
		where: {
			id: taskId,
			finishedAt: null,
			state: "LEASED",
			attempts: expectedAttempt,
		},
		data: {
			finishedAt: new Date(),
			leasedUntil: null,
			outcome: outcome.slice(0, 500),
			state: "SUCCEEDED",
			...(sessionId ? { sessionId } : {}),
		},
	});

	if (count === 0) return null;

	return db.agentTask.findUnique({
		where: { id: taskId },
		select: {
			id: true,
			contactId: true,
			companyId: true,
			prospectId: true,
			dealId: true,
			emailDraftId: true,
			kind: true,
		},
	});
}

export async function taskSubject(taskId: string): Promise<TaskSubject | null> {
	return db.agentTask.findUnique({
		where: { id: taskId },
		select: {
			id: true,
			contactId: true,
			companyId: true,
			prospectId: true,
			dealId: true,
			emailDraftId: true,
			kind: true,
		},
	});
}

export async function noteSession(
	taskId: string,
	expectedAttempt: number,
	sessionId: string,
): Promise<void> {
	await db.agentTask.updateMany({
		where: {
			id: taskId,
			finishedAt: null,
			state: "LEASED",
			attempts: expectedAttempt,
		},
		data: { sessionId },
	});
}

export async function releaseTaskForRetry(
	taskId: string,
	expectedAttempt: number,
	delayMs = 30_000,
): Promise<TaskSubject | null> {
	const { count } = await db.agentTask.updateMany({
		where: {
			id: taskId,
			finishedAt: null,
			state: "LEASED",
			attempts: expectedAttempt,
		},
		data: {
			dueAt: new Date(Date.now() + delayMs),
			leasedUntil: null,
			state: "QUEUED",
		},
	});

	if (count === 0) return null;

	return db.agentTask.findUnique({
		where: { id: taskId },
		select: {
			id: true,
			contactId: true,
			companyId: true,
			prospectId: true,
			dealId: true,
			emailDraftId: true,
			kind: true,
		},
	});
}

export async function scheduleTask(input: {
	contactId?: string | null;
	companyId?: string | null;
	prospectId?: string | null;
	dealId?: string | null;
	emailDraftId?: string | null;
	kind: string;
	reason: string;
	dueAt: Date;
	priority?: number;
	budget?: number;
}): Promise<{ id: string }> {
	const existing = await db.agentTask.findFirst({
		where: {
			kind: input.kind,
			finishedAt: null,
			contactId: input.contactId ?? undefined,
			companyId: input.companyId ?? undefined,
			prospectId: input.prospectId ?? undefined,
			dealId: input.dealId ?? undefined,
			emailDraftId: input.emailDraftId ?? undefined,
		},
		select: { id: true },
	});

	if (existing) {
		await db.agentTask.update({
			where: { id: existing.id },
			data: { dueAt: input.dueAt, reason: input.reason },
		});
		return existing;
	}

	return db.agentTask.create({
		data: {
			contactId: input.contactId ?? null,
			companyId: input.companyId ?? null,
			prospectId: input.prospectId ?? null,
			dealId: input.dealId ?? null,
			emailDraftId: input.emailDraftId ?? null,
			kind: input.kind,
			reason: input.reason,
			dueAt: input.dueAt,
			priority: input.priority ?? 0,
			budget: input.budget ?? 4,
		},
		select: { id: true },
	});
}

export async function queueDueProspectRechecks(limit = 50): Promise<number> {
	const now = new Date();
	const due = await db.prospect.findMany({
		where: {
			nextResearchAt: { lte: now },
			status: { notIn: ["PROMOTED", "DISQUALIFIED"] },
		},
		orderBy: { nextResearchAt: "asc" },
		take: limit,
		select: { id: true, companyName: true },
	});
	if (due.length === 0) return 0;

	const open = await db.agentTask.findMany({
		where: {
			kind: "prospect-research",
			finishedAt: null,
			prospectId: { in: due.map((prospect) => prospect.id) },
		},
		select: { prospectId: true },
	});
	const queued = new Set(open.map((task) => task.prospectId));
	const fresh = due.filter((prospect) => !queued.has(prospect.id));

	await Promise.all(
		fresh.map((prospect) =>
			scheduleTask({
				prospectId: prospect.id,
				kind: "prospect-research",
				reason: `Scheduled evidence and contact recheck for ${prospect.companyName}`,
				dueAt: now,
				priority: PRIORITY.prospectResearch,
				budget: 10,
			}),
		),
	);
	if (fresh.length > 0) {
		await db.prospect.updateMany({
			where: { id: { in: fresh.map((prospect) => prospect.id) } },
			data: {
				status: "RESEARCHING",
				enrichmentStatus: "PENDING",
				enrichmentError: null,
				nextResearchAt: null,
			},
		});
	}
	return fresh.length;
}

export async function lastDecision(contactId: string) {
	return db.agentTask.findFirst({
		where: { contactId },
		orderBy: { createdAt: "desc" },
		select: {
			kind: true,
			reason: true,
			dueAt: true,
			finishedAt: true,
			outcome: true,
		},
	});
}

export type { Prisma };
