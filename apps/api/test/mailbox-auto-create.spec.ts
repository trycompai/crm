import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import {
	db,
	type MailboxSyncModel as MailboxSync,
	RecordSource,
} from "@crm/db";
import type { AgentTriggerService } from "../src/agent/agent-trigger.service";
import { CompanyDirectoryService } from "../src/companies/company-directory.service";
import { ActivityStampService } from "../src/crm/activity-stamp.service";
import { EnrichmentLogService } from "../src/crm/enrichment-log.service";
import { MailboxMatchService } from "../src/mailbox/mailbox-match.service";
import {
	type IncomingMessage,
	ThreadWriterService,
} from "../src/mailbox/thread-writer.service";
import { withDiscardedCrmEvents } from "./agent-trigger.stub";

const suffix = process.env.TEST_RUN_ID ?? "auto-create-spec";
const workDomain = `auto-${suffix}.test`;
const freeDomain = "gmail.com";
const userId = `user-auto-${suffix}`;
const mailbox = `rep-auto-${suffix}@example.test`;
const person = `buyer@${workDomain}`;
const newsletter = `news@${workDomain}`;
const noreply = `noreply@${workDomain}`;
const freePerson = `someone@${freeDomain}`;
const rootNewsletter = `<newsletter-${suffix}@mail.test>`;
const rootOutbound = `<outbound-${suffix}@mail.test>`;
const rootInboundReply = `<inbound-reply-${suffix}@mail.test>`;
const rootKnown = `<known-${suffix}@mail.test>`;

const agent = {
	contactCreated: async () => undefined,
	companyCreated: async () => undefined,
	withCrmEvents: withDiscardedCrmEvents,
	companyRequested: async () => undefined,
} as unknown as AgentTriggerService;

const stamp = new ActivityStampService(db);
const directory = new CompanyDirectoryService(agent);
const log = new EnrichmentLogService(db, stamp);
const match = new MailboxMatchService(db, directory, agent, log);
const threads = new ThreadWriterService(db, match, stamp);

let gmailOff: MailboxSync;
let gmailOn: MailboxSync;

function outboundMessage(
	rootId: string,
	rfcMessageId: string,
	to = person,
	name: string | null = "A Buyer",
): IncomingMessage {
	return {
		rfcMessageId,
		rootId,
		subject: "Pricing",
		from: { email: mailbox, name: "Test Rep" },
		recipients: [{ email: to, name, kind: "to" }],
		body: "The numbers you asked for.",
		sentAt: new Date("2026-03-01T10:00:00Z"),
		gmailMessageId: null,
		outlookMessageId: null,
		outlookWebLink: null,
	};
}

function inboundMessage(
	rootId: string,
	rfcMessageId: string,
	from = newsletter,
	name: string | null = "Weekly Digest",
): IncomingMessage {
	return {
		rfcMessageId,
		rootId,
		subject: "This week at Acme",
		from: { email: from, name },
		recipients: [{ email: mailbox, name: "Test Rep", kind: "to" }],
		body: "Unsubscribe below. Big sale on widgets.",
		sentAt: new Date("2026-03-01T11:00:00Z"),
		gmailMessageId: null,
		outlookMessageId: null,
		outlookWebLink: null,
	};
}

async function matchContext() {
	const [internal, suppressedDomains, suppressedEmails] = await Promise.all([
		match.internalIdentity(),
		match.suppressedDomains(),
		match.suppressedEmails(),
	]);
	return {
		ourAddresses: internal.addresses,
		ourDomains: internal.domains,
		suppressedDomains,
		suppressedEmails,
	};
}

async function clean() {
	await db.emailThread.deleteMany({
		where: {
			rootMessageId: {
				in: [
					rootNewsletter,
					rootOutbound,
					rootInboundReply,
					rootKnown,
				],
			},
		},
	});
	await db.contact.deleteMany({
		where: {
			email: {
				in: [person, newsletter, noreply, freePerson, `second@${workDomain}`],
			},
		},
	});
	await db.company.deleteMany({ where: { domain: workDomain } });
	await db.suppressedDomain.deleteMany({ where: { domain: workDomain } });
	await db.mailboxSync.deleteMany({ where: { userId } });
	await db.user.deleteMany({ where: { id: userId } });
}

beforeAll(async () => {
	await clean();

	await db.user.create({
		data: { id: userId, name: "Test Rep", email: mailbox },
	});
	gmailOff = await db.mailboxSync.create({
		data: { userId, source: "gmail", autoCreate: false },
	});
	gmailOn = await db.mailboxSync.create({
		data: {
			userId,
			source: "outlook",
			autoCreate: true,
		},
	});
});

afterAll(clean);

describe("auto-create: two-way engagement (Gmail)", () => {
	it("does not create a company from an inbound-only newsletter, even with autoCreate on", async () => {
		const stored = await threads.store(
			gmailOn,
			{ mailbox, origin: "gmail" },
			inboundMessage(
				rootNewsletter,
				`<news-msg-${suffix}@mail.test>`,
				newsletter,
			),
			await threads.context(),
		);

		expect(stored).toBe(false);
		expect(await db.company.count({ where: { domain: workDomain } })).toBe(0);
		expect(await db.contact.count({ where: { email: newsletter } })).toBe(0);
		expect(
			await db.emailThread.count({ where: { rootMessageId: rootNewsletter } }),
		).toBe(0);
	});

	it("creates company and contact with source EMAIL when the rep sends and autoCreate is on", async () => {
		const stored = await threads.store(
			gmailOn,
			{ mailbox, origin: "gmail" },
			outboundMessage(
				rootOutbound,
				`<out-msg-${suffix}@mail.test>`,
				person,
				"A Buyer",
			),
			await threads.context(),
		);

		expect(stored).toBe(true);

		const company = await db.company.findUnique({
			where: { domain: workDomain },
			select: { id: true, source: true },
		});
		const contact = await db.contact.findUnique({
			where: { email: person },
			select: { id: true, source: true, companyId: true, firstName: true },
		});

		expect(company?.source).toBe(RecordSource.EMAIL);
		expect(contact?.source).toBe(RecordSource.EMAIL);
		expect(contact?.companyId).toBe(company?.id ?? null);
		expect(contact?.firstName).toBe("A");

		const thread = await db.emailThread.findUnique({
			where: { rootMessageId: rootOutbound },
			select: {
				companyId: true,
				contactId: true,
				activity: { select: { id: true, type: true } },
			},
		});
		expect(thread?.companyId).toBe(company?.id ?? null);
		expect(thread?.contactId).toBe(contact?.id ?? null);
		expect(thread?.activity).not.toBeNull();
	});

	it("does not create a company when autoCreate is off, even if the rep sent the mail", async () => {
		const unknownDomain = `off-${suffix}.test`;
		const unknownPerson = `lead@${unknownDomain}`;
		const root = `<off-${suffix}@mail.test>`;

		try {
			const stored = await threads.store(
				gmailOff,
				{ mailbox, origin: "gmail" },
				outboundMessage(
					root,
					`<off-msg-${suffix}@mail.test>`,
					unknownPerson,
					"Lead Name",
				),
				await threads.context(),
			);

			expect(stored).toBe(false);
			expect(await db.company.count({ where: { domain: unknownDomain } })).toBe(
				0,
			);
			expect(await db.contact.count({ where: { email: unknownPerson } })).toBe(
				0,
			);
		} finally {
			await db.emailThread.deleteMany({ where: { rootMessageId: root } });
			await db.contact.deleteMany({ where: { email: unknownPerson } });
			await db.company.deleteMany({ where: { domain: unknownDomain } });
		}
	});

	it("still attaches to an existing company when autoCreate is off", async () => {
		const knownDomain = `known-${suffix}.test`;
		const knownPerson = `known@${knownDomain}`;
		const root = rootKnown;

		const company = await db.company.create({
			data: {
				name: "Known Co",
				domain: knownDomain,
				source: RecordSource.MANUAL,
			},
			select: { id: true },
		});
		await db.contact.create({
			data: {
				firstName: "Known",
				lastName: "Buyer",
				email: knownPerson,
				companyId: company.id,
				source: RecordSource.MANUAL,
			},
		});

		try {
			const stored = await threads.store(
				gmailOff,
				{ mailbox, origin: "gmail" },
				outboundMessage(
					root,
					`<known-msg-${suffix}@mail.test>`,
					knownPerson,
					"Known Buyer",
				),
				await threads.context(),
			);

			expect(stored).toBe(true);

			const thread = await db.emailThread.findUnique({
				where: { rootMessageId: root },
				select: { companyId: true },
			});
			expect(thread?.companyId).toBe(company.id);

			const after = await db.company.findUnique({
				where: { id: company.id },
				select: { source: true },
			});
			expect(after?.source).toBe(RecordSource.MANUAL);
		} finally {
			await db.emailThread.deleteMany({ where: { rootMessageId: root } });
			await db.contact.deleteMany({ where: { email: knownPerson } });
			await db.company.deleteMany({ where: { id: company.id } });
		}
	});

	it("creates on a later inbound only after the rep has already sent in the thread", async () => {
		const domain = `reply-${suffix}.test`;
		const lead = `lead@${domain}`;
		const root = rootInboundReply;

		try {
			const first = await threads.store(
				gmailOn,
				{ mailbox, origin: "gmail" },
				outboundMessage(
					root,
					`<reply-out-${suffix}@mail.test>`,
					lead,
					"Reply Lead",
				),
				await threads.context(),
			);
			expect(first).toBe(true);

			const company = await db.company.findUnique({
				where: { domain },
				select: { id: true, source: true },
			});
			expect(company?.source).toBe(RecordSource.EMAIL);

			const second = await threads.store(
				gmailOn,
				{ mailbox, origin: "gmail" },
				inboundMessage(
					root,
					`<reply-in-${suffix}@mail.test>`,
					lead,
					"Reply Lead",
				),
				await threads.context(),
			);
			expect(second).toBe(true);

			const thread = await db.emailThread.findUnique({
				where: { rootMessageId: root },
				select: { messageCount: true, companyId: true },
			});
			expect(thread?.messageCount).toBe(2);
			expect(thread?.companyId).toBe(company?.id ?? null);
		} finally {
			await db.emailThread.deleteMany({ where: { rootMessageId: root } });
			await db.contact.deleteMany({ where: { email: lead } });
			await db.company.deleteMany({ where: { domain } });
		}
	});
});

describe("auto-create: match rules and provenance", () => {
	it("stamps source CALENDAR when allowCreate is true for a new work domain", async () => {
		const domain = `cal-${suffix}.test`;
		const email = `attendee@${domain}`;

		try {
			const result = await match.resolve(
				{
					participants: [
						{ email: mailbox, name: "Test Rep" },
						{ email, name: "Cal Attendee" },
					],
					allowCreate: true,
					source: RecordSource.CALENDAR,
					ownerId: userId,
				},
				await matchContext(),
			);

			expect(result.companyId).not.toBeNull();
			expect(result.contactId).not.toBeNull();

			const company = await db.company.findUnique({
				where: { id: result.companyId! },
				select: { domain: true, source: true },
			});
			const contact = await db.contact.findUnique({
				where: { id: result.contactId! },
				select: { email: true, source: true, firstName: true, lastName: true },
			});

			expect(company).toEqual({
				domain,
				source: RecordSource.CALENDAR,
			});
			expect(contact?.email).toBe(email);
			expect(contact?.source).toBe(RecordSource.CALENDAR);
			expect(contact?.firstName).toBe("Cal");
			expect(contact?.lastName).toBe("Attendee");
		} finally {
			await db.contact.deleteMany({ where: { email } });
			await db.company.deleteMany({ where: { domain } });
		}
	});

	it("creates nothing when allowCreate is false for an unknown domain", async () => {
		const domain = `deny-${suffix}.test`;
		const email = `ghost@${domain}`;

		const result = await match.resolve(
			{
				participants: [{ email, name: "Ghost" }],
				allowCreate: false,
				source: RecordSource.CALENDAR,
				ownerId: userId,
			},
			await matchContext(),
		);

		expect(result.companyId).toBeNull();
		expect(result.contactId).toBeNull();
		expect(await db.company.count({ where: { domain } })).toBe(0);
	});

	it("creates nothing for a free-host address even when allowCreate is true", async () => {
		const result = await match.resolve(
			{
				participants: [{ email: freePerson, name: "Free Mail" }],
				allowCreate: true,
				source: RecordSource.EMAIL,
				ownerId: userId,
			},
			await matchContext(),
		);

		expect(result.external).toEqual([]);
		expect(result.companyId).toBeNull();
		expect(result.contactId).toBeNull();
	});

	it("creates nothing for a no-reply address even when allowCreate is true", async () => {
		const result = await match.resolve(
			{
				participants: [{ email: noreply, name: "No Reply" }],
				allowCreate: true,
				source: RecordSource.EMAIL,
				ownerId: userId,
			},
			await matchContext(),
		);

		expect(result.external).toEqual([]);
		expect(result.companyId).toBeNull();
		expect(await db.company.count({ where: { domain: workDomain } })).toBe(1);
	});

	it("creates nothing for a suppressed domain even when allowCreate is true", async () => {
		const domain = `suppressed-${suffix}.test`;
		const email = `person@${domain}`;

		await db.suppressedDomain.create({
			data: { domain, reason: "vendor" },
		});

		try {
			const result = await match.resolve(
				{
					participants: [{ email, name: "Vendor" }],
					allowCreate: true,
					source: RecordSource.CALENDAR,
					ownerId: userId,
				},
				await matchContext(),
			);

			expect(result.external).toEqual([]);
			expect(result.companyId).toBeNull();
			expect(await db.company.count({ where: { domain } })).toBe(0);
		} finally {
			await db.suppressedDomain.deleteMany({ where: { domain } });
			await db.contact.deleteMany({ where: { email } });
			await db.company.deleteMany({ where: { domain } });
		}
	});

	it("adds a contact on an existing company with provenance when allowCreate is true", async () => {
		const domain = `exist-${suffix}.test`;
		const email = `newhire@${domain}`;

		const company = await db.company.create({
			data: {
				name: "Existing Co",
				domain,
				source: RecordSource.MANUAL,
			},
			select: { id: true },
		});

		try {
			const result = await match.resolve(
				{
					participants: [{ email, name: "New Hire" }],
					allowCreate: true,
					source: RecordSource.EMAIL,
					ownerId: userId,
				},
				await matchContext(),
			);

			expect(result.companyId).toBe(company.id);
			expect(result.contactId).not.toBeNull();

			const contact = await db.contact.findUnique({
				where: { id: result.contactId! },
				select: { source: true, companyId: true },
			});
			expect(contact).toEqual({
				source: RecordSource.EMAIL,
				companyId: company.id,
			});

			const after = await db.company.findUnique({
				where: { id: company.id },
				select: { source: true },
			});
			expect(after?.source).toBe(RecordSource.MANUAL);
		} finally {
			await db.contact.deleteMany({ where: { email } });
			await db.company.deleteMany({ where: { id: company.id } });
		}
	});
});

describe("auto-create: calendar engagement gate", () => {
	it("treats declined-by-us as no create (allowCreate false)", async () => {
		const domain = `declined-${suffix}.test`;
		const email = `guest@${domain}`;
		const declinedByUs = true;
		const autoCreate = true;
		const allowCreate = autoCreate && !declinedByUs;

		const result = await match.resolve(
			{
				participants: [{ email, name: "Guest" }],
				allowCreate,
				source: RecordSource.CALENDAR,
				ownerId: userId,
			},
			await matchContext(),
		);

		expect(allowCreate).toBe(false);
		expect(result.companyId).toBeNull();
		expect(await db.company.count({ where: { domain } })).toBe(0);
	});

	it("allows create when the rep has not declined", async () => {
		const domain = `accepted-${suffix}.test`;
		const email = `guest@${domain}`;
		const declinedByUs = false;
		const autoCreate = true;
		const allowCreate = autoCreate && !declinedByUs;

		try {
			const result = await match.resolve(
				{
					participants: [{ email, name: "Guest Person" }],
					allowCreate,
					source: RecordSource.CALENDAR,
					ownerId: userId,
				},
				await matchContext(),
			);

			expect(allowCreate).toBe(true);
			expect(result.companyId).not.toBeNull();

			const company = await db.company.findUnique({
				where: { id: result.companyId! },
				select: { source: true, domain: true },
			});
			expect(company).toEqual({
				domain,
				source: RecordSource.CALENDAR,
			});
		} finally {
			await db.contact.deleteMany({ where: { email } });
			await db.company.deleteMany({ where: { domain } });
		}
	});
});
