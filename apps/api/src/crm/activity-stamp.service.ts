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

	async recompute(target: ActivityTarget): Promise<void> {
		if (target.companyId) {
			const { _max } = await this.db.activity.aggregate({
				where: { companyId: target.companyId },
				_max: { createdAt: true },
			});
			await this.db.company.update({
				where: { id: target.companyId },
				data: { lastActivityAt: _max.createdAt },
			});
		}

		if (target.contactId) {
			const { _max } = await this.db.activity.aggregate({
				where: { contactId: target.contactId },
				_max: { createdAt: true },
			});
			await this.db.contact.update({
				where: { id: target.contactId },
				data: { lastActivityAt: _max.createdAt },
			});
		}

		if (target.dealId) {
			const { _max } = await this.db.activity.aggregate({
				where: { dealId: target.dealId },
				_max: { createdAt: true },
			});
			await this.db.deal.update({
				where: { id: target.dealId },
				data: { lastActivityAt: _max.createdAt },
			});
		}
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
				SELECT MAX(a."createdAt") FROM "activity" a WHERE a.${key} = r.id
			)
			WHERE r.id IN (${PrismaNamespace.join(ids)})`;
	}

	async recomputeAll(): Promise<void> {
		await this.db.$transaction([
			this.db.$executeRaw`
				UPDATE "company" c
				SET "lastActivityAt" = a.max
				FROM (
					SELECT "companyId" AS id, MAX("createdAt") AS max
					FROM "activity" WHERE "companyId" IS NOT NULL GROUP BY "companyId"
				) a
				WHERE c.id = a.id AND c."lastActivityAt" IS DISTINCT FROM a.max`,
			this.db.$executeRaw`
				UPDATE "company" SET "lastActivityAt" = NULL
				WHERE "lastActivityAt" IS NOT NULL
				AND id NOT IN (SELECT "companyId" FROM "activity" WHERE "companyId" IS NOT NULL)`,
			this.db.$executeRaw`
				UPDATE "contact" c
				SET "lastActivityAt" = a.max
				FROM (
					SELECT "contactId" AS id, MAX("createdAt") AS max
					FROM "activity" WHERE "contactId" IS NOT NULL GROUP BY "contactId"
				) a
				WHERE c.id = a.id AND c."lastActivityAt" IS DISTINCT FROM a.max`,
			this.db.$executeRaw`
				UPDATE "contact" SET "lastActivityAt" = NULL
				WHERE "lastActivityAt" IS NOT NULL
				AND id NOT IN (SELECT "contactId" FROM "activity" WHERE "contactId" IS NOT NULL)`,
			this.db.$executeRaw`
				UPDATE "deal" d
				SET "lastActivityAt" = a.max
				FROM (
					SELECT "dealId" AS id, MAX("createdAt") AS max
					FROM "activity" WHERE "dealId" IS NOT NULL GROUP BY "dealId"
				) a
				WHERE d.id = a.id AND d."lastActivityAt" IS DISTINCT FROM a.max`,
			this.db.$executeRaw`
				UPDATE "deal" SET "lastActivityAt" = NULL
				WHERE "lastActivityAt" IS NOT NULL
				AND id NOT IN (SELECT "dealId" FROM "activity" WHERE "dealId" IS NOT NULL)`,
		]);
	}
}
