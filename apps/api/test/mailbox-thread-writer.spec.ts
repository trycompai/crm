import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { db, type MailboxSyncModel as MailboxSync } from "@crm/db";
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

const suffix = process.env.TEST_RUN_ID ?? "thread-writer-spec";
const domain = `threads-${suffix}.test`;
const userId = `user-${suffix}`;
const mailbox = `rep-${suffix}@example.test`;
const person = `buyer@${domain}`;
const rootId = `<root-${suffix}@mail.test>`;
const movedRoot = `outlook-conversation:${suffix}`;

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

let row: MailboxSync;

function message(id: string, sentAt: Date, root = rootId): IncomingMessage {
	return {
		rfcMessageId: id,
		rootId: root,
		subject: "Pricing",
		from: { email: mailbox, name: "Test Rep" },
		recipients: [{ email: person, name: "A Buyer", kind: "to" }],
		body: "The numbers you asked for.",
		sentAt,
		gmailMessageId: null,
		outlookMessageId: null,
		outlookWebLink: null,
	};
}

async function clean() {
	await db.emailThread.deleteMany({
		where: { rootMessageId: { in: [rootId, movedRoot] } },
	});
	await db.contact.deleteMany({ where: { email: person } });
	await db.company.deleteMany({ where: { domain } });
	await db.mailboxSync.deleteMany({ where: { userId } });
	await db.user.deleteMany({ where: { id: userId } });
}

beforeAll(async () => {
	await clean();

	await db.user.create({
		data: { id: userId, name: "Test Rep", email: mailbox },
	});
	row = await db.mailboxSync.create({
		data: { userId, source: "gmail", autoCreate: false },
	});

	const company = await db.company.create({
		data: { name: "Buyer Co", domain },
		select: { id: true },
	});
	await db.contact.create({
		data: {
			firstName: "A",
			lastName: "Buyer",
			email: person,
			companyId: company.id,
		},
	});
});

afterAll(clean);

describe("storing a synced email", () => {
	it("writes the message, the counts and the activity together", async () => {
		const stored = await threads.store(
			row,
			{ mailbox, origin: "gmail" },
			message(`<one-${suffix}@mail.test>`, new Date("2026-01-01T10:00:00Z")),
			await threads.context(),
		);

		expect(stored).toBe(true);

		const thread = await db.emailThread.findUnique({
			where: { rootMessageId: rootId },
			select: {
				id: true,
				messageCount: true,
				activity: { select: { id: true } },
			},
		});

		expect(thread?.messageCount).toBe(1);
		expect(thread?.activity).not.toBeNull();
	});

	it("repairs a thread whose projection was lost rather than skipping it forever", async () => {
		const thread = await db.emailThread.findUnique({
			where: { rootMessageId: rootId },
			select: { id: true },
		});
		if (!thread) throw new Error("the first message was not stored");

		await db.activity.deleteMany({ where: { emailThreadId: thread.id } });
		await db.emailThread.update({
			where: { id: thread.id },
			data: { messageCount: 0 },
		});

		const stored = await threads.store(
			row,
			{ mailbox, origin: "gmail" },
			message(`<one-${suffix}@mail.test>`, new Date("2026-01-01T10:00:00Z")),
			await threads.context(),
		);

		expect(stored).toBe(false);

		const repaired = await db.emailThread.findUnique({
			where: { id: thread.id },
			select: { messageCount: true, activity: { select: { id: true } } },
		});

		expect(repaired?.messageCount).toBe(1);
		expect(repaired?.activity).not.toBeNull();
	});

	it("lets one of two concurrent syncs win without failing the other", async () => {
		const parsed = message(
			`<race-${suffix}@mail.test>`,
			new Date("2026-01-02T10:00:00Z"),
		);
		const context = await threads.context();

		const results = await Promise.all([
			threads.store(row, { mailbox, origin: "gmail" }, parsed, context),
			threads.store(row, { mailbox, origin: "outlook" }, parsed, context),
		]);

		expect(results.filter(Boolean)).toHaveLength(1);
		expect(
			await db.emailMessage.count({
				where: { rfcMessageId: parsed.rfcMessageId },
			}),
		).toBe(1);

		const thread = await db.emailThread.findUnique({
			where: { rootMessageId: rootId },
			select: { messageCount: true, activity: { select: { id: true } } },
		});

		expect(thread?.messageCount).toBe(2);
		expect(thread?.activity).not.toBeNull();
	});

	it("repairs the thread the message is already on when the root id has moved", async () => {
		const thread = await db.emailThread.findUnique({
			where: { rootMessageId: rootId },
			select: { id: true },
		});
		if (!thread) throw new Error("the first message was not stored");

		await db.activity.deleteMany({ where: { emailThreadId: thread.id } });
		await db.emailThread.update({
			where: { id: thread.id },
			data: { messageCount: 0 },
		});

		const stored = await threads.store(
			row,
			{ mailbox, origin: "outlook" },
			message(
				`<race-${suffix}@mail.test>`,
				new Date("2026-01-02T10:00:00Z"),
				movedRoot,
			),
			await threads.context(),
		);

		expect(stored).toBe(false);
		expect(
			await db.emailThread.count({ where: { rootMessageId: movedRoot } }),
		).toBe(0);

		const repaired = await db.emailThread.findUnique({
			where: { id: thread.id },
			select: { messageCount: true, activity: { select: { id: true } } },
		});

		expect(repaired?.messageCount).toBe(2);
		expect(repaired?.activity).not.toBeNull();
	});
});
