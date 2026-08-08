import {
	ClientAccountStatus,
	type Db,
	type Prisma,
	Prisma as PrismaNamespace,
} from "@crm/db";
import {
	BadRequestException,
	Injectable,
	Logger,
	NotFoundException,
} from "@nestjs/common";
import { blankToNull } from "../crm/values";
import { InjectDatabase } from "../database/database.constants";
import {
	FACET_ALL,
	type ListResult,
	paginate,
	resolveOrderBy,
} from "../trpc/list-input";
import type {
	ClientAccountCreateInput,
	ClientAccountListInput,
} from "./client-accounts.contracts";

function optional(value: string | null | undefined): string | null {
	if (value === null || value === undefined) return null;
	return blankToNull(value);
}

export type ClientAccountRow = {
	id: string;
	name: string;
	slug: string;
	status: ClientAccountStatus;
	logoUrl: string | null;
	brandColor: string | null;
	website: string | null;
	industry: string | null;
	monthlyRetainerCents: string | null;
	currency: string;
	tags: string[];
	companyCount: number;
	contactCount: number;
	openDealCount: number;
	createdAt: string;
	updatedAt: string;
};

const SORTABLE: Record<
	string,
	(dir: Prisma.SortOrder) => Prisma.ClientAccountOrderByWithRelationInput[]
> = {
	name: (dir) => [{ name: dir }],
	status: (dir) => [{ status: dir }, { name: "asc" }],
	createdAt: (dir) => [{ createdAt: dir }],
	updatedAt: (dir) => [{ updatedAt: dir }],
};

const SLUG_RESERVED = new Set([
	"api",
	"app",
	"admin",
	"settings",
	"sign-in",
	"onboarding",
	"eve",
	"agents",
]);

@Injectable()
export class ClientAccountsService {
	private readonly logger = new Logger(ClientAccountsService.name);

	constructor(@InjectDatabase() private readonly db: Db) {}

	async list(
		input: ClientAccountListInput,
	): Promise<ListResult<ClientAccountRow>> {
		const where = this.buildWhere(input);
		const { skip, take } = paginate(input);
		const orderBy = resolveOrderBy(input, SORTABLE, [{ name: "asc" }]);

		const [rows, total, statusGroups] = await Promise.all([
			this.db.clientAccount.findMany({
				where,
				orderBy,
				skip,
				take,
				include: {
					_count: {
						select: {
							companies: true,
							contacts: true,
							deals: true,
						},
					},
				},
			}),
			this.db.clientAccount.count({ where }),
			this.db.clientAccount.groupBy({
				by: ["status"],
				_count: { _all: true },
			}),
		]);

		const openDealCounts = await this.db.deal.groupBy({
			by: ["clientAccountId"],
			where: {
				clientAccountId: { in: rows.map((r) => r.id) },
				stage: {
					in: [
						"DEMO_BOOKED",
						"QUALIFIED_TO_BUY",
						"DECISION_MAKER_BOUGHT_IN",
						"CONTRACT_SENT",
					],
				},
			},
			_count: { _all: true },
		});
		const openDealByClient: Record<string, number> = {};
		for (const row of openDealCounts) {
			if (row.clientAccountId)
				openDealByClient[row.clientAccountId] = row._count._all;
		}

		const statusFacet: Record<string, number> = {};
		for (const g of statusGroups) {
			statusFacet[g.status] = g._count._all;
		}
		const facetCounts: Record<string, Record<string, number>> = {
			status: statusFacet,
		};

		return {
			rows: rows.map((row) => this.toRow(row, openDealByClient[row.id] ?? 0)),
			total,
			facetCounts,
		};
	}

	async byId(id: string) {
		const row = await this.db.clientAccount.findUnique({
			where: { id },
			include: {
				_count: {
					select: {
						companies: true,
						contacts: true,
						deals: true,
						forms: true,
						workflows: true,
					},
				},
			},
		});
		if (!row) throw new NotFoundException("Client not found");
		return {
			...this.toRow(row as unknown as Parameters<typeof this.toRow>[0], 0),
			notes: row.notes,
			timezone: row.timezone,
			startedAt: row.startedAt?.toISOString() ?? null,
			churnedAt: row.churnedAt?.toISOString() ?? null,
			counts: row._count,
		};
	}

	async create(input: ClientAccountCreateInput) {
		const slug = await this.uniqueSlug(input.slug ?? input.name);
		return this.db.clientAccount.create({
			data: {
				name: input.name,
				slug,
				status: input.status ?? ClientAccountStatus.ACTIVE,
				logoUrl: optional(input.logoUrl),
				brandColor: optional(input.brandColor),
				website: optional(input.website),
				industry: optional(input.industry),
				timezone: optional(input.timezone),
				monthlyRetainerCents: input.monthlyRetainerCents ?? null,
				currency: (input.currency ?? "USD").toUpperCase(),
				tags: input.tags ?? [],
				notes: optional(input.notes),
			},
		});
	}

	async update(id: string, input: Partial<ClientAccountCreateInput>) {
		const existing = await this.db.clientAccount.findUnique({ where: { id } });
		if (!existing) throw new NotFoundException("Client not found");
		const data: Prisma.ClientAccountUpdateInput = {};
		if (input.name !== undefined) data.name = input.name;
		if (input.slug !== undefined && input.slug !== existing.slug) {
			data.slug = await this.uniqueSlug(input.slug, id);
		}
		if (input.status !== undefined) data.status = input.status;
		if (input.logoUrl !== undefined) data.logoUrl = optional(input.logoUrl);
		if (input.brandColor !== undefined)
			data.brandColor = optional(input.brandColor);
		if (input.website !== undefined) data.website = optional(input.website);
		if (input.industry !== undefined) data.industry = optional(input.industry);
		if (input.timezone !== undefined) data.timezone = optional(input.timezone);
		if (input.monthlyRetainerCents !== undefined)
			data.monthlyRetainerCents = input.monthlyRetainerCents;
		if (input.currency !== undefined)
			data.currency = input.currency.toUpperCase();
		if (input.tags !== undefined) data.tags = input.tags;
		if (input.notes !== undefined) data.notes = optional(input.notes);
		if (input.status === ClientAccountStatus.CHURNED && !existing.churnedAt) {
			data.churnedAt = new Date();
		}
		if (input.status === ClientAccountStatus.ACTIVE && !existing.startedAt) {
			data.startedAt = new Date();
		}
		return this.db.clientAccount.update({ where: { id }, data });
	}

	async delete(id: string) {
		try {
			await this.db.clientAccount.delete({ where: { id } });
			return { id };
		} catch (err) {
			if (
				err instanceof PrismaNamespace.PrismaClientKnownRequestError &&
				err.code === "P2025"
			) {
				throw new NotFoundException("Client not found");
			}
			throw err;
		}
	}

	async options() {
		return this.db.clientAccount.findMany({
			where: { status: { not: ClientAccountStatus.CHURNED } },
			orderBy: { name: "asc" },
			select: {
				id: true,
				name: true,
				logoUrl: true,
				brandColor: true,
				status: true,
			},
		});
	}

	private toRow(
		row: {
			id: string;
			name: string;
			slug: string;
			status: ClientAccountStatus;
			logoUrl: string | null;
			brandColor: string | null;
			website: string | null;
			industry: string | null;
			monthlyRetainerCents: bigint | null;
			currency: string;
			tags: string[];
			createdAt: Date;
			updatedAt: Date;
			_count: { companies: number; contacts: number; deals: number };
		},
		openDealCount: number,
	): ClientAccountRow {
		return {
			id: row.id,
			name: row.name,
			slug: row.slug,
			status: row.status,
			logoUrl: row.logoUrl,
			brandColor: row.brandColor,
			website: row.website,
			industry: row.industry,
			monthlyRetainerCents:
				row.monthlyRetainerCents === null
					? null
					: row.monthlyRetainerCents.toString(),
			currency: row.currency,
			tags: row.tags,
			companyCount: row._count.companies,
			contactCount: row._count.contacts,
			openDealCount,
			createdAt: row.createdAt.toISOString(),
			updatedAt: row.updatedAt.toISOString(),
		};
	}

	private buildWhere(
		input: ClientAccountListInput,
	): Prisma.ClientAccountWhereInput {
		const clauses: Prisma.ClientAccountWhereInput[] = [];
		if (input.q.trim()) {
			clauses.push({
				OR: [
					{ name: { contains: input.q, mode: "insensitive" } },
					{ slug: { contains: input.q, mode: "insensitive" } },
					{ industry: { contains: input.q, mode: "insensitive" } },
				],
			});
		}
		if (input.status !== FACET_ALL) {
			const enumValues = Object.values(ClientAccountStatus) as string[];
			if (enumValues.includes(input.status)) {
				clauses.push({ status: input.status as ClientAccountStatus });
			}
		}
		return clauses.length ? { AND: clauses } : {};
	}

	private async uniqueSlug(candidate: string, excludeId?: string) {
		let base = candidate
			.toLowerCase()
			.trim()
			.replace(/[^a-z0-9]+/g, "-")
			.replace(/^-+|-+$/g, "");
		if (!base) base = "client";
		if (SLUG_RESERVED.has(base)) base = `${base}-1`;
		let slug = base;
		let n = 1;
		while (true) {
			const clash = await this.db.clientAccount.findFirst({
				where: {
					slug,
					id: excludeId ? { not: excludeId } : undefined,
				},
				select: { id: true },
			});
			if (!clash) return slug;
			n += 1;
			slug = `${base}-${n}`;
			if (n > 200) throw new BadRequestException("Could not derive slug");
		}
	}
}
