import {
	type ContactBriefSections,
	type Db,
	type FactEvidence,
	FactStatus,
	type Prisma,
	Prisma as PrismaNamespace,
	type RecordSource,
} from "@crm/db";
import type { FieldDefinitionWithOptions } from "@crm/db/fields";
import {
	ConflictException,
	Injectable,
	Logger,
	NotFoundException,
} from "@nestjs/common";
import { AgentQueueService } from "../agent/agent-queue.service";
import { AgentTriggerService } from "../agent/agent-trigger.service";
import { ARCHIVE } from "../archive/archive-config";
import { CompanyDirectoryService } from "../companies/company-directory.service";
import {
	ActivityStampService,
	type StampTargets,
} from "../crm/activity-stamp.service";
import { type BulkResult, requireOwner, runBulk } from "../crm/bulk";
import { blankToNull, normalizeEmail, toCents } from "../crm/values";
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
	splitSentinel,
} from "../trpc/list-input";
import type {
	ContactBulkCompanyInput,
	ContactBulkOwnerInput,
	ContactCreateInput,
	ContactListInput,
	ContactRow,
	ContactUpdateInput,
	FactDecisionInput,
} from "./contacts.contracts";

const OWNER_SELECT = {
	id: true,
	name: true,
	email: true,
	image: true,
} as const;

const COMPANY_SELECT = {
	id: true,
	name: true,
	domain: true,
	iconUrl: true,
	iconDarkUrl: true,
	iconTone: true,
	logoUrl: true,
} as const;

const NO_COMPANY = "none";

type FactColumns = Record<string, string | undefined>;

const FACT_COLUMNS: FactColumns = {
	title: "title",
	seniority: "seniority",
	function: "function",
	linkedinUrl: "linkedinUrl",
	twitterUrl: "twitterUrl",
	githubUrl: "githubUrl",
};

const SORTABLE: OrderByColumns<Prisma.ContactOrderByWithRelationInput[]> = {
	name: (dir) => [{ lastName: dir }, { firstName: dir }],
	email: (dir) => [{ email: dir }],
	title: (dir) => [{ title: dir }, { lastName: "asc" }],
	company: (dir) => [{ company: { name: dir } }, { lastName: "asc" }],
	createdAt: (dir) => [{ createdAt: dir }],
	owner: (dir) => [{ owner: { name: dir } }, { lastName: "asc" }],
	lastActivity: (dir) => [{ lastActivityAt: { sort: dir, nulls: "last" } }],
	archivedAt: (dir) => [{ archivedAt: { sort: dir, nulls: "last" } }],
};

@Injectable()
export class ContactsService {
	private readonly logger = new Logger(ContactsService.name);

	constructor(
		@InjectDatabase() private readonly db: Db,
		private readonly companies: CompanyDirectoryService,
		private readonly agent: AgentTriggerService,
		private readonly queue: AgentQueueService,
		private readonly stamp: ActivityStampService,
		private readonly fields: FieldsService,
	) {}

	async list(input: ContactListInput): Promise<ListResult<ContactRow>> {
		const filterableFields = await this.fields.filterableFieldsFor("CONTACT");
		const where = this.buildWhere(input, filterableFields);
		const { skip, take } = paginate(input);

		const [rows, total, facetCounts] = await Promise.all([
			this.db.contact.findMany({
				where,
				skip,
				take,
				orderBy: resolveOrderBy(input, SORTABLE, [{ createdAt: "desc" }]),
				select: {
					id: true,
					firstName: true,
					lastName: true,
					email: true,
					title: true,
					imageUrl: true,
					source: true,
					company: { select: COMPANY_SELECT },
					owner: { select: OWNER_SELECT },
					lastActivityAt: true,
					createdAt: true,
					archivedAt: true,
				},
			}),
			this.db.contact.count({ where }),
			this.facetCounts(input, filterableFields),
		]);

		const tableFields = await this.fields.tableValuesFor(
			"CONTACT",
			rows.map((row) => row.id),
		);

		return {
			rows: rows.map((row) => ({
				...row,
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
		const contact = await this.db.contact.findUnique({
			where: { id },
			select: {
				id: true,
				firstName: true,
				lastName: true,
				email: true,
				phone: true,
				title: true,
				linkedinUrl: true,
				twitterUrl: true,
				githubUrl: true,
				imageUrl: true,
				enrichmentStatus: true,
				enrichmentError: true,
				createdAt: true,
				archivedAt: true,
				brief: {
					select: {
						narrative: true,
						sections: true,
						score: true,
						sourceUrl: true,
						refreshedAt: true,
					},
				},
				facts: {
					where: { status: { in: [FactStatus.APPLIED, FactStatus.PROPOSED] } },
					orderBy: { observedAt: "desc" },
					select: {
						id: true,
						field: true,
						value: true,
						score: true,
						band: true,
						evidence: true,
						method: true,
						sourceUrl: true,
						status: true,
						observedAt: true,
					},
				},
				company: {
					select: { ...COMPANY_SELECT, industry: true, primaryContactId: true },
				},
				owner: { select: OWNER_SELECT },
				deals: {
					select: {
						role: true,
						deal: {
							select: {
								id: true,
								name: true,
								stage: true,
								amount: true,
								currency: true,
								expectedCloseDate: true,
								owner: { select: OWNER_SELECT },
							},
						},
					},
				},
			},
		});

		if (!contact) {
			throw new NotFoundException(`No contact with id ${id}.`);
		}

		const relationship = await this.relationship(
			id,
			contact.company?.id ?? null,
		);

		const { deals, createdAt, archivedAt, brief, facts, company, ...rest } =
			contact;

		return {
			...rest,
			company,
			fields: await this.fields.valuesFor("CONTACT", id),
			queued: await this.queue.isQueued({ contactId: id }),
			createdAt: createdAt.toISOString(),
			archivedAt: archivedAt?.toISOString() ?? null,
			brief: brief
				? {
						...brief,
						sections: brief.sections as ContactBriefSections,
						refreshedAt: brief.refreshedAt.toISOString(),
					}
				: null,
			facts: facts.map((fact) => ({
				...fact,
				evidence: fact.evidence as FactEvidence[],
				observedAt: fact.observedAt.toISOString(),
			})),
			relationship,
			isPrimaryContact: company?.primaryContactId === contact.id,
			deals: deals.map(({ role, deal }) => ({
				...deal,
				role,
				amount: undefined,
				amountCents: toCents(deal.amount),
				expectedCloseDate: deal.expectedCloseDate?.toISOString() ?? null,
			})),
		};
	}

	async create(input: ContactCreateInput) {
		const email = normalizeEmail(input.email ?? "");

		if (email) {
			const existing = await this.db.contact.findFirst({
				where: {
					email: { equals: email, mode: "insensitive" },
					archivedAt: null,
				},
				select: { id: true, firstName: true, lastName: true },
			});
			if (existing) {
				throw new ConflictException(
					`${[existing.firstName, existing.lastName].filter(Boolean).join(" ")} already uses ${email}.`,
				);
			}
		}

		const companyId =
			input.companyId ??
			(email
				? await this.companies.companyForEmail(email, {
						ownerId: input.ownerId,
					})
				: null);

		const contact = await this.agent.withCrmEvents(async (tx, emit) => {
			await this.allowAgain(tx, email);

			const created = await tx.contact.create({
				data: {
					firstName: input.firstName.trim(),
					lastName: blankToNull(input.lastName ?? ""),
					email,
					phone: blankToNull(input.phone ?? ""),
					title: blankToNull(input.title ?? ""),
					companyId,
					ownerId: input.ownerId ?? null,
				},
				select: {
					id: true,
					firstName: true,
					lastName: true,
					email: true,
					companyId: true,
					createdAt: true,
				},
			});
			await emit({
				type: "contact.created",
				record: { kind: "contact", id: created.id },
				occurredAt: created.createdAt,
				data: {
					firstName: created.firstName,
					lastName: created.lastName,
					email: created.email,
					companyId: created.companyId,
				},
			});
			return created;
		});

		this.logger.log({ message: "Contact created", contactId: contact.id });

		await this.agent.contactCreated(
			contact.id,
			"Added by a rep, with nothing on the record yet",
		);
		this.fields
			.queueBackfillForNewRecord("CONTACT", contact.id)
			.catch((error: Error) => {
				this.logger.error(
					{
						message: "Contact backfill queueing failed",
						contactId: contact.id,
					},
					error.stack,
				);
			});

		return {
			id: contact.id,
			firstName: contact.firstName,
			lastName: contact.lastName,
		};
	}

	async archive(id: string): Promise<{ id: string; name: string }> {
		try {
			const contact = await this.db.contact.update({
				where: { id },
				data: { archivedAt: new Date() },
				select: { firstName: true, lastName: true },
			});

			this.logger.log({ message: "Contact archived", contactId: id });

			return { id, name: nameOf(contact) };
		} catch (error) {
			throw this.translate(error, id);
		}
	}

	async restore(id: string): Promise<{ id: string; name: string }> {
		try {
			const contact = await this.db.contact.update({
				where: { id },
				data: { archivedAt: null },
				select: { firstName: true, lastName: true },
			});

			this.logger.log({ message: "Contact restored", contactId: id });

			return { id, name: nameOf(contact) };
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
		let deleted: {
			targets: StampTargets;
			name: string;
			suppressed: boolean;
		} | null;

		try {
			deleted = await this.db.$transaction(async (tx) => {
				const [row] = await tx.$queryRaw<Array<{ archivedAt: Date | null }>>`
					SELECT "archivedAt" FROM contact WHERE id = ${id} FOR UPDATE
				`;

				if (!row) {
					if (guard) return null;
					throw new NotFoundException(`No contact with id ${id}.`);
				}
				if (
					guard &&
					(!row.archivedAt || row.archivedAt > guard.archivedBefore)
				) {
					return null;
				}

				const targets = await this.stamp.targetsOf({ contactId: id }, tx);

				await tx.agentTask.deleteMany({ where: { contactId: id } });
				await tx.agentEvent.deleteMany({ where: { contactId: id } });

				const contact = await tx.contact.delete({
					where: { id },
					select: { firstName: true, lastName: true, email: true },
				});

				const name = nameOf(contact);
				const suppress = normalizeEmail(contact.email ?? "");

				if (suppress) {
					await tx.suppressedContact.upsert({
						where: { email: suppress },
						create: {
							email: suppress,
							reason: `Deleted from the CRM (${name})`,
						},
						update: {},
					});
				}

				return { targets, name, suppressed: suppress !== null };
			});
		} catch (error) {
			throw this.translate(error, id);
		}

		if (!deleted) return null;

		await this.stamp.recomputeAfterDelete(deleted.targets, { contactId: id });

		this.logger.log({
			message: "Contact purged",
			contactId: id,
			suppressed: deleted.suppressed,
		});

		return { id, name: deleted.name };
	}

	async purgeExpired(before: Date): Promise<BulkResult> {
		const expired = await this.db.contact.findMany({
			where: { archivedAt: { lte: before } },
			select: { id: true },
			take: ARCHIVE.prune.maxBatch,
		});

		return runBulk(
			expired.map((row) => row.id),
			(id) => this.purge(id, { archivedBefore: before }),
		);
	}

	async update(id: string, input: ContactUpdateInput) {
		const data: Prisma.ContactUpdateInput = {};

		if (input.firstName !== undefined) data.firstName = input.firstName.trim();
		if (input.lastName !== undefined)
			data.lastName = blankToNull(input.lastName);
		const email =
			input.email === undefined ? null : normalizeEmail(input.email);
		if (input.email !== undefined) data.email = email;
		if (input.phone !== undefined) data.phone = blankToNull(input.phone);
		if (input.title !== undefined) data.title = blankToNull(input.title);
		if (input.linkedinUrl !== undefined) {
			data.linkedinUrl = blankToNull(input.linkedinUrl);
		}
		if (input.twitterUrl !== undefined) {
			data.twitterUrl = blankToNull(input.twitterUrl);
		}
		if (input.githubUrl !== undefined) {
			data.githubUrl = blankToNull(input.githubUrl);
		}
		if (input.companyId !== undefined) {
			data.company = input.companyId
				? { connect: { id: input.companyId } }
				: { disconnect: true };
		}
		if (input.ownerId !== undefined) {
			data.owner = input.ownerId
				? { connect: { id: input.ownerId } }
				: { disconnect: true };
		}

		try {
			return await this.db.$transaction(async (tx) => {
				if (input.fields) {
					await this.fields.applyValues(tx, "CONTACT", id, input.fields);
				}

				const updated = await tx.contact.update({
					where: { id },
					data,
					select: { id: true, firstName: true, lastName: true },
				});

				if (email !== null) {
					await this.allowAgain(tx, email);
				}

				return updated;
			});
		} catch (error) {
			throw this.translate(error, id);
		}
	}

	async bulkAssignOwner(input: ContactBulkOwnerInput): Promise<BulkResult> {
		const ownerId = input.ownerId || null;

		await requireOwner(this.db, ownerId);

		const ids = [...new Set(input.ids)];
		const { count } = await this.db.contact.updateMany({
			where: { id: { in: ids } },
			data: { ownerId },
		});

		this.logger.log({
			message: "Contacts reassigned",
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

	async bulkSetCompany(input: ContactBulkCompanyInput): Promise<BulkResult> {
		const companyId = input.companyId || null;

		if (companyId) {
			const company = await this.db.company.findUnique({
				where: { id: companyId },
				select: { id: true },
			});
			if (!company) {
				throw new NotFoundException(`No company with id ${companyId}.`);
			}
		}

		const ids = [...new Set(input.ids)];
		const { count } = await this.db.contact.updateMany({
			where: { id: { in: ids } },
			data: { companyId },
		});

		this.logger.log({
			message: "Contacts moved",
			count,
			companyId,
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

	private async allowAgain(
		tx: Prisma.TransactionClient,
		email: string | null,
	): Promise<void> {
		if (!email) return;
		await tx.suppressedContact.deleteMany({
			where: { email: { equals: email, mode: "insensitive" } },
		});
	}

	private async relationship(contactId: string, companyId: string | null) {
		const now = new Date();

		const [threads, lastReply, meetings, nextMeeting, colleagues] =
			await Promise.all([
				this.db.emailThread.aggregate({
					where: { contactId },
					_sum: { messageCount: true },
					_count: { _all: true },
				}),
				this.db.emailMessage.findFirst({
					where: { thread: { contactId }, direction: "INBOUND" },
					orderBy: { sentAt: "desc" },
					select: { sentAt: true },
				}),
				this.db.calendarEvent.count({
					where: {
						OR: [{ contactId }, { attendees: { some: { contactId } } }],
					},
				}),
				this.db.calendarEvent.findFirst({
					where: {
						startsAt: { gt: now },
						OR: [{ contactId }, { attendees: { some: { contactId } } }],
					},
					orderBy: { startsAt: "asc" },
					select: { title: true, startsAt: true },
				}),
				companyId
					? this.db.contact.findMany({
							where: { companyId, id: { not: contactId } },
							orderBy: { lastActivityAt: { sort: "desc", nulls: "last" } },
							take: 4,
							select: {
								id: true,
								firstName: true,
								lastName: true,
								title: true,
							},
						})
					: Promise.resolve([]),
			]);

		return {
			emails: threads._sum.messageCount ?? 0,
			threads: threads._count._all,
			lastReplyAt: lastReply?.sentAt.toISOString() ?? null,
			meetings,
			nextMeeting: nextMeeting
				? {
						title: nextMeeting.title,
						startsAt: nextMeeting.startsAt.toISOString(),
					}
				: null,
			colleagues: colleagues.map((colleague) => ({
				id: colleague.id,
				name: [colleague.firstName, colleague.lastName]
					.filter(Boolean)
					.join(" "),
				title: colleague.title,
			})),
		};
	}

	async enrich(id: string): Promise<{ id: string; queued: boolean }> {
		const contact = await this.db.contact.findUnique({
			where: { id },
			select: { id: true, imageUrl: true, linkedinUrl: true, updatedAt: true },
		});

		if (!contact) {
			throw new NotFoundException(`No contact with id ${id}.`);
		}

		const queued = await this.agent.contactCreated(
			id,
			contact.linkedinUrl && !contact.imageUrl
				? "A rep asked for a fresh look — they have a LinkedIn profile on file but no picture"
				: "A rep asked for a fresh look",
			true,
		);

		if (queued) {
			await this.db.contact.updateMany({
				where: { id, updatedAt: contact.updatedAt },
				data: { enrichmentStatus: "PENDING", enrichmentError: null },
			});
		}

		return { id, queued };
	}

	async decideFact(
		input: FactDecisionInput,
		userId: string,
	): Promise<{ contactId: string; field: string; applied: boolean }> {
		const fact = await this.db.contactFact.findUnique({
			where: { id: input.factId },
			select: {
				id: true,
				contactId: true,
				field: true,
				value: true,
				status: true,
			},
		});

		if (!fact) {
			throw new NotFoundException(`No fact with id ${input.factId}.`);
		}

		if (fact.status !== FactStatus.PROPOSED) {
			throw new ConflictException("That suggestion has already been settled.");
		}

		const accepted = input.decision === "accept";
		const column = FACT_COLUMNS[fact.field];

		await this.db.$transaction(async (tx) => {
			if (accepted) {
				await tx.contactFact.updateMany({
					where: {
						contactId: fact.contactId,
						field: fact.field,
						id: { not: fact.id },
						status: { in: [FactStatus.APPLIED, FactStatus.PROPOSED] },
					},
					data: { status: FactStatus.SUPERSEDED, supersededAt: new Date() },
				});
			}

			await tx.contactFact.update({
				where: { id: fact.id },
				data: {
					status: accepted ? FactStatus.APPLIED : FactStatus.DISMISSED,
					decidedById: userId,
					decidedAt: new Date(),
				},
			});

			if (accepted && column) {
				await tx.contact.update({
					where: { id: fact.contactId },
					data: { [column]: fact.value },
				});
			}

			if (accepted && fact.field === "name") {
				const [firstName, ...rest] = fact.value.trim().split(/\s+/);
				if (firstName) {
					await tx.contact.update({
						where: { id: fact.contactId },
						data: {
							firstName,
							lastName: rest.length > 0 ? rest.join(" ") : null,
						},
					});
				}
			}
		});

		this.logger.log({
			message: "Fact decided",
			factId: fact.id,
			contactId: fact.contactId,
			field: fact.field,
			decision: input.decision,
		});

		return { contactId: fact.contactId, field: fact.field, applied: accepted };
	}

	private searchFilter(q: string): Prisma.ContactWhereInput {
		const term = q.trim();
		if (!term) return {};

		return {
			OR: [
				{ firstName: { contains: term, mode: "insensitive" } },
				{ lastName: { contains: term, mode: "insensitive" } },
				{ email: { contains: term, mode: "insensitive" } },
				{ company: { name: { contains: term, mode: "insensitive" } } },
			],
		};
	}

	private companyFilter(
		values: string[],
	): Prisma.ContactWhereInput | undefined {
		if (values.length === 0) return undefined;

		const { ids, includesSentinel } = splitSentinel(values, NO_COMPANY);
		if (includesSentinel && ids.length === 0) return { companyId: null };
		if (!includesSentinel) return { companyId: { in: ids } };
		return { OR: [{ companyId: { in: ids } }, { companyId: null }] };
	}

	private buildWhere(
		input: ContactListInput,
		filterableFields: FieldDefinitionWithOptions[],
	): Prisma.ContactWhereInput {
		const and: Prisma.ContactWhereInput[] = [
			this.searchFilter(input.q),
			archivedFilter(input.archived),
			...this.fields.fieldFilters(filterableFields, input.fields),
		];

		const owner = ownerFilter<Prisma.ContactWhereInput>(input.owner);
		if (owner) and.push(owner);

		const company = this.companyFilter(input.company);
		if (company) and.push(company);

		if (input.source.length > 0) {
			and.push({ source: { in: input.source as RecordSource[] } });
		}
		if (input.title.length > 0) and.push({ title: { in: input.title } });
		if (input.seniority.length > 0) {
			and.push({ seniority: { in: input.seniority } });
		}
		if (input.persona.length > 0) and.push({ function: { in: input.persona } });

		const activity = activityFilter(input.activity);
		if (activity) and.push(activity);

		return { AND: and };
	}

	private async facetCounts(
		input: ContactListInput,
		filterableFields: FieldDefinitionWithOptions[],
	) {
		const where = {
			AND: [this.searchFilter(input.q), archivedFilter(input.archived)],
		};

		const [
			owners,
			companies,
			sources,
			titles,
			seniorities,
			personas,
			activity,
			fieldFacets,
		] = await Promise.all([
			this.db.contact.groupBy({
				by: ["ownerId"],
				where,
				_count: { _all: true },
			}),
			this.db.contact.groupBy({
				by: ["companyId"],
				where,
				_count: { _all: true },
			}),
			this.db.contact.groupBy({
				by: ["source"],
				where,
				_count: { _all: true },
			}),
			this.db.contact.groupBy({
				by: ["title"],
				where,
				_count: { _all: true },
			}),
			this.db.contact.groupBy({
				by: ["seniority"],
				where,
				_count: { _all: true },
			}),
			this.db.contact.groupBy({
				by: ["function"],
				where,
				_count: { _all: true },
			}),
			activityFacetCounts((activityWhere) =>
				this.db.contact.count({ where: { AND: [where, activityWhere] } }),
			),
			this.fields.filterFacetCounts("CONTACT", where, filterableFields),
		]);

		return {
			owner: countsByKey(owners, "ownerId", FACET_UNASSIGNED),
			company: countsByKey(companies, "companyId", NO_COMPANY),
			source: countsByKey(sources, "source"),
			title: countsByKey(titles, "title"),
			seniority: countsByKey(seniorities, "seniority"),
			persona: countsByKey(personas, "function"),
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
				throw new NotFoundException(`No contact with id ${id}.`);
			}
			if (cause.code === "P2002") {
				throw new ConflictException(
					"Another contact already uses that email address.",
				);
			}
		}
		throw cause;
	}
}

function nameOf(contact: {
	firstName: string;
	lastName: string | null;
}): string {
	return [contact.firstName, contact.lastName].filter(Boolean).join(" ");
}
