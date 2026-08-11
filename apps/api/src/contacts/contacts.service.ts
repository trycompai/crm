import {
	type ContactBriefSections,
	type Db,
	type FactEvidence,
	FactStatus,
	type Prisma,
	Prisma as PrismaNamespace,
	type RecordSource,
} from "@crm/db";
import {
	ConflictException,
	Injectable,
	Logger,
	NotFoundException,
} from "@nestjs/common";
import { AgentQueueService } from "../agent/agent-queue.service";
import { AgentTriggerService } from "../agent/agent-trigger.service";
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
	countsByKey,
	FACET_ALL,
	FACET_UNASSIGNED,
	type ListResult,
	ownerFilter,
	paginate,
	resolveOrderBy,
} from "../trpc/list-input";
import type {
	ContactBulkCompanyInput,
	ContactBulkOwnerInput,
	ContactCreateInput,
	ContactListInput,
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

const FACT_COLUMNS: Record<string, string | undefined> = {
	title: "title",
	linkedinUrl: "linkedinUrl",
	twitterUrl: "twitterUrl",
	githubUrl: "githubUrl",
};

export type ContactRow = {
	id: string;
	firstName: string;
	lastName: string | null;
	email: string | null;
	title: string | null;
	imageUrl: string | null;
	company: {
		id: string;
		name: string;
		domain: string | null;
		iconUrl: string | null;
		iconDarkUrl: string | null;
		iconTone: string | null;
		logoUrl: string | null;
	} | null;
	owner: {
		id: string;
		name: string;
		email: string;
		image: string | null;
	} | null;
	lastActivityAt: string | null;
	createdAt: string;
	fields: Record<string, string | number | boolean | null>;
};

const SORTABLE: Record<
	string,
	(dir: Prisma.SortOrder) => Prisma.ContactOrderByWithRelationInput[]
> = {
	name: (dir) => [{ lastName: dir }, { firstName: dir }],
	email: (dir) => [{ email: dir }],
	title: (dir) => [{ title: dir }, { lastName: "asc" }],
	company: (dir) => [{ company: { name: dir } }, { lastName: "asc" }],
	createdAt: (dir) => [{ createdAt: dir }],
	owner: (dir) => [{ owner: { name: dir } }, { lastName: "asc" }],
	lastActivity: (dir) => [{ lastActivityAt: { sort: dir, nulls: "last" } }],
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
		const where = this.buildWhere(input);
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
				},
			}),
			this.db.contact.count({ where }),
			this.facetCounts(input),
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

		const { deals, createdAt, brief, facts, company, ...rest } = contact;

		return {
			...rest,
			company,
			fields: await this.fields.valuesFor("CONTACT", id),
			queued: await this.queue.isQueued({ contactId: id }),
			createdAt: createdAt.toISOString(),
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
				where: { email: { equals: email, mode: "insensitive" } },
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

		return {
			id: contact.id,
			firstName: contact.firstName,
			lastName: contact.lastName,
		};
	}

	async delete(id: string): Promise<{ id: string; name: string }> {
		let deleted: {
			targets: StampTargets;
			name: string;
			suppressed: boolean;
		};

		try {
			deleted = await this.db.$transaction(async (tx) => {
				const targets = await this.stamp.targetsOf({ contactId: id }, tx);

				await tx.agentTask.deleteMany({ where: { contactId: id } });
				await tx.agentEvent.deleteMany({ where: { contactId: id } });

				const contact = await tx.contact.delete({
					where: { id },
					select: { firstName: true, lastName: true, email: true },
				});

				const name = [contact.firstName, contact.lastName]
					.filter(Boolean)
					.join(" ");
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

		await this.stamp.recomputeAfterDelete(deleted.targets, { contactId: id });

		this.logger.log({
			message: "Contact deleted",
			contactId: id,
			suppressed: deleted.suppressed,
		});

		return { id, name: deleted.name };
	}

	async update(id: string, input: ContactUpdateInput) {
		const data: Prisma.ContactUpdateInput = {};

		if (input.firstName !== undefined) data.firstName = input.firstName.trim();
		if (input.lastName !== undefined)
			data.lastName = blankToNull(input.lastName);
		if (input.email !== undefined) data.email = normalizeEmail(input.email);
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

				if (typeof data.email === "string") {
					await this.allowAgain(tx, data.email);
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
			failed: ids.length - count,
			message: null,
		};
	}

	async bulkEnrich(ids: string[]): Promise<BulkResult> {
		return runBulk(ids, (id) => this.enrich(id));
	}

	async bulkDelete(ids: string[]): Promise<BulkResult> {
		return runBulk(ids, (id) => this.delete(id));
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

	async enrich(id: string): Promise<{ id: string; queued: true }> {
		const contact = await this.db.contact.findUnique({
			where: { id },
			select: { id: true, imageUrl: true, linkedinUrl: true },
		});

		if (!contact) {
			throw new NotFoundException(`No contact with id ${id}.`);
		}

		await this.db.contact.update({
			where: { id },
			data: { enrichmentStatus: "PENDING", enrichmentError: null },
		});

		await this.agent.contactCreated(
			id,
			contact.linkedinUrl && !contact.imageUrl
				? "A rep asked for a fresh look — they have a LinkedIn profile on file but no picture"
				: "A rep asked for a fresh look",
		);

		return { id, queued: true };
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

	private buildWhere(input: ContactListInput): Prisma.ContactWhereInput {
		const where: Prisma.ContactWhereInput = {
			...this.searchFilter(input.q),
			...ownerFilter(input.owner),
		};

		if (input.company !== FACET_ALL) {
			where.companyId = input.company === NO_COMPANY ? null : input.company;
		}

		if (input.source !== FACET_ALL) {
			where.source = input.source as RecordSource;
		}

		return where;
	}

	private async facetCounts(input: ContactListInput) {
		const where = this.searchFilter(input.q);

		const [owners, companies, sources] = await Promise.all([
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
		]);

		return {
			owner: countsByKey(owners, "ownerId", FACET_UNASSIGNED),
			company: countsByKey(companies, "companyId", NO_COMPANY),
			source: countsByKey(sources, "source"),
		};
	}

	private translate(error: unknown, id: string): unknown {
		if (error instanceof PrismaNamespace.PrismaClientKnownRequestError) {
			if (error.code === "P2025") {
				return new NotFoundException(`No contact with id ${id}.`);
			}
			if (error.code === "P2002") {
				return new ConflictException(
					"Another contact already uses that email address.",
				);
			}
		}
		return error;
	}
}
