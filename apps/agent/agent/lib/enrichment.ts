import { db, EnrichmentStatus } from "@crm/db";
import type { TaskSubject } from "./tasks";

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
	const data = {
		enrichmentStatus: status,
		enrichmentError: error,
		...(status === EnrichmentStatus.COMPLETE ? { enrichedAt: new Date() } : {}),
	};

	const settleable =
		status === EnrichmentStatus.FAILED
			? [EnrichmentStatus.RUNNING, EnrichmentStatus.PENDING]
			: [EnrichmentStatus.RUNNING];

	const guard = onlyIfRunning ? { enrichmentStatus: { in: settleable } } : {};

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
