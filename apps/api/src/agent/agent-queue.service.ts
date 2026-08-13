import type { Db, Prisma } from "@crm/db";
import { Injectable } from "@nestjs/common";
import { InjectDatabase } from "../database/database.constants";

@Injectable()
export class AgentQueueService {
	constructor(@InjectDatabase() private readonly db: Db) {}

	async queuedCompanies(ids: readonly string[]): Promise<Set<string>> {
		return this.queued("companyId", ids);
	}

	async queuedContacts(ids: readonly string[]): Promise<Set<string>> {
		return this.queued("contactId", ids);
	}

	async isQueued(subject: {
		companyId?: string;
		contactId?: string;
	}): Promise<boolean> {
		const where: Prisma.AgentTaskWhereInput = { finishedAt: null };
		if (subject.companyId) where.companyId = subject.companyId;
		if (subject.contactId) where.contactId = subject.contactId;

		const row = await this.db.agentTask.findFirst({
			where,
			select: { id: true },
		});

		return row !== null;
	}

	private async queued(
		column: "companyId" | "contactId",
		ids: readonly string[],
	): Promise<Set<string>> {
		if (ids.length === 0) return new Set();

		const rows = await this.db.agentTask.findMany({
			where: { finishedAt: null, [column]: { in: [...ids] } },
			select: { [column]: true },
			distinct: [column],
		});

		return new Set(
			rows
				.map((row) => (row as Record<string, string | null>)[column])
				.filter((id): id is string => id !== null),
		);
	}
}
