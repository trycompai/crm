import { db, EnrichmentStatus, type Prisma } from "@crm/db";
import { type TaskLeaseScope, type TaskSubject, withTaskLease } from "./tasks";

type SettleGuard = {
	enrichmentStatus?: EnrichmentStatus;
	OR?: Array<{
		enrichmentStatus: EnrichmentStatus;
		updatedAt?: { lt: Date };
	}>;
};

export async function markRunning(
	subject: TaskSubject,
	lease?: TaskLeaseScope,
): Promise<boolean> {
	if (lease) {
		const result = await withTaskLease(lease, async (tx) => {
			await write(tx, subject, EnrichmentStatus.RUNNING, null, false);
		});
		return result.owned;
	}

	await write(db, subject, EnrichmentStatus.RUNNING, null, false);
	return true;
}

export async function settle(
	subject: TaskSubject,
	status: EnrichmentStatus,
	error?: string,
): Promise<void> {
	await write(db, subject, status, error ?? null, true);
}

async function write(
	client: Pick<Prisma.TransactionClient, "contact" | "company" | "prospect">,
	subject: TaskSubject,
	status: EnrichmentStatus,
	error: string | null,
	onlyIfRunning: boolean,
): Promise<void> {
	if (!subject.contactId && !subject.companyId && !subject.prospectId) return;

	const data = {
		enrichmentStatus: status,
		enrichmentError: error,
		...(status === EnrichmentStatus.COMPLETE ? { enrichedAt: new Date() } : {}),
	};

	const guard: SettleGuard = onlyIfRunning
		? await settleable(subject, status)
		: {};

	if (subject.contactId) {
		await client.contact.updateMany({
			where: { id: subject.contactId, ...guard },
			data,
		});
	}

	if (subject.companyId) {
		await client.company.updateMany({
			where: { id: subject.companyId, ...guard },
			data,
		});
	}

	if (subject.prospectId) {
		await client.prospect.updateMany({
			where: { id: subject.prospectId, ...guard },
			data,
		});
	}
}

async function settleable(
	subject: TaskSubject,
	status: EnrichmentStatus,
): Promise<SettleGuard> {
	const running = { enrichmentStatus: EnrichmentStatus.RUNNING };
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
	if (subject.prospectId) owners.push({ prospectId: subject.prospectId });
	if (owners.length === 0) return false;

	const open = await db.agentTask.findFirst({
		where: { id: { not: subject.id }, finishedAt: null, OR: owners },
		select: { id: true },
	});

	return open !== null;
}
