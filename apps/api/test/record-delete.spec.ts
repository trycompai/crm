import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { db, RecordSource } from "@crm/db";
import { AgentQueueService } from "../src/agent/agent-queue.service";
import { AgentTriggerService } from "../src/agent/agent-trigger.service";
import { CompaniesService } from "../src/companies/companies.service";
import { CompanyDirectoryService } from "../src/companies/company-directory.service";
import { FaviconService } from "../src/companies/favicon.service";
import { ContactsService } from "../src/contacts/contacts.service";
import { ActivityStampService } from "../src/crm/activity-stamp.service";
import { EnrichmentLogService } from "../src/crm/enrichment-log.service";
import { ConversionService } from "../src/currency/conversion.service";
import { FieldsService } from "../src/fields/fields.service";
import { MailboxMatchService } from "../src/mailbox/mailbox-match.service";
import { withDiscardedCrmEvents } from "./agent-trigger.stub";

const suffix = process.env.TEST_RUN_ID ?? "record-delete-spec";
const domain = `delete-${suffix}.test`;
const doomedDomain = `doomed-${suffix}.test`;
const stampDomain = `stamped-${suffix}.test`;
const orphanDomain = `orphaned-${suffix}.test`;
const email = `gone@${domain}`;
const colleague = `stays@${domain}`;
const userId = `user-${suffix}`;

const stamp = new ActivityStampService(db);

const agent = {
	contactCreated: async () => undefined,
	companyCreated: async () => undefined,
	withCrmEvents: withDiscardedCrmEvents,
	companyRequested: async () => undefined,
} as unknown as AgentTriggerService;

const directory = new CompanyDirectoryService(agent);
const log = new EnrichmentLogService(db, stamp);
const queue = new AgentQueueService(db);
const conversion = new ConversionService(db);

const fields = new FieldsService(db, agent);
const contacts = new ContactsService(
	db,
	directory,
	agent,
	queue,
	stamp,
	fields,
);
const companies = new CompaniesService(
	db,
	agent,
	queue,
	{ backfill: async () => undefined } as unknown as FaviconService,
	stamp,
	conversion,
	fields,
);
const match = new MailboxMatchService(db, directory, agent, log);

async function matchContext() {
	const internal = await match.internalIdentity();
	return {
		ourAddresses: internal.addresses,
		ourDomains: internal.domains,
		suppressedDomains: await match.suppressedDomains(),
		suppressedEmails: await match.suppressedEmails(),
	};
}

const domains = [domain, doomedDomain, stampDomain, orphanDomain];
const ours = {
	OR: domains.map((host) => ({ email: { endsWith: `@${host}` } })),
};

async function parked(subject: { contactId?: string; companyId?: string }) {
	return db.agentTask.create({
		data: {
			...subject,
			kind: "identify",
			reason: `record-delete-spec (${suffix})`,
			dueAt: new Date(Date.now() + 60 * 60 * 1000),
		},
		select: { id: true },
	});
}

async function clean() {
	const [existingContacts, existingCompanies] = await Promise.all([
		db.contact.findMany({ where: ours, select: { id: true } }),
		db.company.findMany({
			where: { domain: { in: domains } },
			select: { id: true },
		}),
	]);

	const contactIds = existingContacts.map((row) => row.id);
	const companyIds = existingCompanies.map((row) => row.id);

	await db.agentTask.deleteMany({
		where: {
			OR: [
				{ reason: `record-delete-spec (${suffix})` },
				{ contactId: { in: contactIds } },
				{ companyId: { in: companyIds } },
			],
		},
	});
	await db.agentEvent.deleteMany({ where: { contactId: { in: contactIds } } });
	await db.contact.deleteMany({ where: ours });
	await db.company.deleteMany({ where: { domain: { in: domains } } });
	await db.suppressedContact.deleteMany({ where: ours });
	await db.user.deleteMany({ where: { id: userId } });
}

beforeAll(async () => {
	await clean();
	await db.user.create({
		data: { id: userId, name: "Test Rep", email: `${userId}@example.test` },
	});
});

afterAll(clean);

describe("deleting a contact", () => {
	let contactId: string;

	it("takes the record, its queued research and its transcript with it", async () => {
		const created = await contacts.create({
			firstName: "Gone",
			lastName: "Person",
			email,
			ownerId: userId,
		});
		contactId = created.id;

		await parked({ contactId });

		await db.agentEvent.create({
			data: {
				id: `evt-${suffix}`,
				sessionId: `ses-${suffix}`,
				contactId,
				type: "session.started",
				data: {},
				emittedAt: new Date(),
			},
		});

		expect(await contacts.delete(contactId)).toEqual({
			id: contactId,
			name: "Gone Person",
		});

		expect(
			await db.contact.findUnique({ where: { id: contactId } }),
		).toBeNull();
		expect(await db.agentTask.count({ where: { contactId } })).toBe(0);
		expect(await db.agentEvent.count({ where: { contactId } })).toBe(0);
	});

	it("remembers the address so the sync cannot bring them back", async () => {
		const suppressed = await db.suppressedContact.findUnique({
			where: { email },
		});
		expect(suppressed).not.toBeNull();

		const result = await match.resolve(
			{
				participants: [{ email, name: "Gone Person" }],
				allowCreate: true,
				source: RecordSource.EMAIL,
				ownerId: userId,
			},
			await matchContext(),
		);

		expect(result.external).toEqual([]);
		expect(result.contactId).toBeNull();
		expect(await db.contact.findFirst({ where: { email } })).toBeNull();
	});

	it("still files the colleagues who were not deleted", async () => {
		const result = await match.resolve(
			{
				participants: [
					{ email, name: "Gone Person" },
					{ email: colleague, name: "Stays Here" },
				],
				allowCreate: true,
				source: RecordSource.EMAIL,
				ownerId: userId,
			},
			await matchContext(),
		);

		expect(result.external.map((person) => person.email)).toEqual([colleague]);

		const created = await db.contact.findFirst({ where: { email: colleague } });
		expect(created?.id).toBe(result.contactId ?? undefined);
	});

	it("lets a rep add them back by hand, which lifts the suppression", async () => {
		const readded = await contacts.create({ firstName: "Gone", email });

		expect(
			await db.suppressedContact.findUnique({ where: { email } }),
		).toBeNull();

		await db.contact.delete({ where: { id: readded.id } });
		await db.suppressedContact.deleteMany({ where: { email } });
	});

	it("suppresses an address a rep typed in caps as the sync will see it", async () => {
		const typed = `Mixed.Case@${domain.toUpperCase()}`;
		const asSynced = typed.toLowerCase();

		const created = await contacts.create({ firstName: "Mixed", email: typed });

		expect(
			await db.contact.findUnique({
				where: { id: created.id },
				select: { email: true },
			}),
		).toEqual({ email: asSynced });

		await contacts.delete(created.id);

		expect(
			await db.suppressedContact.findUnique({ where: { email: asSynced } }),
		).not.toBeNull();

		const result = await match.resolve(
			{
				participants: [{ email: asSynced, name: "Mixed Case" }],
				allowCreate: true,
				source: RecordSource.EMAIL,
				ownerId: userId,
			},
			await matchContext(),
		);

		expect(result.external).toEqual([]);
		expect(
			await db.contact.findFirst({ where: { email: asSynced } }),
		).toBeNull();
	});
});

describe("deleting a company", () => {
	it("takes its deals and leaves its people without a company", async () => {
		const company = await companies.create({
			name: "Doomed",
			domain: doomedDomain,
		});
		const contact = await contacts.create({
			firstName: "Left",
			lastName: "Behind",
			email: `left@${doomedDomain}`,
			companyId: company.id,
		});
		const deal = await db.deal.create({
			data: { name: "Doomed deal", companyId: company.id, ownerId: userId },
			select: { id: true },
		});

		await parked({ companyId: company.id });

		expect(await companies.delete(company.id)).toEqual({
			id: company.id,
			name: "Doomed",
		});

		expect(await db.deal.findUnique({ where: { id: deal.id } })).toBeNull();
		expect(await db.agentTask.count({ where: { companyId: company.id } })).toBe(
			0,
		);

		const survivor = await db.contact.findUnique({
			where: { id: contact.id },
			select: { companyId: true },
		});
		expect(survivor?.companyId).toBeNull();

		await db.contact.delete({ where: { id: contact.id } });
	});
});

describe("the activity stamps a delete leaves behind", () => {
	it("are recomputed on every record the deleted one's activities touched", async () => {
		const company = await companies.create({
			name: "Stamped",
			domain: stampDomain,
		});
		const contact = await contacts.create({
			firstName: "Stamped",
			email: `stamped@${stampDomain}`,
			companyId: company.id,
		});
		const deal = await db.deal.create({
			data: { name: "Stamped deal", companyId: company.id, ownerId: userId },
			select: { id: true },
		});

		const at = new Date();
		await db.activity.create({
			data: {
				type: "NOTE",
				subject: "The only thing on this account",
				companyId: company.id,
				contactId: contact.id,
				dealId: deal.id,
				createdById: userId,
				createdAt: at,
			},
		});
		await stamp.touch(
			{ companyId: company.id, contactId: contact.id, dealId: deal.id },
			at,
		);

		await contacts.delete(contact.id);

		expect(
			await db.company.findUnique({
				where: { id: company.id },
				select: { lastActivityAt: true },
			}),
		).toEqual({ lastActivityAt: null });
		expect(
			await db.deal.findUnique({
				where: { id: deal.id },
				select: { lastActivityAt: true },
			}),
		).toEqual({ lastActivityAt: null });
	});

	it("follow a deleted company through the deals it takes with it", async () => {
		const company = await companies.create({
			name: "Orphaner",
			domain: orphanDomain,
		});
		const contact = await contacts.create({
			firstName: "Orphaned",
			email: `orphaned@${orphanDomain}`,
			companyId: company.id,
		});
		const deal = await db.deal.create({
			data: { name: "Orphaned deal", companyId: company.id, ownerId: userId },
			select: { id: true },
		});

		const at = new Date();
		await db.activity.create({
			data: {
				type: "MEETING",
				subject: "Only ever attached to the deal",
				contactId: contact.id,
				dealId: deal.id,
				createdById: userId,
				createdAt: at,
			},
		});
		await stamp.touch({ contactId: contact.id, dealId: deal.id }, at);

		await companies.delete(company.id);

		expect(
			await db.contact.findUnique({
				where: { id: contact.id },
				select: { companyId: true, lastActivityAt: true },
			}),
		).toEqual({ companyId: null, lastActivityAt: null });

		await db.contact.delete({ where: { id: contact.id } });
	});
});
