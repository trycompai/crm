import { type Db, type Prisma, Prisma as PrismaNamespace } from "@crm/db";
import { Injectable, Logger } from "@nestjs/common";
import { InjectDatabase } from "../database/database.constants";

export type ActivityTarget = {
	companyId?: string | null;
	contactId?: string | null;
	dealId?: string | null;
};

export type StampTargets = {
	companyIds: string[];
	contactIds: string[];
	dealIds: string[];
};

function present(ids: (string | null)[]): string[] {
	return ids.filter((id): id is string => id !== null);
}

const NOT_MARKETING = PrismaNamespace.sql`a."meta"->>'source' IS DISTINCT FROM 'marketing'`;

@Injectable()
export class ActivityStampService {
	private readonly logger = new Logger(ActivityStampService.name);

	constructor(@InjectDatabase() private readonly db: Db) {}

	async touch(target: ActivityTarget, at: Date): Promise<void> {
		const stale = {
			OR: [{ lastActivityAt: null }, { lastActivityAt: { lt: at } }],
		};

		await Promise.all([
			target.companyId
				? this.db.company.updateMany({
						where: { id: target.companyId, ...stale },
						data: { lastActivityAt: at },
					})
				: null,
			target.contactId
				? this.db.contact.updateMany({
						where: { id: target.contactId, ...stale },
						data: { lastActivityAt: at },
					})
				: null,
			target.dealId
				? this.db.deal.updateMany({
						where: { id: target.dealId, ...stale },
						data: { lastActivityAt: at },
					})
				: null,
		]);
	}

	async targetsOf(
		where: Prisma.ActivityWhereInput,
		client: Prisma.TransactionClient = this.db,
	): Promise<StampTargets> {
		const [companies, contacts, deals] = await Promise.all([
			client.activity.groupBy({ by: ["companyId"], where }),
			client.activity.groupBy({ by: ["contactId"], where }),
			client.activity.groupBy({ by: ["dealId"], where }),
		]);

		return {
			companyIds: present(companies.map((row) => row.companyId)),
			contactIds: present(contacts.map((row) => row.contactId)),
			dealIds: present(deals.map((row) => row.dealId)),
		};
	}

	async recomputeMany(targets: StampTargets): Promise<void> {
		const statements = [
			this.restamp("company", "companyId", targets.companyIds),
			this.restamp("contact", "contactId", targets.contactIds),
			this.restamp("deal", "dealId", targets.dealIds),
		].filter((statement) => statement !== null);

		if (statements.length === 0) return;

		await this.db.$transaction(statements);
	}

	async recomputeAfterDelete(
		targets: StampTargets,
		deleted: ActivityTarget,
	): Promise<void> {
		try {
			await this.recomputeMany(targets);
		} catch (error) {
			this.logger.error(
				{
					message:
						"A record was deleted but its activity stamps were not recomputed",
					...deleted,
				},
				error instanceof Error ? error.stack : String(error),
			);
		}
	}

	private restamp(table: string, column: string, ids: string[]) {
		if (ids.length === 0) return null;

		const record = PrismaNamespace.raw(`"${table}"`);
		const key = PrismaNamespace.raw(`"${column}"`);

		return this.db.$executeRaw`
			UPDATE ${record} r
			SET "lastActivityAt" = (
				SELECT MAX(a."createdAt") FROM "activity" a
				WHERE a.${key} = r.id AND ${NOT_MARKETING}
			)
			WHERE r.id IN (${PrismaNamespace.join(ids)})`;
	}

	private rebuild(table: string, column: string) {
		const record = PrismaNamespace.raw(`"${table}"`);
		const key = PrismaNamespace.raw(`"${column}"`);

		return [
			this.db.$executeRaw`
				UPDATE ${record} r
				SET "lastActivityAt" = m.max
				FROM (
					SELECT a.${key} AS id, MAX(a."createdAt") AS max
					FROM "activity" a
					WHERE a.${key} IS NOT NULL AND ${NOT_MARKETING}
					GROUP BY a.${key}
				) m
				WHERE r.id = m.id AND r."lastActivityAt" IS DISTINCT FROM m.max`,
			this.db.$executeRaw`
				UPDATE ${record} SET "lastActivityAt" = NULL
				WHERE "lastActivityAt" IS NOT NULL
				AND id NOT IN (
					SELECT a.${key} FROM "activity" a
					WHERE a.${key} IS NOT NULL AND ${NOT_MARKETING}
				)`,
		];
	}

	async recomputeAll(): Promise<void> {
		await this.db.$transaction([
			...this.rebuild("company", "companyId"),
			...this.rebuild("contact", "contactId"),
			...this.rebuild("deal", "dealId"),
		]);
	}
}
