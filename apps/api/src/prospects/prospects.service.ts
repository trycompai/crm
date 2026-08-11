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
import {
	buildProspectReadiness,
	type ProspectReadiness,
	type ProspectReadinessContext,
} from "./prospect-readiness";
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
	readiness: ProspectReadiness;
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
		const now = new Date();
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
					personSourceUrl: true,
					routeEmail: true,
					emailAllowed: true,
					companyId: true,
					contactId: true,
					draftSubject: true,
					draftBody: true,
					lastResearchedAt: true,
					nextResearchAt: true,
					updatedAt: true,
					_count: { select: { evidence: true } },
					evidence: {
						select: {
							receiptId: true,
							sourceType: true,
							url: true,
							signalDate: true,
							observed: true,
						},
					},
					emailDrafts: {
						where: { sequenceId: { not: null } },
						orderBy: [{ sequenceId: "asc" }, { sequenceStep: "asc" }],
						select: {
							sequenceId: true,
							sequenceStep: true,
							status: true,
						},
					},
					company: {
						select: { _count: { select: { deals: true } } },
					},
				},
			}),
			this.db.prospect.count({ where }),
			this.facetCounts(input),
		]);

		const [queued, readinessContext] = await Promise.all([
			this.queue.queuedProspects(rows.map((row) => row.id)),
			this.readinessContext(rows.map((row) => row.routeEmail)),
		]);

		return {
			rows: rows.map((row) => {
				const rowQueued = queued.has(row.id);
				const context = {
					...readinessContext,
					now,
					routeSuppressed: routeSuppressed(
						row.routeEmail,
						readinessContext.suppressedEmails,
						readinessContext.suppressedDomains,
					),
				};
				const readiness = buildProspectReadiness(
					{
						id: row.id,
						status: row.status,
						routeStatus: row.routeStatus,
						enrichmentStatus: row.enrichmentStatus,
						countryCode: row.countryCode,
						website: row.website,
						namedPerson: row.namedPerson,
						role: row.role,
						personSourceUrl: row.personSourceUrl,
						routeEmail: row.routeEmail,
						emailAllowed: row.emailAllowed,
						companyId: row.companyId,
						contactId: row.contactId,
						draftSubject: row.draftSubject,
						draftBody: row.draftBody,
						lastResearchedAt: row.lastResearchedAt,
						nextResearchAt: row.nextResearchAt,
						queued: rowQueued,
						evidence: row.evidence,
						emailDrafts: row.emailDrafts,
					},
					context,
				);
				return {
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
					jobPostingCount: currentJobCount(row.evidence, row.website, now),
					hasDraft: Boolean(row.draftSubject && row.draftBody),
					dealCount: row.company?._count.deals ?? 0,
					queued: rowQueued,
					readiness,
					lastResearchedAt: row.lastResearchedAt?.toISOString() ?? null,
					nextResearchAt: row.nextResearchAt?.toISOString() ?? null,
					updatedAt: row.updatedAt.toISOString(),
				};
			}),
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
				emailDrafts: {
					where: { sequenceId: { not: null } },
					orderBy: [{ sequenceId: "asc" }, { sequenceStep: "asc" }],
					select: {
						sequenceId: true,
						sequenceStep: true,
						status: true,
					},
				},
			},
		});

		if (!prospect) throw new NotFoundException(`No prospect with id ${id}.`);
		const [queued, readinessContext] = await Promise.all([
			this.queue.isQueued({ prospectId: id }),
			this.readinessContext([prospect.routeEmail]),
		]);
		const readiness = buildProspectReadiness(
			{
				id: prospect.id,
				status: prospect.status,
				routeStatus: prospect.routeStatus,
				enrichmentStatus: prospect.enrichmentStatus,
				countryCode: prospect.countryCode,
				website: prospect.website,
				namedPerson: prospect.namedPerson,
				role: prospect.role,
				personSourceUrl: prospect.personSourceUrl,
				routeEmail: prospect.routeEmail,
				emailAllowed: prospect.emailAllowed,
				companyId: prospect.companyId,
				contactId: prospect.contactId,
				draftSubject: prospect.draftSubject,
				draftBody: prospect.draftBody,
				lastResearchedAt: prospect.lastResearchedAt,
				nextResearchAt: prospect.nextResearchAt,
				queued,
				evidence: prospect.evidence,
				emailDrafts: prospect.emailDrafts,
			},
			{
				...readinessContext,
				routeSuppressed: routeSuppressed(
					prospect.routeEmail,
					readinessContext.suppressedEmails,
					readinessContext.suppressedDomains,
				),
			},
		);
		const { emailDrafts: _emailDrafts, ...serializedProspect } = prospect;

		return {
			...serializedProspect,
			queued,
			readiness,
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

	private async readinessContext(routeEmails: (string | null)[]) {
		const sendingPaused =
			process.env.PROVIDER_MUTATIONS_PAUSED?.trim().toLowerCase() !== "false" ||
			process.env.OUTREACH_SENDS_PAUSED?.trim().toLowerCase() !== "false";
		const emails = [
			...new Set(
				routeEmails
					.map((email) => normalizeEmailValue(email))
					.filter((email): email is string => email !== null),
			),
		];
		const domains = [
			...new Set(
				emails
					.map((email) => emailDomain(email))
					.filter((domain): domain is string => domain !== null),
			),
		];
		const [inbox, suppressedContacts, suppressedDomains] = await Promise.all([
			this.db.emailInbox.findFirst({
				where: { provider: "AGENTMAIL", isEnabled: true },
				select: { id: true },
			}),
			emails.length > 0
				? this.db.suppressedContact.findMany({
						where: { email: { in: emails } },
						select: { email: true },
					})
				: [],
			domains.length > 0
				? this.db.suppressedDomain.findMany({
						where: { domain: { in: domains } },
						select: { domain: true },
					})
				: [],
		]);

		return {
			sendingPaused,
			agentMailReady: inbox !== null,
			routeSuppressed: false,
			suppressedEmails: new Set(
				suppressedContacts
					.map((row) => normalizeEmailValue(row.email))
					.filter((email): email is string => email !== null),
			),
			suppressedDomains: new Set(suppressedDomains.map((row) => row.domain)),
		};
	}
}

type PageReadinessContext = ProspectReadinessContext & {
	suppressedEmails: Set<string>;
	suppressedDomains: Set<string>;
};

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

function currentJobCount(
	evidence: {
		receiptId: string | null;
		sourceType: string;
		url: string;
		signalDate: Date | null;
		observed: string | null;
	}[],
	website: string | null,
	now: Date,
): number {
	const boundary = now.getTime() - 120 * 24 * 60 * 60 * 1_000;
	return evidence.filter(
		(item) =>
			item.receiptId &&
			item.observed?.trim() &&
			item.sourceType === "OFFICIAL_JOB_POSTING" &&
			item.signalDate !== null &&
			item.signalDate.getTime() >= boundary &&
			item.signalDate.getTime() <= now.getTime() &&
			domainOf(item.url) === domainOf(website),
	).length;
}

function normalizeEmailValue(value: string | null): string | null {
	const email = value?.trim().toLowerCase();
	return email?.includes("@") ? email : null;
}

function emailDomain(email: string): string | null {
	const [, domain] = email.split("@");
	return domain || null;
}

function routeSuppressed(
	routeEmail: string | null,
	suppressedEmails: PageReadinessContext["suppressedEmails"],
	suppressedDomains: PageReadinessContext["suppressedDomains"],
): boolean {
	const email = normalizeEmailValue(routeEmail);
	if (!email) return false;
	const domain = emailDomain(email);
	return (
		suppressedEmails.has(email) ||
		Boolean(domain && suppressedDomains.has(domain))
	);
}
