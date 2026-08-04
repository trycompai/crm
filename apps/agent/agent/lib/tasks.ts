import { db, Prisma, type ProductKey } from "@crm/db";

export type LeasedTask = {
	id: string;
	contactId: string | null;
	companyId: string | null;
	productId: ProductKey | null;
	candidateId: string | null;
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
	kind: string;
};

const LEASE_MS = 10 * 60_000;

export const MAX_ATTEMPTS = 3;

export { DIRECT_KINDS } from "@crm/db/agent-tasks";

export async function claimDue(
	limit: number,
	kinds: { only: readonly string[] } | { except: readonly string[] },
	leaseMs = LEASE_MS,
): Promise<LeasedTask[]> {
	const now = new Date();
	const until = new Date(now.getTime() + leaseMs);

	const list = "only" in kinds ? kinds.only : kinds.except;
	if ("only" in kinds && list.length === 0) return [];

	const match = Prisma.sql`t2.kind ${"only" in kinds ? Prisma.sql`IN` : Prisma.sql`NOT IN`} (${Prisma.join(list)})`;

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
				AND ${match}
			ORDER BY t2."priority" DESC, t2."dueAt" ASC
			LIMIT ${limit}
			FOR UPDATE SKIP LOCKED
		) AS due
		WHERE t.id = due.id
		RETURNING t.id, t."contactId", t."companyId", t.kind, t.reason,
			t."productId", t."candidateId", t.budget, t.attempts,
			t.priority, t."dueAt";
	`;

	return claimed.sort(
		(a, b) => b.priority - a.priority || a.dueAt.getTime() - b.dueAt.getTime(),
	);
}

export async function retireExhausted(): Promise<TaskSubject[]> {
	const now = new Date();

	return db.$queryRaw<TaskSubject[]>`
		UPDATE "agentTask" AS t
		SET "finishedAt" = ${now},
			"outcome" = ${`Gave up after ${MAX_ATTEMPTS} attempts: the session never reported back.`}
		WHERE t."finishedAt" IS NULL
			AND t."attempts" >= ${MAX_ATTEMPTS}
			AND (t."leasedUntil" IS NULL OR t."leasedUntil" < ${now})
		RETURNING t.id, t."contactId", t."companyId", t.kind;
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
			...(sessionId ? { sessionId } : {}),
		},
	});

	if (count === 0) return null;

	return db.agentTask.findUnique({
		where: { id: taskId },
		select: { id: true, contactId: true, companyId: true, kind: true },
	});
}

export async function taskSubject(taskId: string): Promise<TaskSubject | null> {
	return db.agentTask.findUnique({
		where: { id: taskId },
		select: { id: true, contactId: true, companyId: true, kind: true },
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
	productId?: ProductKey | null;
	candidateId?: string | null;
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
			productId: input.productId ?? undefined,
			candidateId: input.candidateId ?? undefined,
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
			productId: input.productId ?? null,
			candidateId: input.candidateId ?? null,
			kind: input.kind,
			reason: input.reason,
			dueAt: input.dueAt,
			priority: input.priority ?? 0,
			budget: input.budget ?? 4,
		},
		select: { id: true },
	});
}

export async function enqueueDueProspecting(): Promise<number> {
	const now = new Date();
	const products = await db.product.findMany({
		where: { active: true, nextDiscoveryAt: { lte: now } },
		select: {
			id: true,
			name: true,
			discoveryDailyCap: true,
			nextDiscoveryAt: true,
		},
	});

	let queued = 0;
	for (const product of products) {
		const scheduledFor = product.nextDiscoveryAt ?? now;
		await db.$transaction(async (tx) => {
			const run = await tx.prospectingRun.upsert({
				where: {
					productId_source_scheduledFor: {
						productId: product.id,
						source: "hybrid",
						scheduledFor,
					},
				},
				create: {
					productId: product.id,
					source: "hybrid",
					targetCount: product.discoveryDailyCap,
					scheduledFor,
				},
				update: {},
				select: { id: true },
			});

			const open = await tx.agentTask.findFirst({
				where: {
					kind: "prospect-discovery",
					productId: product.id,
					finishedAt: null,
				},
				select: { id: true },
			});
			if (!open) {
				await tx.agentTask.create({
					data: {
						kind: "prospect-discovery",
						productId: product.id,
						reason: `Discover candidates for ${product.name}; pending run ${run.id}.`,
						dueAt: now,
						priority: 5,
						budget: 12,
					},
				});
				queued += 1;
			}

			await tx.product.update({
				where: { id: product.id },
				data: { nextDiscoveryAt: nextLisbonBusinessMorning(now) },
			});
		});
	}
	return queued;
}

export function nextLisbonBusinessMorning(after: Date): Date {
	const local = localDateParts(after);
	for (let add = 0; add < 8; add += 1) {
		const calendar = new Date(
			Date.UTC(local.year, local.month - 1, local.day + add),
		);
		const year = calendar.getUTCFullYear();
		const month = calendar.getUTCMonth() + 1;
		const day = calendar.getUTCDate();
		const candidate = zonedDate(year, month, day, 8, "Europe/Lisbon");
		const weekday = calendar.getUTCDay();
		if (weekday !== 0 && weekday !== 6 && candidate > after) return candidate;
	}
	throw new Error("Could not calculate the next Lisbon business morning.");
}

function localDateParts(date: Date) {
	const parts = new Intl.DateTimeFormat("en-CA", {
		timeZone: "Europe/Lisbon",
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
	}).formatToParts(date);
	const value = (type: Intl.DateTimeFormatPartTypes) =>
		Number(parts.find((part) => part.type === type)?.value);
	return { year: value("year"), month: value("month"), day: value("day") };
}

function zonedDate(
	year: number,
	month: number,
	day: number,
	hour: number,
	timeZone: string,
) {
	const guess = new Date(Date.UTC(year, month - 1, day, hour));
	const name =
		new Intl.DateTimeFormat("en-US", {
			timeZone,
			timeZoneName: "longOffset",
		})
			.formatToParts(guess)
			.find((part) => part.type === "timeZoneName")?.value ?? "GMT+00:00";
	const match = name.match(/GMT([+-])(\d{2}):(\d{2})/);
	const offset = match
		? (match[1] === "+" ? 1 : -1) * (Number(match[2]) * 60 + Number(match[3]))
		: 0;
	return new Date(guess.getTime() - offset * 60_000);
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
