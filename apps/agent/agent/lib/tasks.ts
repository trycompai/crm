import { db, Prisma } from "@crm/db";
import {
	DIRECT_KINDS as DIRECT_TASK_KINDS,
	MAX_ATTEMPTS,
	PRIORITY,
	RETIRED_OUTCOME,
} from "@crm/db/agent-tasks";
import { DISPATCH } from "./dispatch-config";

export type LeasedTask = {
	id: string;
	contactId: string | null;
	companyId: string | null;
	prospectId: string | null;
	dealId: string | null;
	emailDraftId: string | null;
	kind: string;
	reason: string;
	payload: Prisma.JsonValue | null;
	budget: number;
	attempts: number;
	priority: number;
	dueAt: Date;
	scopes?: unknown | null;
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

export type TaskLeaseScope = {
	taskId: string;
	expectedAttempt: number;
	minRemainingMs?: number;
	contactId?: string | null;
	companyId?: string | null;
	prospectId?: string | null;
	dealId?: string | null;
	emailDraftId?: string | null;
};

const LEASE_MS = DISPATCH.task.leaseMs;

export { DIRECT_KINDS, MAX_ATTEMPTS } from "@crm/db/agent-tasks";

export async function withTaskLease<T>(
	scope: TaskLeaseScope,
	work: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<{ owned: true; value: T } | { owned: false }> {
	return db.$transaction(async (tx) => {
		const activeAfter = new Date(Date.now() + (scope.minRemainingMs ?? 0));
		const { count } = await tx.agentTask.updateMany({
			where: {
				id: scope.taskId,
				finishedAt: null,
				state: "LEASED",
				attempts: scope.expectedAttempt,
				leasedUntil: { gt: activeAfter },
				...(scope.contactId ? { contactId: scope.contactId } : {}),
				...(scope.companyId ? { companyId: scope.companyId } : {}),
				...(scope.prospectId ? { prospectId: scope.prospectId } : {}),
				...(scope.dealId ? { dealId: scope.dealId } : {}),
				...(scope.emailDraftId ? { emailDraftId: scope.emailDraftId } : {}),
			},
			data: { state: "LEASED" },
		});

		if (count !== 1) return { owned: false };

		return { owned: true, value: await work(tx) };
	});
}

export async function researchInFlightCount(
	directKinds: readonly string[] = DIRECT_TASK_KINDS,
): Promise<number> {
	return db.agentTask.count({
		where: {
			finishedAt: null,
			leasedUntil: { gt: new Date() },
			kind: { notIn: [...directKinds] },
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

	const list = "only" in kinds ? [...kinds.only] : [...kinds.except];
	if ("only" in kinds && list.length === 0) return [];
	const onlyMode = "only" in kinds;

	const claimed = await db.$queryRaw<LeasedTask[]>`
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
				AND CASE
					WHEN ${onlyMode}::boolean THEN t2.kind = ANY(${list}::text[])
					ELSE t2.kind <> ALL(${list}::text[])
				END
			ORDER BY t2."priority" DESC, t2."dueAt" ASC
			LIMIT ${limit}
			FOR UPDATE SKIP LOCKED
	) AS due
	WHERE t.id = due.id
	RETURNING t.id, t."contactId", t."companyId", t."prospectId", t."dealId", t."emailDraftId", t.kind, t.reason, t.payload,
		t.budget, t.attempts, t.priority, t."dueAt", t.scopes;
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
	scopes?: Prisma.InputJsonValue | null,
): Promise<TaskSubject | null> {
	const { count } = await db.agentTask.updateMany({
		where: {
			id: taskId,
			finishedAt: null,
			state: "LEASED",
			attempts: expectedAttempt,
			leasedUntil: { gt: new Date() },
		},
		data: {
			finishedAt: new Date(),
			leasedUntil: null,
			outcome: outcome.slice(0, 500),
			state: "SUCCEEDED",
			...(sessionId ? { sessionId } : {}),
			...(scopes !== undefined
				? { scopes: scopes === null ? Prisma.DbNull : scopes }
				: {}),
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
): Promise<boolean> {
	const { count } = await db.agentTask.updateMany({
		where: {
			id: taskId,
			finishedAt: null,
			state: "LEASED",
			attempts: expectedAttempt,
			leasedUntil: { gt: new Date() },
		},
		data: { sessionId },
	});

	return count === 1;
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
			leasedUntil: { gt: new Date() },
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
	payload?: Prisma.InputJsonValue | null;
	dueAt: Date;
	priority?: number;
	budget?: number;
	idempotencyKey?: string;
	scopes?: Prisma.InputJsonValue | null;
}): Promise<{ id: string }> {
	const existing = input.idempotencyKey
		? await db.agentTask.findUnique({
				where: { idempotencyKey: input.idempotencyKey },
				select: { id: true, finishedAt: true },
			})
		: await db.agentTask.findFirst({
				where: {
					kind: input.kind,
					finishedAt: null,
					contactId: input.contactId ?? undefined,
					companyId: input.companyId ?? undefined,
					prospectId: input.prospectId ?? undefined,
					dealId: input.dealId ?? undefined,
					emailDraftId: input.emailDraftId ?? undefined,
				},
				select: { id: true, finishedAt: true },
			});

	if (existing) {
		if (!input.idempotencyKey || existing.finishedAt === null) {
			await db.agentTask.update({
				where: { id: existing.id },
				data: {
					dueAt: input.dueAt,
					reason: input.reason,
					...(input.payload !== undefined
						? { payload: input.payload ?? Prisma.DbNull }
						: {}),
					...(input.scopes !== undefined
						? { scopes: input.scopes ?? Prisma.DbNull }
						: {}),
				},
			});
		}
		return existing;
	}
	try {
		return await db.agentTask.create({
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
				idempotencyKey: input.idempotencyKey ?? null,
				...(input.payload !== undefined
					? { payload: input.payload ?? Prisma.DbNull }
					: {}),
				...(input.scopes !== undefined
					? {
							scopes: input.scopes === null ? Prisma.DbNull : input.scopes,
						}
					: {}),
			},
			select: { id: true },
		});
	} catch (error) {
		if (
			!(error instanceof Prisma.PrismaClientKnownRequestError) ||
			error.code !== "P2002" ||
			!input.idempotencyKey
		) {
			throw error;
		}
		const raced = await db.agentTask.findUnique({
			where: { idempotencyKey: input.idempotencyKey },
			select: { id: true },
		});
		if (!raced) throw error;
		return raced;
	}
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
