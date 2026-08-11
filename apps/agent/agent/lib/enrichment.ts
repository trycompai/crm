import { db, EnrichmentStatus } from "@crm/db";
import type { TaskSubject } from "./tasks";

type SettleGuard = {
	enrichmentStatus?: EnrichmentStatus;
	OR?: Array<{
		enrichmentStatus: EnrichmentStatus;
		updatedAt?: { lt: Date };
	}>;
};

export async function markRunning(subject: TaskSubject): Promise<void> {
	await write(subject, EnrichmentStatus.RUNNING, null, false);
}

export async function settle(
	subject: TaskSubject,
	status: EnrichmentStatus,
	error?: string,
): Promise<void> {
	await write(subject, status, error ?? null, true);
}

async function write(
	subject: TaskSubject,
	status: EnrichmentStatus,
	error: string | null,
	onlyIfRunning: boolean,
): Promise<void> {
	if (!subject.contactId && !subject.companyId) return;

	const data = {
		enrichmentStatus: status,
		enrichmentError: error,
		...(status === EnrichmentStatus.COMPLETE ? { enrichedAt: new Date() } : {}),
	};

	const guard: SettleGuard = onlyIfRunning
		? await settleable(subject, status)
		: {};

	if (subject.contactId) {
		await db.contact.updateMany({
			where: { id: subject.contactId, ...guard },
			data,
		});
	}

	if (subject.companyId) {
		await db.company.updateMany({
			where: { id: subject.companyId, ...guard },
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

async function taskEndedAt(taskId: string): Promise<Date> {
	const task = await db.agentTask.findUnique({
		where: { id: taskId },
		select: { finishedAt: true },
	});

	return task?.finishedAt ?? new Date();
}
