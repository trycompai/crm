import {
	type Db,
	EnrichmentStatus,
	type Prisma,
	Prisma as PrismaNamespace,
	RecordSource,
} from "@crm/db";
import { OPEN_DEAL_STAGES } from "@crm/db/deal-stage";
import type { FieldDefinitionWithOptions } from "@crm/db/fields";
import { lockIdempotencyKey, lockIdempotencyKeys } from "@crm/db/idempotency";
import {
	COMPANY_IMPORT,
	type CompanyImportInput,
} from "@crm/validation/company-import";
import {
	BadRequestException,
	ConflictException,
	Injectable,
	Logger,
	NotFoundException,
} from "@nestjs/common";
import { AgentQueueService } from "../agent/agent-queue.service";
import { AgentTriggerService } from "../agent/agent-trigger.service";
import { ARCHIVE } from "../archive/archive-config";
import {
	ActivityStampService,
	type StampTargets,
} from "../crm/activity-stamp.service";
import { type BulkResult, requireOwner, runBulk } from "../crm/bulk";
import { blankToNull, toCents } from "../crm/values";
import { ConversionService } from "../currency/conversion.service";
import { InjectDatabase } from "../database/database.constants";
import { FieldsService } from "../fields/fields.service";
import {
	activityFacetCounts,
	activityFilter,
	archivedFilter,
	countsByKey,
	FACET_UNASSIGNED,
	type ListResult,
	type OrderByColumns,
	ownerFilter,
	paginate,
	resolveOrderBy,
} from "../trpc/list-input";
import type {
	CompanyBulkOwnerInput,
	CompanyCreateInput,
	CompanyListInput,
	CompanyRow,
	CompanyUpdateInput,
} from "./companies.contracts";
import { normalizeDomain } from "./domain";
import { FaviconService } from "./favicon.service";

const OWNER_SELECT = {
	id: true,
	name: true,
	email: true,
	image: true,
} as const;

const SORTABLE: OrderByColumns<Prisma.CompanyOrderByWithRelationInput> = {
	name: (dir) => ({ name: dir }),
	domain: (dir) => ({ domain: dir }),
	industry: (dir) => ({ industry: dir }),
	createdAt: (dir) => ({ createdAt: dir }),
	contacts: (dir) => ({ contacts: { _count: dir } }),
	deals: (dir) => ({ deals: { _count: dir } }),
	owner: (dir) => ({ owner: { name: dir } }),
	lastActivity: (dir) => ({ lastActivityAt: { sort: dir, nulls: "last" } }),
	archivedAt: (dir) => ({ archivedAt: { sort: dir, nulls: "last" } }),
};

@Injectable()
export class CompaniesService {
	private readonly logger = new Logger(CompaniesService.name);

	constructor(
		@InjectDatabase() private readonly db: Db,
		private readonly agent: AgentTriggerService,
		private readonly queue: AgentQueueService,
		private readonly favicon: FaviconService,
		private readonly stamp: ActivityStampService,
		private readonly conversion: ConversionService,
		private readonly fields: FieldsService,
	) {}

	async list(input: CompanyListInput): Promise<ListResult<CompanyRow>> {
		const filterableFields = await this.fields.filterableFieldsFor("COMPANY");
		const where = this.buildWhere(input, filterableFields);
		const { skip, take } = paginate(input);

		const [rows, total, facetCounts] = await Promise.all([
			this.db.company.findMany({
				where,
				skip,
				take,
				orderBy: resolveOrderBy(input, SORTABLE, {
					createdAt: "desc",
				}),
				select: {
					id: true,
					name: true,
					domain: true,
					iconUrl: true,
					iconDarkUrl: true,
					iconTone: true,
					logoUrl: true,
					brandColor: true,
					industry: true,
					enrichmentStatus: true,
					source: true,
					owner: { select: OWNER_SELECT },
					_count: {
						select: {
							contacts: true,
							deals: { where: { stage: { in: [...OPEN_DEAL_STAGES] } } },
						},
					},
					lastActivityAt: true,
					createdAt: true,
					archivedAt: true,
				},
			}),
			this.db.company.count({ where }),
			this.facetCounts(input, filterableFields),
		]);

		const ids = rows.map((row) => row.id);
		const [queued, tableFields] = await Promise.all([
			this.queue.queuedCompanies(ids),
			this.fields.tableValuesFor("COMPANY", ids),
		]);

		return {
			rows: rows.map((row) => ({
				id: row.id,
				name: row.name,
				domain: row.domain,
				iconUrl: row.iconUrl,
				iconDarkUrl: row.iconDarkUrl,
				iconTone: row.iconTone,
				logoUrl: row.logoUrl,
				brandColor: row.brandColor,
				industry: row.industry,
				enrichmentStatus: row.enrichmentStatus,
				queued: queued.has(row.id),
				source: row.source,
				owner: row.owner,
				contactCount: row._count.contacts,
				openDealCount: row._count.deals,
				lastActivityAt: row.lastActivityAt?.toISOString() ?? null,
				createdAt: row.createdAt.toISOString(),
				archivedAt: row.archivedAt?.toISOString() ?? null,
				fields: tableFields.get(row.id) ?? {},
			})),
			total,
			facetCounts,
		};
	}

	async byId(id: string) {
		const reportingCurrency = await this.conversion.reportingCurrency();
		const company = await this.db.company.findUnique({
			where: { id },
			select: {
				id: true,
				name: true,
				domain: true,
				website: true,
				description: true,
				logoUrl: true,
				logoDarkUrl: true,
				iconUrl: true,
				iconDarkUrl: true,
				iconTone: true,
				brandColor: true,
				industry: true,
				subIndustry: true,
				city: true,
				stateCode: true,
				country: true,
				countryCode: true,
				phone: true,
				email: true,
				linkedinUrl: true,
				twitterUrl: true,
				githubUrl: true,
				pricingUrl: true,
				careersUrl: true,
				enrichmentStatus: true,
				enrichedAt: true,
				enrichmentError: true,
				source: true,
				createdAt: true,
				archivedAt: true,
				owner: { select: OWNER_SELECT },
				primaryContact: {
					select: {
						id: true,
						firstName: true,
						lastName: true,
						email: true,
						phone: true,
						title: true,
					},
				},
				contacts: {
					orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
					select: {
						id: true,
						firstName: true,
						lastName: true,
						email: true,
						title: true,
						imageUrl: true,
						owner: { select: OWNER_SELECT },
					},
				},
				deals: {
					orderBy: [{ stage: "asc" }, { expectedCloseDate: "asc" }],
					select: {
						id: true,
						name: true,
						stage: true,
						amount: true,
						currency: true,
						baseAmount: true,
						baseCurrency: true,
						expectedCloseDate: true,
						owner: { select: OWNER_SELECT },
					},
				},
			},
		});

		if (!company) {
			throw new NotFoundException(`No company with id ${id}.`);
		}

		const openWhere: Prisma.DealWhereInput = {
			companyId: id,
			archivedAt: null,
			stage: { in: [...OPEN_DEAL_STAGES] },
		};
		const [openDeals, openValue, unconverted] = await Promise.all([
			this.db.deal.aggregate({
				where: openWhere,
				_count: { _all: true },
				_min: { expectedCloseDate: true },
			}),
			this.db.deal.aggregate({
				where: {
					AND: [openWhere, this.conversion.countedWhere(reportingCurrency)],
				},
				_sum: { baseAmount: true },
			}),
			this.db.deal.count({
				where: {
					AND: [openWhere, this.conversion.pendingWhere(reportingCurrency)],
				},
			}),
		]);

		const {
			deals,
			primaryContact,
			enrichedAt,
			createdAt,
			archivedAt,
			...rest
		} = company;

		return {
			...rest,
			fields: await this.fields.valuesFor("COMPANY", id),
			queued: await this.queue.isQueued({ companyId: id }),
			createdAt: createdAt.toISOString(),
			archivedAt: archivedAt?.toISOString() ?? null,
			enrichedAt: enrichedAt?.toISOString() ?? null,
			primaryContactId: primaryContact?.id ?? null,
			primaryContact,
			reportingCurrency,
			openPipeline: {
				count: openDeals._count._all,
				totalCents: toCents(openValue._sum.baseAmount),
				unconverted,
				nextClose: openDeals._min.expectedCloseDate?.toISOString() ?? null,
			},
			deals: deals.map((deal) => ({
				...deal,
				amount: undefined,
				baseAmount: undefined,
				baseCurrency: undefined,
				amountCents: toCents(deal.amount),
				baseAmountCents:
					deal.baseCurrency === reportingCurrency
						? toCents(deal.baseAmount)
						: null,
				expectedCloseDate: deal.expectedCloseDate?.toISOString() ?? null,
			})),
		};
	}

	async options(q: string) {
		return this.db.company.findMany({
			where: this.searchFilter(q),
			select: { id: true, name: true, domain: true, iconUrl: true },
			orderBy: { name: "asc" },
			take: 100,
		});
	}

	async create(input: CompanyCreateInput) {
		const domain = normalizeDomain(input.domain);

		const company = await this.agent.withCrmEvents(async (tx, emit) => {
			if (domain) {
				await lockIdempotencyKey(tx, `company-directory:${domain}`);
				const existing = await tx.company.findFirst({
					where: { domain, archivedAt: null },
					select: { name: true },
				});
				if (existing) {
					throw new ConflictException(
						`${existing.name} already uses the domain ${domain}.`,
					);
				}
			}

			const created = await tx.company.create({
				data: {
					name: input.name.trim(),
					domain,
					website: domain ? `https://${domain}` : null,
					ownerId: input.ownerId ?? null,
				},
				select: { id: true, name: true, domain: true, createdAt: true },
			});
			await emit({
				type: "company.created",
				record: { kind: "company", id: created.id },
				occurredAt: created.createdAt,
				data: { name: created.name, domain: created.domain },
			});
			return created;
		});

		this.logger.log({
			message: "Company created",
			companyId: company.id,
			domain: company.domain,
		});

		await this.agent.companyCreated(company.id);

		void this.favicon.backfill(company.id, company.domain);
		void this.fields.queueBackfillForNewRecord("COMPANY", company.id);

		return { id: company.id, name: company.name, domain: company.domain };
	}

	async import(input: CompanyImportInput) {
		const skips: Array<{ row: number; reason: string }> = [];
		const candidates = input.rows.flatMap((row, index) => {
			const rowNumber = index + 2;
			const name = row.name.trim();
			if (!name) {
				skips.push({ row: rowNumber, reason: "A company needs a name." });
				return [];
			}

			const website = row.website?.trim() ?? "";
			const domain = normalizeDomain(website);
			if (website && !domain) {
				skips.push({
					row: rowNumber,
					reason: `"${website}" is not a valid domain.`,
				});
				return [];
			}

			return [
				{
					row: rowNumber,
					name,
					domain,
					phone: blankToNull(row.phone ?? ""),
					city: blankToNull(row.city ?? ""),
					stateCode: blankToNull(row.stateCode ?? ""),
					industry: blankToNull(row.industry ?? ""),
					subIndustry: blankToNull(row.subIndustry ?? ""),
					description: blankToNull(row.description ?? ""),
				},
			];
		});

		const created = await this.agent.withCrmEvents(async (tx, emit) => {
			const domains = [
				...new Set(
					candidates.flatMap((candidate) =>
						candidate.domain ? [candidate.domain] : [],
					),
				),
			].toSorted();
			await lockIdempotencyKeys(
				tx,
				domains.map((domain) => `company-directory:${domain}`),
			);

			const existing = new Set(
				(
					await tx.company.findMany({
						where: { domain: { in: domains }, archivedAt: null },
						select: { domain: true },
					})
				).flatMap((company) => (company.domain ? [company.domain] : [])),
			);
			const accepted = [];
			const seen = new Set<string>();
			for (const candidate of candidates) {
				if (candidate.domain && existing.has(candidate.domain)) {
					skips.push({
						row: candidate.row,
						reason: `${candidate.domain} already belongs to a company.`,
					});
					continue;
				}
				if (candidate.domain && seen.has(candidate.domain)) {
					skips.push({
						row: candidate.row,
						reason: `${candidate.domain} appears more than once in this file.`,
					});
					continue;
				}
				if (candidate.domain) seen.add(candidate.domain);
				accepted.push(candidate);
			}

			if (accepted.length === 0) return [];
			const rows = await tx.company.createManyAndReturn({
				data: accepted.map(({ row: _row, ...company }) => ({
					...company,
					website: company.domain ? `https://${company.domain}` : null,
					source: RecordSource.IMPORT,
					enrichmentStatus: EnrichmentStatus.PENDING,
				})),
				select: { id: true, name: true, domain: true, createdAt: true },
			});

			for (const company of rows) {
				await emit({
					type: "company.created",
					record: { kind: "company", id: company.id },
					occurredAt: company.createdAt,
					data: { name: company.name, domain: company.domain },
				});
			}
			return rows;
		});

		const ids = created.map((company) => company.id);
		await Promise.all([
			this.agent.companiesCreated(ids, "Imported from CSV"),
			this.fields.queueBackfillForNewRecords("COMPANY", ids),
		]);
		void this.backfillFavicons(created);

		this.logger.log({
			message: "Companies imported",
			created: created.length,
			skipped: skips.length,
		});

		return {
			created: created.length,
			skipped: skips.length,
			skips: skips.toSorted((left, right) => left.row - right.row),
		};
	}

	async update(id: string, input: CompanyUpdateInput) {
		const data: Prisma.CompanyUpdateInput = {};

		if (input.name !== undefined) data.name = input.name.trim();
		if (input.website !== undefined) data.website = blankToNull(input.website);
		if (input.description !== undefined) {
			data.description = blankToNull(input.description);
		}
		if (input.industry !== undefined)
			data.industry = blankToNull(input.industry);
		if (input.city !== undefined) data.city = blankToNull(input.city);
		if (input.stateCode !== undefined) {
			data.stateCode = blankToNull(input.stateCode);
		}
		if (input.country !== undefined) data.country = blankToNull(input.country);
		if (input.phone !== undefined) data.phone = blankToNull(input.phone);
		if (input.email !== undefined) data.email = blankToNull(input.email);
		if (input.linkedinUrl !== undefined) {
			data.linkedinUrl = blankToNull(input.linkedinUrl);
		}
		if (input.ownerId !== undefined) {
			data.owner = input.ownerId
				? { connect: { id: input.ownerId } }
				: { disconnect: true };
		}

		if (input.domain !== undefined) {
			const domain = normalizeDomain(input.domain);
			if (input.domain.trim() && !domain) {
				throw new BadRequestException(
					`"${input.domain}" is not a domain. Try something like "stripe.com".`,
				);
			}
			data.domain = domain;
			const current = await this.db.company.findUnique({
				where: { id },
				select: { domain: true },
			});
			if (current && current.domain !== domain) {
				data.enrichmentStatus = "PENDING";
				data.enrichmentError = null;
				data.iconUrl = null;
				data.iconDarkUrl = null;
				data.iconTone = null;
			}
		}

		try {
			const updated = await this.db.$transaction(async (tx) => {
				if (input.fields) {
					await this.fields.applyValues(tx, "COMPANY", id, input.fields);
				}

				return tx.company.update({
					where: { id },
					data,
					select: { id: true, name: true, domain: true },
				});
			});

			if (data.enrichmentStatus === "PENDING") {
				await this.agent.companyCreated(
					id,
					"Domain changed. Anything we knew was about a different company",
				);
				void this.favicon.backfill(id, updated.domain);
			}

			return updated;
		} catch (error) {
			throw this.translate(error, id);
		}
	}

	async archive(id: string): Promise<{ id: string; name: string }> {
		try {
			const company = await this.db.company.update({
				where: { id },
				data: { archivedAt: new Date() },
				select: { name: true },
			});

			this.logger.log({ message: "Company archived", companyId: id });

			return { id, name: company.name };
		} catch (error) {
			throw this.translate(error, id);
		}
	}

	async restore(id: string): Promise<{ id: string; name: string }> {
		try {
			const company = await this.db.company.update({
				where: { id },
				data: { archivedAt: null },
				select: { name: true },
			});

			this.logger.log({ message: "Company restored", companyId: id });

			return { id, name: company.name };
		} catch (error) {
			throw this.translate(error, id);
		}
	}

	async purge(id: string): Promise<{ id: string; name: string }>;
	async purge(
		id: string,
		guard: { archivedBefore: Date },
	): Promise<{ id: string; name: string } | null>;
	async purge(
		id: string,
		guard?: { archivedBefore: Date },
	): Promise<{ id: string; name: string } | null> {
		let deleted: { targets: StampTargets; name: string } | null;

		try {
			deleted = await this.db.$transaction(async (tx) => {
				const [row] = await tx.$queryRaw<Array<{ archivedAt: Date | null }>>`
					SELECT "archivedAt" FROM company WHERE id = ${id} FOR UPDATE
				`;

				if (!row) {
					if (guard) return null;
					throw new NotFoundException(`No company with id ${id}.`);
				}
				if (
					guard &&
					(!row.archivedAt || row.archivedAt > guard.archivedBefore)
				) {
					return null;
				}

				const targets = await this.stamp.targetsOf(
					{ OR: [{ companyId: id }, { deal: { companyId: id } }] },
					tx,
				);

				const deals = await tx.deal.findMany({
					where: { companyId: id },
					select: { id: true },
				});

				await tx.agentTask.deleteMany({
					where: {
						OR: [
							{ companyId: id },
							{ dealId: { in: deals.map((deal) => deal.id) } },
						],
					},
				});

				const company = await tx.company.delete({
					where: { id },
					select: { name: true },
				});

				return { targets, name: company.name };
			});
		} catch (error) {
			throw this.translate(error, id);
		}

		if (!deleted) return null;

		await this.stamp.recomputeAfterDelete(deleted.targets, { companyId: id });

		this.logger.log({
			message: "Company purged",
			companyId: id,
			name: deleted.name,
		});

		return { id, name: deleted.name };
	}

	async purgeExpired(before: Date): Promise<BulkResult> {
		const expired = await this.db.company.findMany({
			where: { archivedAt: { lte: before } },
			select: { id: true },
			take: ARCHIVE.prune.maxBatch,
		});

		return runBulk(
			expired.map((row) => row.id),
			(id) => this.purge(id, { archivedBefore: before }),
		);
	}

	async bulkAssignOwner(input: CompanyBulkOwnerInput): Promise<BulkResult> {
		const ownerId = input.ownerId || null;

		await requireOwner(this.db, ownerId);

		const ids = [...new Set(input.ids)];
		const { count } = await this.db.company.updateMany({
			where: { id: { in: ids } },
			data: { ownerId },
		});

		this.logger.log({
			message: "Companies reassigned",
			count,
			ownerId,
		});

		return {
			requested: ids.length,
			succeeded: count,
			skipped: 0,
			failed: ids.length - count,
			message: null,
		};
	}

	async bulkEnrich(ids: string[]): Promise<BulkResult> {
		return runBulk(ids, (id) => this.enrich(id));
	}

	async bulkArchive(ids: string[]): Promise<BulkResult> {
		return runBulk(ids, (id) => this.archive(id));
	}

	async bulkRestore(ids: string[]): Promise<BulkResult> {
		return runBulk(ids, (id) => this.restore(id));
	}

	async bulkPurge(ids: string[]): Promise<BulkResult> {
		return runBulk(ids, (id) => this.purge(id));
	}

	async enrich(id: string): Promise<{ id: string; queued: boolean }> {
		const company = await this.db.company.findUnique({
			where: { id },
			select: { id: true, updatedAt: true },
		});

		if (!company) {
			throw new NotFoundException(`No company with id ${id}.`);
		}

		const queued = await this.agent.companyRequested(
			id,
			"A rep asked for a fresh look",
		);

		if (queued) {
			await this.db.company.updateMany({
				where: { id, updatedAt: company.updatedAt },
				data: { enrichmentStatus: "PENDING", enrichmentError: null },
			});
		}

		return { id, queued };
	}

	async research(id: string, actingUserId: string) {
		const company = await this.db.company.findUnique({
			where: { id },
			select: { id: true, domain: true },
		});

		if (!company) {
			throw new NotFoundException(`No company with id ${id}.`);
		}

		if (!company.domain) {
			throw new BadRequestException(
				"There is nothing to read without a domain. Add one first.",
			);
		}

		const queued = await this.agent.companyRequested(
			id,
			`Briefing requested by a rep (${actingUserId})`,
		);

		return { ok: true as const, queued };
	}

	async setPrimaryContact(companyId: string, contactId: string | null) {
		if (contactId) {
			const contact = await this.db.contact.findUnique({
				where: { id: contactId },
				select: { companyId: true },
			});
			if (!contact) {
				throw new NotFoundException(`No contact with id ${contactId}.`);
			}
			if (contact.companyId !== companyId) {
				throw new BadRequestException(
					"That contact does not work at this company.",
				);
			}
		}

		try {
			return await this.db.company.update({
				where: { id: companyId },
				data: { primaryContactId: contactId },
				select: { id: true, primaryContactId: true },
			});
		} catch (error) {
			throw this.translate(error, companyId);
		}
	}

	private searchFilter(q: string): Prisma.CompanyWhereInput {
		const term = q.trim();
		if (!term) return {};

		return {
			OR: [
				{ name: { contains: term, mode: "insensitive" } },
				{ domain: { contains: term, mode: "insensitive" } },
			],
		};
	}

	private buildWhere(
		input: CompanyListInput,
		filterableFields: FieldDefinitionWithOptions[],
	): Prisma.CompanyWhereInput {
		const and: Prisma.CompanyWhereInput[] = [
			this.searchFilter(input.q),
			archivedFilter(input.archived),
			...this.fields.fieldFilters(filterableFields, input.fields),
		];

		const owner = ownerFilter<Prisma.CompanyWhereInput>(input.owner);
		if (owner) and.push(owner);

		if (input.industry.length > 0)
			and.push({ industry: { in: input.industry } });
		if (input.enrichment.length > 0) {
			and.push({
				enrichmentStatus: { in: input.enrichment as EnrichmentStatus[] },
			});
		}
		if (input.source.length > 0) {
			and.push({ source: { in: input.source as RecordSource[] } });
		}

		const activity = activityFilter(input.activity);
		if (activity) and.push(activity);

		return { AND: and };
	}

	private async facetCounts(
		input: CompanyListInput,
		filterableFields: FieldDefinitionWithOptions[],
	) {
		const where = {
			AND: [this.searchFilter(input.q), archivedFilter(input.archived)],
		};

		const [owners, industries, enrichment, sources, activity, fieldFacets] =
			await Promise.all([
				this.db.company.groupBy({
					by: ["ownerId"],
					where,
					_count: { _all: true },
				}),
				this.db.company.groupBy({
					by: ["industry"],
					where,
					_count: { _all: true },
				}),
				this.db.company.groupBy({
					by: ["enrichmentStatus"],
					where,
					_count: { _all: true },
				}),
				this.db.company.groupBy({
					by: ["source"],
					where,
					_count: { _all: true },
				}),
				activityFacetCounts((activityWhere) =>
					this.db.company.count({ where: { AND: [where, activityWhere] } }),
				),
				this.fields.filterFacetCounts("COMPANY", where, filterableFields),
			]);

		return {
			owner: countsByKey(owners, "ownerId", FACET_UNASSIGNED),
			industry: countsByKey(industries, "industry"),
			enrichment: countsByKey(enrichment, "enrichmentStatus"),
			source: countsByKey(sources, "source"),
			activity,
			...Object.fromEntries(
				Object.entries(fieldFacets).map(([key, counts]) => [
					`field:${key}`,
					counts,
				]),
			),
		};
	}

	private translate(cause: unknown, id: string): never {
		if (cause instanceof PrismaNamespace.PrismaClientKnownRequestError) {
			if (cause.code === "P2025") {
				throw new NotFoundException(`No company with id ${id}.`);
			}
			if (cause.code === "P2002") {
				throw new ConflictException(
					"Another company already uses that domain.",
				);
			}
		}
		throw cause;
	}

	private async backfillFavicons(
		companies: Array<{ id: string; domain: string | null }>,
	): Promise<void> {
		const queue = companies[Symbol.iterator]();
		const width = Math.min(COMPANY_IMPORT.faviconConcurrency, companies.length);
		await Promise.all(
			Array.from({ length: width }, async () => {
				for (const company of queue) {
					await this.favicon.backfill(company.id, company.domain);
				}
			}),
		);
	}
}
