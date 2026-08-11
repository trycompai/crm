import {
	type Db,
	type EnrichmentStatus,
	type Prisma,
	type ProspectRouteStatus,
	type ProspectStatus,
} from "@crm/db";
import { PRIORITY } from "@crm/db/agent-tasks";
import { Injectable, NotFoundException } from "@nestjs/common";
import { AgentQueueService } from "../agent/agent-queue.service";
import { AgentTriggerService } from "../agent/agent-trigger.service";
import { InjectDatabase } from "../database/database.constants";
import {
	countsByKey,
	FACET_ALL,
	type ListResult,
	paginate,
	resolveOrderBy,
} from "../trpc/list-input";
import type { ProspectListInput } from "./prospects.contracts";

const SORTABLE: Record<
	string,
	(dir: Prisma.SortOrder) => Prisma.ProspectOrderByWithRelationInput
> = {
	company: (dir) => ({ companyName: dir }),
	fitScore: (dir) => ({ fitScore: { sort: dir, nulls: "last" } }),
	status: (dir) => ({ status: dir }),
	routeStatus: (dir) => ({ routeStatus: dir }),
	createdAt: (dir) => ({ createdAt: dir }),
	updatedAt: (dir) => ({ updatedAt: dir }),
};

export type ProspectRow = {
	id: string;
	companyName: string;
	countryCode: string;
	region: string;
	location: string | null;
	website: string | null;
	fitScore: number | null;
	status: ProspectStatus;
	routeStatus: ProspectRouteStatus;
	enrichmentStatus: EnrichmentStatus;
	namedPerson: string | null;
	role: string | null;
	companyId: string | null;
	contactId: string | null;
	evidenceCount: number;
	jobPostingCount: number;
	hasDraft: boolean;
	dealCount: number;
	queued: boolean;
	lastResearchedAt: string | null;
	nextResearchAt: string | null;
	updatedAt: string;
};

@Injectable()
export class ProspectsService {
	constructor(
		@InjectDatabase() private readonly db: Db,
		private readonly agent: AgentTriggerService,
		private readonly queue: AgentQueueService,
	) {}

	async list(input: ProspectListInput): Promise<ListResult<ProspectRow>> {
		const where = this.buildWhere(input);
		const { skip, take } = paginate(input);
		const [rows, total, facetCounts] = await Promise.all([
			this.db.prospect.findMany({
				where,
				skip,
				take,
				orderBy: resolveOrderBy(input, SORTABLE, { createdAt: "desc" }),
				select: {
					id: true,
					companyName: true,
					countryCode: true,
					region: true,
					location: true,
					website: true,
					fitScore: true,
					status: true,
					routeStatus: true,
					enrichmentStatus: true,
					namedPerson: true,
					role: true,
					companyId: true,
					contactId: true,
					draftSubject: true,
					draftBody: true,
					lastResearchedAt: true,
					nextResearchAt: true,
					updatedAt: true,
					_count: { select: { evidence: true } },
					evidence: {
						where: {
							sourceType: "OFFICIAL_JOB_POSTING",
							signalDate: {
								gte: new Date(Date.now() - 120 * 24 * 60 * 60 * 1_000),
								lte: new Date(),
							},
							receiptId: { not: null },
						},
						select: { id: true, url: true },
					},
					company: {
						select: { _count: { select: { deals: true } } },
					},
				},
			}),
			this.db.prospect.count({ where }),
			this.facetCounts(input),
		]);

		const queued = await this.queue.queuedProspects(rows.map((row) => row.id));

		return {
			rows: rows.map((row) => ({
				id: row.id,
				companyName: row.companyName,
				countryCode: row.countryCode,
				region: row.region,
				location: row.location,
				website: row.website,
				fitScore: row.fitScore,
				status: row.status,
				routeStatus: row.routeStatus,
				enrichmentStatus: row.enrichmentStatus,
				namedPerson: row.namedPerson,
				role: row.role,
				companyId: row.companyId,
				contactId: row.contactId,
				evidenceCount: row._count.evidence,
				jobPostingCount: row.evidence.filter(
					(item) => domainOf(item.url) === domainOf(row.website),
				).length,
				hasDraft: Boolean(row.draftSubject && row.draftBody),
				dealCount: row.company?._count.deals ?? 0,
				queued: queued.has(row.id),
				lastResearchedAt: row.lastResearchedAt?.toISOString() ?? null,
				nextResearchAt: row.nextResearchAt?.toISOString() ?? null,
				updatedAt: row.updatedAt.toISOString(),
			})),
			total,
			facetCounts,
		};
	}

	async byId(id: string) {
		const prospect = await this.db.prospect.findUnique({
			where: { id },
			include: {
				evidence: {
					orderBy: [
						{ signalDate: { sort: "desc", nulls: "last" } },
						{ createdAt: "desc" },
					],
					include: {
						receipt: {
							select: {
								fetchedAt: true,
								finalUrl: true,
								statusCode: true,
								contentHash: true,
							},
						},
					},
				},
				company: {
					select: {
						id: true,
						name: true,
						domain: true,
						_count: { select: { deals: true } },
					},
				},
				contact: {
					select: {
						id: true,
						firstName: true,
						lastName: true,
						email: true,
						title: true,
						linkedinUrl: true,
					},
				},
			},
		});

		if (!prospect) throw new NotFoundException(`No prospect with id ${id}.`);

		return {
			...prospect,
			queued: await this.queue.isQueued({ prospectId: id }),
			createdAt: prospect.createdAt.toISOString(),
			updatedAt: prospect.updatedAt.toISOString(),
			enrichedAt: prospect.enrichedAt?.toISOString() ?? null,
			lastResearchedAt: prospect.lastResearchedAt?.toISOString() ?? null,
			nextResearchAt: prospect.nextResearchAt?.toISOString() ?? null,
			suppressionCheckedAt:
				prospect.suppressionCheckedAt?.toISOString() ?? null,
			promotedAt: prospect.promotedAt?.toISOString() ?? null,
			emailAllowedAt: prospect.emailAllowedAt?.toISOString() ?? null,
			evidence: prospect.evidence.map((item) => ({
				...item,
				createdAt: item.createdAt.toISOString(),
				signalDate: item.signalDate?.toISOString() ?? null,
				receipt: item.receipt
					? {
							...item.receipt,
							fetchedAt: item.receipt.fetchedAt.toISOString(),
						}
					: null,
			})),
		};
	}

	async research(ids: string[]) {
		const unique = [...new Set(ids)];
		const existing = await this.db.prospect.findMany({
			where: {
				id: { in: unique },
				status: { notIn: ["PROMOTED", "DISQUALIFIED"] },
			},
			select: { id: true },
		});
		if (existing.length === 0 && unique.length === 1) {
			const found = await this.db.prospect.findUnique({
				where: { id: unique[0] },
				select: { id: true },
			});
			if (!found)
				throw new NotFoundException(`No prospect with id ${unique[0]}.`);
		}

		const prospectIds = existing.map((row) => row.id);
		await this.db.prospect.updateMany({
			where: { id: { in: prospectIds } },
			data: {
				status: "RESEARCHING",
				enrichmentStatus: "PENDING",
				enrichmentError: null,
				nextResearchAt: null,
			},
		});
		const queued = await this.agent.backfill({
			kind: "prospect-research",
			reason:
				"Refresh public evidence, current job signals, named contact, verified route, score and draft",
			prospectIds,
			priority: PRIORITY.prospectResearch,
			budget: 10,
		});

		return queued;
	}

	async researchGaps(limit: number) {
		const rows = await this.db.prospect.findMany({
			where: {
				status: { notIn: ["PROMOTED", "DISQUALIFIED"] },
				OR: [
					{ namedPerson: null },
					{ role: null },
					{ personSourceUrl: null },
					{ routeEmail: null },
					{ draftBody: null },
					{ evidence: { none: { receiptId: { not: null } } } },
					{
						evidence: {
							none: {
								sourceType: "OFFICIAL_JOB_POSTING",
								receiptId: { not: null },
								signalDate: {
									gte: new Date(Date.now() - 120 * 24 * 60 * 60 * 1_000),
									lte: new Date(),
								},
							},
						},
					},
				],
			},
			orderBy: [{ fitScore: "desc" }, { updatedAt: "asc" }],
			take: limit,
			select: { id: true },
		});

		const result = await this.research(rows.map((row) => row.id));
		return { selected: rows.length, ...result };
	}

	async updateDraft(input: {
		id: string;
		draftSubject: string;
		draftBody: string;
	}) {
		const result = await this.db.prospect.updateMany({
			where: { id: input.id },
			data: {
				draftSubject: input.draftSubject,
				draftBody: input.draftBody,
			},
		});
		if (result.count === 0) {
			throw new NotFoundException(`No prospect with id ${input.id}.`);
		}
		return { id: input.id, saved: true };
	}

	async deleteDraft(id: string) {
		const result = await this.db.prospect.updateMany({
			where: {
				id,
				OR: [{ draftSubject: { not: null } }, { draftBody: { not: null } }],
			},
			data: { draftSubject: null, draftBody: null },
		});
		if (result.count === 0) {
			throw new NotFoundException("Review draft not found.");
		}
		return { id, deleted: true };
	}

	private buildWhere(input: ProspectListInput): Prisma.ProspectWhereInput {
		const q = input.q.trim();
		const where: Prisma.ProspectWhereInput = q
			? {
					OR: [
						{ companyName: { contains: q, mode: "insensitive" } },
						{ namedPerson: { contains: q, mode: "insensitive" } },
						{ role: { contains: q, mode: "insensitive" } },
						{ website: { contains: q, mode: "insensitive" } },
					],
				}
			: {};

		if (input.countryCode !== FACET_ALL) where.countryCode = input.countryCode;
		if (input.status !== FACET_ALL)
			where.status = input.status as ProspectStatus;
		if (input.routeStatus !== FACET_ALL) {
			where.routeStatus = input.routeStatus as ProspectRouteStatus;
		}
		if (input.contact === "named") where.namedPerson = { not: null };
		if (input.contact === "missing") where.namedPerson = null;

		return where;
	}

	private async facetCounts(input: ProspectListInput) {
		const where = this.buildWhere({
			...input,
			countryCode: FACET_ALL,
			status: FACET_ALL,
			routeStatus: FACET_ALL,
			contact: "all",
		});
		const [countries, statuses, routes, named, missing] = await Promise.all([
			this.db.prospect.groupBy({
				by: ["countryCode"],
				where,
				_count: { _all: true },
			}),
			this.db.prospect.groupBy({
				by: ["status"],
				where,
				_count: { _all: true },
			}),
			this.db.prospect.groupBy({
				by: ["routeStatus"],
				where,
				_count: { _all: true },
			}),
			this.db.prospect.count({
				where: { ...where, namedPerson: { not: null } },
			}),
			this.db.prospect.count({ where: { ...where, namedPerson: null } }),
		]);

		return {
			countryCode: countsByKey(countries, "countryCode"),
			status: countsByKey(statuses, "status"),
			routeStatus: countsByKey(routes, "routeStatus"),
			contact: { named, missing },
		};
	}
}

function domainOf(value: string | null): string | null {
	if (!value) return null;
	try {
		return new URL(value.includes("://") ? value : `https://${value}`).hostname
			.toLowerCase()
			.replace(/^www\./, "");
	} catch {
		return null;
	}
}
