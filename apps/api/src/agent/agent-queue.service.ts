import type { Db, Prisma } from "@crm/db";
import { Injectable } from "@nestjs/common";
import { InjectDatabase } from "../database/database.constants";

@Injectable()
export class AgentQueueService {
	constructor(@InjectDatabase() private readonly db: Db) {}

	async queuedCompanies(ids: readonly string[]): Promise<Set<string>> {
		if (ids.length === 0) return new Set();

		const rows = await this.db.agentTask.findMany({
			where: this.due({ companyId: { in: [...ids] } }),
			select: { companyId: true },
			distinct: ["companyId"],
		});

		return this.identifiers(rows.map((row) => row.companyId));
	}

	async queuedContacts(ids: readonly string[]): Promise<Set<string>> {
		if (ids.length === 0) return new Set();

		const rows = await this.db.agentTask.findMany({
			where: this.due({ contactId: { in: [...ids] } }),
			select: { contactId: true },
			distinct: ["contactId"],
		});

		return this.identifiers(rows.map((row) => row.contactId));
	}

	async isQueued(subject: {
		companyId?: string;
		contactId?: string;
	}): Promise<boolean> {
		const row = await this.db.agentTask.findFirst({
			where: this.due({
				companyId: subject.companyId,
				contactId: subject.contactId,
			}),
			select: { id: true },
		});

		return row !== null;
	}

	private due(subject: Prisma.AgentTaskWhereInput): Prisma.AgentTaskWhereInput {
		return { ...subject, finishedAt: null, dueAt: { lte: new Date() } };
	}

	private identifiers(values: (string | null)[]): Set<string> {
		return new Set(values.filter((value): value is string => value !== null));
	}
}
