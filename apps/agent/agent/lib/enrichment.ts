import { db, EnrichmentStatus, type Prisma } from "@crm/db";
import { type TaskLeaseScope, type TaskSubject, withTaskLease } from "./tasks";

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
	const data = {
		enrichmentStatus: status,
		enrichmentError: error,
		...(status === EnrichmentStatus.COMPLETE ? { enrichedAt: new Date() } : {}),
	};

	const guard = onlyIfRunning
		? { enrichmentStatus: EnrichmentStatus.RUNNING }
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
