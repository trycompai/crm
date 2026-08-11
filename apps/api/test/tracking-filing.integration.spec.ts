import {
	afterAll,
	beforeAll,
	beforeEach,
	describe,
	expect,
	it,
} from "bun:test";
import { db } from "@crm/db";
import {
	CONTACT_CAP_REASON,
	CONTACTS_PER_HOUR,
	contactWindowKey,
} from "@crm/db/tracking";
import type { AgentTriggerService } from "../src/agent/agent-trigger.service";
import { CompanyDirectoryService } from "../src/companies/company-directory.service";
import { ActivityStampService } from "../src/crm/activity-stamp.service";
import { TrackingCounterService } from "../src/tracking/tracking-counter.service";
import { TrackingFilingService } from "../src/tracking/tracking-filing.service";
import { withDiscardedCrmEvents } from "./agent-trigger.stub";

const suffix = process.env.TEST_RUN_ID ?? "filing-spec";
const domain = `visitors-${suffix}.test`;
const host = `www.${domain}`;

const queued: string[] = [];

const agent = {
	contactCreated: async (id: string) => {
		queued.push(id);
	},
	companyCreated: async () => undefined,
	companyRequested: async () => undefined,
	withCrmEvents: withDiscardedCrmEvents,
} as unknown as AgentTriggerService;

const stamp = new ActivityStampService(db);
const counters = new TrackingCounterService(db);
const directory = new CompanyDirectoryService(agent);
const filing = new TrackingFilingService(db, counters, directory, agent, stamp);

let userId: string;

async function submit(email: string | null, name: string | null = "Dana Reed") {
	const row = await db.formSubmission.create({
		data: {
			host,
			path: "/pricing",
			email,
			fields: name ? { name, email: email ?? "" } : {},
			dedupeKey: `${suffix}-${Math.random().toString(36).slice(2)}`,
		},
		select: { id: true },
	});

	const outcome = await filing.file({
		id: row.id,
		email,
		host,
		visitorId: `visitor-${Math.random().toString(36).slice(2, 12)}`,
		name,
	});

	const stored = await db.formSubmission.findUnique({
		where: { id: row.id },
		select: { contactId: true, filedAt: true, skipReason: true },
	});

	return { outcome, stored };
}

async function clean() {
	await db.activity.deleteMany({ where: { body: { contains: host } } });
	await db.formSubmission.deleteMany({ where: { host } });
	await db.trackedVisitor.deleteMany({
		where: { id: { startsWith: "visitor-" } },
	});
	await db.contact.deleteMany({ where: { email: { endsWith: `@${domain}` } } });
	await db.contact.deleteMany({ where: { email: `free-${suffix}@gmail.com` } });
	await db.company.deleteMany({ where: { domain } });
	await db.suppressedContact.deleteMany({
		where: { email: { endsWith: `@${domain}` } },
	});
	await db.suppressedDomain.deleteMany({ where: { domain } });
	await db.trackingCounter.deleteMany({ where: {} });
}

beforeAll(async () => {
	await clean();

	const user = await db.user.findFirst({ select: { id: true } });
	userId =
		user?.id ??
		(
			await db.user.create({
				data: {
					id: `user-${suffix}`,
					name: "Test Rep",
					email: `rep-${suffix}@example.test`,
				},
				select: { id: true },
			})
		).id;
});

beforeEach(async () => {
	queued.length = 0;
	await db.trackingCounter.deleteMany({ where: {} });
});

afterAll(async () => {
	await clean();
	if (userId.startsWith(`user-${suffix}`)) {
		await db.user.deleteMany({ where: { id: userId } });
	}
});

describe("filing a form submission", () => {
	it("refuses an address no human reads", async () => {
		const { outcome, stored } = await submit(`noreply@${domain}`);

		expect(outcome.filed).toBe(false);
		expect(stored?.contactId).toBeNull();
		expect(stored?.skipReason).toBeTruthy();
	});

	it("refuses a submission with no address at all", async () => {
		const { outcome, stored } = await submit(null);

		expect(outcome.filed).toBe(false);
		expect(stored?.skipReason).toBe("No email address");
	});

	it("refuses an address a rep has deleted", async () => {
		const email = `deleted@${domain}`;
		await db.suppressedContact.create({ data: { email } });

		const { outcome, stored } = await submit(email);

		expect(outcome.filed).toBe(false);
		expect(stored?.skipReason).toContain("deleted");
	});

	it("refuses a suppressed domain", async () => {
		await db.suppressedDomain.create({ data: { domain } });

		const { outcome, stored } = await submit(`someone@${domain}`);

		expect(outcome.filed).toBe(false);
		expect(stored?.skipReason).toContain("suppressed");

		await db.suppressedDomain.deleteMany({ where: { domain } });
	});

	it("files a free-mail address as a contact with no company", async () => {
		const { outcome, stored } = await submit(`free-${suffix}@gmail.com`);

		expect(outcome.filed).toBe(true);
		expect(stored?.filedAt).not.toBeNull();

		const contact = await db.contact.findUnique({
			where: { email: `free-${suffix}@gmail.com` },
			select: { companyId: true, source: true },
		});

		expect(contact?.companyId).toBeNull();
		expect(contact?.source).toBe("TRACKING");
	});

	it("files a work address and queues the agent once", async () => {
		const email = `dana@${domain}`;
		const { outcome, stored } = await submit(email);

		expect(outcome.filed).toBe(true);
		expect(stored?.contactId).toBeTruthy();
		expect(queued).toHaveLength(1);

		const contact = await db.contact.findUnique({
			where: { email },
			select: { companyId: true, firstName: true },
		});

		expect(contact?.companyId).toBeTruthy();
		expect(contact?.firstName).toBe("Dana");
	});

	it("writes one note when the same submission is filed twice at once", async () => {
		const email = `raced@${domain}`;
		const row = await db.formSubmission.create({
			data: {
				host,
				path: "/pricing",
				email,
				fields: { email },
				dedupeKey: `${suffix}-raced`,
			},
			select: { id: true },
		});

		const file = () =>
			filing.file({
				id: row.id,
				email,
				host,
				visitorId: `visitor-raced-${suffix}`.slice(0, 64),
				name: "Dana Reed",
			});

		const [first, second] = await Promise.all([file(), file()]);

		expect(first.filed).toBe(true);
		expect(second.filed).toBe(true);
		expect(await db.contact.count({ where: { email } })).toBe(1);

		const notes = await db.activity.count({
			where: { body: { contains: host }, contact: { email } },
		});

		expect(notes).toBe(1);
	});

	it("gives the cap slot back to the delivery that lost the create", async () => {
		const email = `refunded@${domain}`;
		const rows = await Promise.all(
			[1, 2].map((n) =>
				db.formSubmission.create({
					data: {
						host,
						path: "/pricing",
						email,
						fields: { email },
						dedupeKey: `${suffix}-refunded-${n}`,
					},
					select: { id: true },
				}),
			),
		);

		await Promise.all(
			rows.map((row) =>
				filing.file({
					id: row.id,
					email,
					host,
					visitorId: null,
					name: "Dana Reed",
				}),
			),
		);

		expect(await db.contact.count({ where: { email } })).toBe(1);

		const counter = await db.trackingCounter.findUnique({
			where: { key: contactWindowKey() },
			select: { value: true },
		});

		expect(counter?.value).toBe(1);
	});

	it("attaches a second submission to the contact already there", async () => {
		const email = `repeat@${domain}`;

		const first = await submit(email);
		queued.length = 0;
		const second = await submit(email);

		expect(first.outcome.filed).toBe(true);
		expect(second.outcome.filed).toBe(true);
		expect(second.stored?.contactId).toBe(first.stored?.contactId ?? "");
		expect(queued).toHaveLength(0);

		const count = await db.contact.count({ where: { email } });
		expect(count).toBe(1);
	});

	it("stores but does not file once the hourly cap is reached", async () => {
		await db.trackingCounter.upsert({
			where: { key: contactWindowKey() },
			create: {
				key: contactWindowKey(),
				value: CONTACTS_PER_HOUR,
				expiresAt: new Date(Date.now() + 3_600_000),
			},
			update: { value: CONTACTS_PER_HOUR },
		});

		const { outcome, stored } = await submit(`capped@${domain}`);

		expect(outcome.filed).toBe(false);
		expect(stored?.contactId).toBeNull();
		expect(stored?.skipReason).toBe(CONTACT_CAP_REASON);
	});
});

describe("the hourly counter", () => {
	it("counts up and refuses past the limit", async () => {
		const key = `contacts:test-${suffix}`;

		expect(await counters.take(key, 2)).toBe(true);
		expect(await counters.take(key, 2)).toBe(true);
		expect(await counters.take(key, 2)).toBe(false);
		expect(await counters.take(key, 2)).toBe(false);

		await db.trackingCounter.deleteMany({ where: { key } });
	});

	it("keeps a fixed window rather than sliding on every write", async () => {
		const key = contactWindowKey();

		await counters.take(key, 10);
		const first = await db.trackingCounter.findUnique({ where: { key } });

		await counters.take(key, 10);
		const second = await db.trackingCounter.findUnique({ where: { key } });

		expect(second?.expiresAt.getTime()).toBe(first?.expiresAt.getTime() ?? 0);
		expect(second?.value).toBe(2);
	});
});
