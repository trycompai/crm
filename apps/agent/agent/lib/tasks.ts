import { db, type Prisma } from "@crm/db";
import { MAX_ATTEMPTS, RETIRED_OUTCOME } from "@crm/db/agent-tasks";
import { DISPATCH } from "./dispatch-config";

export type LeasedTask = {
	id: string;
	contactId: string | null;
	companyId: string | null;
	dealId: string | null;
	kind: string;
	reason: string;
	payload: Prisma.JsonValue | null;
	budget: number;
	attempts: number;
	priority: number;
	dueAt: Date;
};

export type TaskSubject = {
	id: string;
	contactId: string | null;
	companyId: string | null;
	dealId: string | null;
	kind: string;
};

const LEASE_MS = DISPATCH.task.leaseMs;

export { DIRECT_KINDS, MAX_ATTEMPTS } from "@crm/db/agent-tasks";

export async function claimDue(
	limit: number,
	kinds: { only: readonly string[] } | { except: readonly string[] },
	leaseMs = LEASE_MS,
): Promise<LeasedTask[]> {
	const now = new Date();
	const until = new Date(now.getTime() + leaseMs);

	const list = "only" in kinds ? [...kinds.only] : [...kinds.except];
	if ("only" in kinds && list.length === 0) return [];

	const onlyMode = "only" in kinds;

	const claimed = await db.$queryRaw<LeasedTask[]>`
		UPDATE "agentTask" AS t
		SET "leasedUntil" = ${until},
			"startedAt" = COALESCE(t."startedAt", ${now}),
			"attempts" = t."attempts" + 1
		FROM (
			SELECT t2.id FROM "agentTask" AS t2
			WHERE t2."finishedAt" IS NULL
				AND t2."dueAt" <= ${now}
				AND (t2."leasedUntil" IS NULL OR t2."leasedUntil" < ${now})
				AND t2."attempts" < ${MAX_ATTEMPTS}
				AND CASE
					WHEN ${onlyMode}::boolean THEN t2.kind = ANY(${list}::text[])
					ELSE t2.kind <> ALL(${list}::text[])
				END
			ORDER BY t2."priority" DESC, t2."dueAt" ASC
			LIMIT ${limit}
			FOR UPDATE SKIP LOCKED
		) AS due
		WHERE t.id = due.id
		RETURNING t.id, t."contactId", t."companyId", t."dealId", t.kind, t.reason, t.payload,
			t.budget, t.attempts, t.priority, t."dueAt";
	`;

	return claimed.sort(
		(a, b) => b.priority - a.priority || a.dueAt.getTime() - b.dueAt.getTime(),
	);
}

export async function retireExhausted(
	limit: number = DISPATCH.reconcile.retire,
): Promise<TaskSubject[]> {
	const now = new Date();

	return db.$queryRaw<TaskSubject[]>`
		UPDATE "agentTask" AS t
		SET "finishedAt" = ${now},
			"outcome" = ${RETIRED_OUTCOME}
		FROM (
			SELECT c.id
			FROM "agentTask" AS c
			WHERE c."finishedAt" IS NULL
				AND c."attempts" >= ${MAX_ATTEMPTS}
				AND (c."leasedUntil" IS NULL OR c."leasedUntil" < ${now})
			ORDER BY c."dueAt" ASC
			LIMIT ${limit}
			FOR UPDATE SKIP LOCKED
		) AS exhausted
		WHERE t.id = exhausted.id
		RETURNING t.id, t."contactId", t."companyId", t."dealId", t.kind;
	`;
}

export async function completeTask(
	taskId: string,
	outcome: string,
	sessionId?: string,
): Promise<TaskSubject | null> {
	const { count } = await db.agentTask.updateMany({
		where: { id: taskId, finishedAt: null },
		data: {
			finishedAt: new Date(),
			outcome: outcome.slice(0, 500),
			sessionId: sessionId || undefined,
		},
	});

	if (count === 0) return null;

	return db.agentTask.findUnique({
		where: { id: taskId },
		select: {
			id: true,
			contactId: true,
			companyId: true,
			dealId: true,
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
			dealId: true,
			kind: true,
		},
	});
}

export async function noteSession(
	taskId: string,
	sessionId: string,
): Promise<void> {
	await db.agentTask.updateMany({
		where: { id: taskId, finishedAt: null },
		data: { sessionId },
	});
}

export async function scheduleTask(input: {
	contactId?: string | null;
	companyId?: string | null;
	dealId?: string | null;
	kind: string;
	reason: string;
	payload?: Prisma.InputJsonValue | null;
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
			dealId: input.dealId ?? undefined,
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
			dealId: input.dealId ?? null,
			kind: input.kind,
			reason: input.reason,
			payload: input.payload ?? undefined,
			dueAt: input.dueAt,
			priority: input.priority ?? 0,
			budget: input.budget ?? 4,
		},
		select: { id: true },
	});
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
