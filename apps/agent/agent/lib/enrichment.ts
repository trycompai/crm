import { db, EnrichmentStatus, type Prisma } from "@crm/db";
import { ownsCompanyStatus, ownsContactStatus } from "@crm/db/agent-tasks";
import type { TaskSubject } from "./tasks";

type StatusGuard =
	| EnrichmentStatus
	| { not: EnrichmentStatus }
	| { in: EnrichmentStatus[] };

type SettleGuard = {
	enrichmentStatus?: StatusGuard;
	OR?: Array<{
		enrichmentStatus: EnrichmentStatus;
		updatedAt?: { lt: Date };
	}>;
};

type OwnedColumns = {
	contactId: string | null;
	companyId: string | null;
};

export const UNLESS_COMPLETE = {
	enrichmentStatus: { not: EnrichmentStatus.COMPLETE },
} as const;

function ownedColumns(subject: TaskSubject): OwnedColumns {
	return {
		contactId:
			subject.contactId && ownsContactStatus(subject.kind)
				? subject.contactId
				: null,
		companyId:
			subject.companyId && ownsCompanyStatus(subject.kind)
				? subject.companyId
				: null,
	};
}

export async function markRunning(subject: TaskSubject): Promise<void> {
	await write(ownedColumns(subject), EnrichmentStatus.RUNNING, null, {
		...UNLESS_COMPLETE,
	});
}

export async function settle(
	subject: TaskSubject,
	status: EnrichmentStatus,
	error?: string,
): Promise<void> {
	const owned = ownedColumns(subject);
	if (!owned.contactId && !owned.companyId) return;

	await write(owned, status, error ?? null, await settleable(subject, status));
}

async function write(
	owned: OwnedColumns,
	status: EnrichmentStatus,
	error: string | null,
	guard: SettleGuard,
): Promise<void> {
	if (!owned.contactId && !owned.companyId) return;

	const data = {
		enrichmentStatus: status,
		enrichmentError: error,
		enrichedAt: status === EnrichmentStatus.COMPLETE ? new Date() : undefined,
	};

	if (owned.contactId) {
		await db.contact.updateMany({
			where: { id: owned.contactId, ...guard },
			data,
		});
	}

	if (owned.companyId) {
		await db.company.updateMany({
			where: { id: owned.companyId, ...guard },
			data,
		});
	}
}

async function settleable(
	subject: TaskSubject,
	status: EnrichmentStatus,
): Promise<SettleGuard> {
	const running = { enrichmentStatus: EnrichmentStatus.RUNNING };

	if (status === EnrichmentStatus.COMPLETE) {
		const done = {
			enrichmentStatus: {
				in: [EnrichmentStatus.RUNNING, EnrichmentStatus.COMPLETE],
			},
		};

		const endedAt = await taskEndedAt(subject.id);
		if (!endedAt) return done;
		if (await hasOpenRequest(subject)) return done;

		return {
			OR: [
				running,
				{ enrichmentStatus: EnrichmentStatus.COMPLETE },
				{
					enrichmentStatus: EnrichmentStatus.PENDING,
					updatedAt: { lt: endedAt },
				},
			],
		};
	}

	if (status !== EnrichmentStatus.FAILED) return running;

	const endedAt = await taskEndedAt(subject.id);
	if (!endedAt) return running;
	if (await hasOpenRequest(subject)) return running;

	return {
		OR: [
			running,
			{
				enrichmentStatus: EnrichmentStatus.PENDING,
				updatedAt: { lt: endedAt },
			},
		],
	};
}

async function taskEndedAt(taskId: string): Promise<Date | null> {
	const task = await db.agentTask.findUnique({
		where: { id: taskId },
		select: { finishedAt: true },
	});

	return task?.finishedAt ?? null;
}

async function hasOpenRequest(subject: TaskSubject): Promise<boolean> {
	const owners: Prisma.AgentTaskWhereInput[] = [];
	if (subject.contactId) owners.push({ contactId: subject.contactId });
	if (subject.companyId) owners.push({ companyId: subject.companyId });
	if (owners.length === 0) return false;

	const open = await db.agentTask.findFirst({
		where: { id: { not: subject.id }, finishedAt: null, OR: owners },
		select: { id: true },
	});

	return open !== null;
}
