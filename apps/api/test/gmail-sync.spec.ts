import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import {
	ActivityType,
	db,
	GoogleSyncStatus,
	type MailboxSyncModel as MailboxSync,
} from "@crm/db";
import type { AgentTriggerService } from "../src/agent/agent-trigger.service";
import { CompanyDirectoryService } from "../src/companies/company-directory.service";
import { ActivityStampService } from "../src/crm/activity-stamp.service";
import { EnrichmentLogService } from "../src/crm/enrichment-log.service";
import { ConversationService } from "../src/google/conversation.service";
import type { GmailClient, GmailMessage } from "../src/google/gmail.client";
import { GmailSyncService } from "../src/google/gmail-sync.service";
import { MailboxMatchService } from "../src/mailbox/mailbox-match.service";
import type { MailboxTokenService } from "../src/mailbox/mailbox-token.service";
import { SyncStateService } from "../src/mailbox/sync-state.service";
import { ThreadWriterService } from "../src/mailbox/thread-writer.service";
import { withDiscardedCrmEvents } from "./agent-trigger.stub";

const suffix = process.env.TEST_RUN_ID ?? "gmail-sync-spec";
const domain = `gmail-${suffix}.test`;
const userId = `user-gmail-${suffix}`;
const secondUserId = `user-gmail-b-${suffix}`;
const mailbox = `rep-gmail-${suffix}@example.test`;
const secondMailbox = `rep-b-gmail-${suffix}@example.test`;
const person = `buyer@${domain}`;
const rootRfc = `<root-${suffix}@mail.test>`;
const replyRfc = `<reply-${suffix}@mail.test>`;
const rootId = `root-${suffix}@mail.test`;
const replyId = `reply-${suffix}@mail.test`;
const bodyText = [
	"Here are the numbers you asked for on the Q3 order.",
	"Please review the line items, the volume discount table,",
	"and the shipping schedule before Friday so we can lock the PO.",
	"I also attached the competitor matrix from last week for context.",
].join(" ");

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
const state = new SyncStateService(db);
const threads = new ThreadWriterService(db, match, stamp);
const conversations = new ConversationService(db);

let row: MailboxSync;
let secondRow: MailboxSync;
let companyId: string;
let contactId: string;

let messagesById = new Map<string, GmailMessage>();
let historyOutcome:
	| { outcome: "ok"; data: { history?: unknown[]; historyId?: string } }
	| { outcome: "cursor-invalid"; reason: string } = {
	outcome: "ok",
	data: { history: [], historyId: "hist-0" },
};
let profileHistoryId = "hist-start";

const tokens = {
	async accessTokenFor() {
		return { outcome: "ok" as const, accessToken: "token" };
	},
} as unknown as MailboxTokenService;

const gmail = {
	async profile() {
		return {
			outcome: "ok" as const,
			data: { emailAddress: mailbox, historyId: profileHistoryId },
		};
	},
	async listHistory() {
		return historyOutcome;
	},
	async getMessage(_token: string, id: string) {
		const data = messagesById.get(id);
		if (!data) {
			return {
				outcome: "failed" as const,
				reason: "missing",
				retryable: false,
			};
		}
		return { outcome: "ok" as const, data };
	},
} as unknown as GmailClient;

const service = new GmailSyncService(db, gmail, tokens, state, threads);

function encode(text: string): string {
	return Buffer.from(text, "utf8")
		.toString("base64")
		.replace(/\+/g, "-")
		.replace(/\//g, "_")
		.replace(/=+$/, "");
}

function gmailMessage(options: {
	id: string;
	rfcMessageId: string;
	from: string;
	fromName?: string;
	to: string;
	subject: string;
	body: string;
	sentAt: string;
	references?: string;
	inReplyTo?: string;
	threadId?: string;
}): GmailMessage {
	const headers = [
		{ name: "Message-ID", value: options.rfcMessageId },
		{
			name: "From",
			value: options.fromName
				? `${options.fromName} <${options.from}>`
				: options.from,
		},
		{ name: "To", value: options.to },
		{ name: "Subject", value: options.subject },
		{ name: "Date", value: options.sentAt },
	];
	if (options.references) {
		headers.push({ name: "References", value: options.references });
	}
	if (options.inReplyTo) {
		headers.push({ name: "In-Reply-To", value: options.inReplyTo });
	}

	return {
		id: options.id,
		threadId: options.threadId ?? `gmail-thread-${options.id}`,
		internalDate: String(new Date(options.sentAt).getTime()),
		payload: {
			mimeType: "text/plain",
			headers,
			body: { data: encode(options.body) },
		},
	};
}

function setHistory(addedIds: string[], historyId: string) {
	historyOutcome = {
		outcome: "ok",
		data: {
			historyId,
			history: [
				{
					id: historyId,
					messagesAdded: addedIds.map((id) => ({ message: { id } })),
				},
			],
		},
	};
}

async function clean() {
	await db.emailMessage.deleteMany({
		where: {
			OR: [
				{ rfcMessageId: { contains: suffix } },
				{ gmailMessageId: { contains: suffix } },
				{ thread: { rootMessageId: { contains: suffix } } },
			],
		},
	});
	await db.activity.deleteMany({
		where: {
			OR: [
				{ createdById: { in: [userId, secondUserId] } },
				{ emailThread: { rootMessageId: { contains: suffix } } },
			],
		},
	});
	await db.emailThread.deleteMany({
		where: { rootMessageId: { contains: suffix } },
	});
	await db.contact.deleteMany({ where: { email: person } });
	await db.company.deleteMany({ where: { domain } });
	await db.mailboxSync.deleteMany({
		where: { userId: { in: [userId, secondUserId] } },
	});
	await db.user.deleteMany({ where: { id: { in: [userId, secondUserId] } } });
}

beforeAll(async () => {
	await clean();

	await db.user.create({
		data: { id: userId, name: "Test Rep", email: mailbox },
	});
	await db.user.create({
		data: { id: secondUserId, name: "Other Rep", email: secondMailbox },
	});

	row = await db.mailboxSync.create({
		data: {
			userId,
			source: "gmail",
			autoCreate: false,
			status: GoogleSyncStatus.IDLE,
			cursor: "hist-ready",
		},
	});
	secondRow = await db.mailboxSync.create({
		data: {
			userId: secondUserId,
			source: "gmail",
			autoCreate: false,
			status: GoogleSyncStatus.IDLE,
			cursor: "hist-ready-b",
		},
	});

	const company = await db.company.create({
		data: { name: "Buyer Co", domain },
		select: { id: true },
	});
	companyId = company.id;

	const contact = await db.contact.create({
		data: {
			firstName: "A",
			lastName: "Buyer",
			email: person,
			companyId,
		},
		select: { id: true },
	});
	contactId = contact.id;
});

afterAll(clean);

describe("GmailSyncService", () => {
	it("stamps the historyId on first sight and imports nothing", async () => {
		await db.mailboxSync.update({
			where: { id: row.id },
			data: { cursor: null, status: GoogleSyncStatus.IDLE },
		});
		row = await db.mailboxSync.findUniqueOrThrow({ where: { id: row.id } });
		profileHistoryId = "hist-first-sight";
		messagesById = new Map();
		setHistory(["should-not-fetch"], "hist-ignored");

		const beforeThreads = await db.emailThread.count({
			where: { rootMessageId: { contains: suffix } },
		});

		const outcome = await service.sync(row);

		expect(outcome.status).toBe("synced");
		expect(outcome.messagesWritten).toBeUndefined();

		const refreshed = await db.mailboxSync.findUniqueOrThrow({
			where: { id: row.id },
		});
		expect(refreshed.cursor).toBe("hist-first-sight");
		expect(
			await db.emailThread.count({
				where: { rootMessageId: { contains: suffix } },
			}),
		).toBe(beforeThreads);

		row = refreshed;
	});

	it("projects a relevant thread onto the company timeline", async () => {
		const gmailId = `gm-${suffix}-1`;
		const message = gmailMessage({
			id: gmailId,
			rfcMessageId: rootRfc,
			from: mailbox,
			fromName: "Test Rep",
			to: person,
			subject: "Pricing",
			body: bodyText,
			sentAt: "2026-08-10T14:00:00.000Z",
		});
		messagesById = new Map([[gmailId, message]]);
		setHistory([gmailId], "hist-1");

		const outcome = await service.sync(row);

		expect(outcome.status).toBe("synced");
		expect(outcome.messagesWritten).toBe(1);

		const thread = await db.emailThread.findUnique({
			where: { rootMessageId: rootId },
			include: {
				activity: true,
				messages: true,
			},
		});

		expect(thread).not.toBeNull();
		expect(thread?.companyId).toBe(companyId);
		expect(thread?.contactId).toBe(contactId);
		expect(thread?.messageCount).toBe(1);
		expect(thread?.activity?.type).toBe(ActivityType.EMAIL);
		expect(thread?.activity?.subject).toBe("Pricing");
		expect(thread?.activity?.companyId).toBe(companyId);
		expect(thread?.activity?.body?.endsWith("…")).toBe(true);
		expect(thread?.activity?.body?.length).toBeLessThanOrEqual(200);
		expect(thread?.messages[0]?.gmailMessageId).toBe(gmailId);
		expect(thread?.messages[0]?.rfcMessageId).toBe(rootId);
		expect(thread?.messages[0]?.body).toBe(bodyText);

		const meta = thread?.activity?.meta as Record<string, unknown> | null;
		expect(meta?.synced).toBe(true);
		expect(meta?.source).toBe("gmail");

		row = await db.mailboxSync.findUniqueOrThrow({ where: { id: row.id } });
		expect(row.cursor).toBe("hist-1");
	});

	it("dedupes on rfcMessageId across two mailboxes with different Gmail ids", async () => {
		const otherGmailId = `gm-${suffix}-1b`;
		const duplicate = gmailMessage({
			id: otherGmailId,
			rfcMessageId: rootRfc,
			from: mailbox,
			fromName: "Test Rep",
			to: person,
			subject: "Pricing",
			body: bodyText,
			sentAt: "2026-08-10T14:00:00.000Z",
			threadId: `other-mailbox-thread-${suffix}`,
		});

		const secondGmail = {
			async profile() {
				return {
					outcome: "ok" as const,
					data: {
						emailAddress: secondMailbox,
						historyId: "hist-b-start",
					},
				};
			},
			async listHistory() {
				return {
					outcome: "ok" as const,
					data: {
						historyId: "hist-b-1",
						history: [
							{
								id: "hist-b-1",
								messagesAdded: [{ message: { id: otherGmailId } }],
							},
						],
					},
				};
			},
			async getMessage() {
				return { outcome: "ok" as const, data: duplicate };
			},
		} as unknown as GmailClient;

		const otherService = new GmailSyncService(
			db,
			secondGmail,
			tokens,
			state,
			threads,
		);

		const beforeMessages = await db.emailMessage.count({
			where: { rfcMessageId: rootId },
		});
		const beforeThreads = await db.emailThread.count({
			where: { rootMessageId: rootId },
		});
		const beforeActivities = await db.activity.count({
			where: {
				type: ActivityType.EMAIL,
				emailThread: { rootMessageId: rootId },
			},
		});

		const outcome = await otherService.sync(secondRow);

		expect(outcome.status).toBe("synced");
		expect(outcome.messagesWritten ?? 0).toBe(0);
		expect(
			await db.emailMessage.count({ where: { rfcMessageId: rootId } }),
		).toBe(beforeMessages);
		expect(
			await db.emailThread.count({ where: { rootMessageId: rootId } }),
		).toBe(beforeThreads);
		expect(
			await db.activity.count({
				where: {
					type: ActivityType.EMAIL,
					emailThread: { rootMessageId: rootId },
				},
			}),
		).toBe(beforeActivities);
		expect(beforeMessages).toBe(1);
		expect(beforeThreads).toBe(1);
		expect(beforeActivities).toBe(1);
	});

	it("keeps full bodies out of the timeline list path and returns them on expand", async () => {
		const thread = await db.emailThread.findUniqueOrThrow({
			where: { rootMessageId: rootId },
			select: { id: true },
		});

		const list = await db.activity.findMany({
			where: { emailThreadId: thread.id },
			select: {
				id: true,
				subject: true,
				body: true,
				emailThread: {
					select: {
						id: true,
						messageCount: true,
						lastMessageAt: true,
					},
				},
			},
		});

		expect(list).toHaveLength(1);
		expect(list[0]?.emailThread).not.toBeNull();
		expect(list[0]?.body?.endsWith("…")).toBe(true);
		expect(list[0]?.body?.length).toBeLessThanOrEqual(200);
		expect(list[0]?.body).not.toBe(bodyText);
		expect(JSON.stringify(list[0]?.emailThread)).not.toContain(
			"volume discount table",
		);

		const expanded = await conversations.thread(thread.id);
		expect(expanded.messages.length).toBe(1);
		expect(expanded.messages[0]?.body).toBe(bodyText);
		expect(expanded.messages[0]?.mailboxName).toBe("Gmail");
		expect(expanded.messages[0]?.mailboxUrl).toContain("mail.google.com");
	});

	it("updates the projected activity when a new message arrives on the thread", async () => {
		const gmailId = `gm-${suffix}-2`;
		const reply = gmailMessage({
			id: gmailId,
			rfcMessageId: replyRfc,
			from: person,
			fromName: "A Buyer",
			to: mailbox,
			subject: "Re: Pricing",
			body: "Thanks — can we also get the volume discount table?",
			sentAt: "2026-08-10T16:30:00.000Z",
			references: rootRfc,
			inReplyTo: rootRfc,
		});
		messagesById = new Map([[gmailId, reply]]);
		setHistory([gmailId], "hist-2");

		const gmailForInbound = {
			...gmail,
			async profile() {
				return {
					outcome: "ok" as const,
					data: { emailAddress: mailbox, historyId: "hist-2" },
				};
			},
		} as unknown as GmailClient;

		const inboundService = new GmailSyncService(
			db,
			gmailForInbound,
			tokens,
			state,
			threads,
		);

		const outcome = await inboundService.sync(row);

		expect(outcome.status).toBe("synced");
		expect(outcome.messagesWritten).toBe(1);

		const thread = await db.emailThread.findUnique({
			where: { rootMessageId: rootId },
			include: { activity: true, messages: true },
		});

		expect(thread?.messageCount).toBe(2);
		expect(thread?.messages).toHaveLength(2);
		expect(thread?.activity?.body).toContain("volume discount");
		expect(thread?.activity?.occurredAt?.toISOString()).toBe(
			"2026-08-10T16:30:00.000Z",
		);
		expect(
			thread?.messages.some((message) => message.rfcMessageId === replyId),
		).toBe(true);

		row = await db.mailboxSync.findUniqueOrThrow({ where: { id: row.id } });
	});

	it("ignores mail that does not resolve to a tracked company when auto-create is off", async () => {
		const strangerId = `gm-${suffix}-stranger`;
		const strangerRfc = `<stranger-${suffix}@mail.test>`;
		const strangerKey = `stranger-${suffix}@mail.test`;
		const stranger = gmailMessage({
			id: strangerId,
			rfcMessageId: strangerRfc,
			from: mailbox,
			to: "nobody@unknown-host.invalid",
			subject: "Hello stranger",
			body: "This should never land in the CRM.",
			sentAt: "2026-08-11T10:00:00.000Z",
		});
		messagesById = new Map([[strangerId, stranger]]);
		setHistory([strangerId], "hist-3");

		const before = await db.emailThread.count({
			where: { rootMessageId: strangerKey },
		});

		const outcome = await service.sync(row);

		expect(outcome.status).toBe("synced");
		expect(outcome.messagesWritten ?? 0).toBe(0);
		expect(
			await db.emailThread.count({ where: { rootMessageId: strangerKey } }),
		).toBe(before);
		expect(
			await db.emailMessage.count({ where: { rfcMessageId: strangerKey } }),
		).toBe(0);

		row = await db.mailboxSync.findUniqueOrThrow({ where: { id: row.id } });
	});

	it("is idempotent when the same history window is re-run", async () => {
		const gmailId = `gm-${suffix}-1`;
		const message = gmailMessage({
			id: gmailId,
			rfcMessageId: rootRfc,
			from: mailbox,
			to: person,
			subject: "Pricing",
			body: bodyText,
			sentAt: "2026-08-10T14:00:00.000Z",
		});
		messagesById = new Map([[gmailId, message]]);
		setHistory([gmailId], "hist-4");

		const beforeMessages = await db.emailMessage.count({
			where: { thread: { rootMessageId: rootId } },
		});
		const beforeThreads = await db.emailThread.count({
			where: { rootMessageId: rootId },
		});

		const outcome = await service.sync(row);

		expect(outcome.status).toBe("synced");
		expect(outcome.messagesWritten ?? 0).toBe(0);
		expect(
			await db.emailMessage.count({
				where: { thread: { rootMessageId: rootId } },
			}),
		).toBe(beforeMessages);
		expect(
			await db.emailThread.count({ where: { rootMessageId: rootId } }),
		).toBe(beforeThreads);

		row = await db.mailboxSync.findUniqueOrThrow({ where: { id: row.id } });
	});

	it("clears the cursor on history 404 so the next tick resumes from now", async () => {
		await db.mailboxSync.update({
			where: { id: row.id },
			data: { cursor: "stale-history", status: GoogleSyncStatus.IDLE },
		});
		row = await db.mailboxSync.findUniqueOrThrow({ where: { id: row.id } });

		const failingGmail = {
			async profile() {
				return {
					outcome: "ok" as const,
					data: { emailAddress: mailbox, historyId: "hist-new" },
				};
			},
			async listHistory() {
				return {
					outcome: "cursor-invalid" as const,
					reason: "Requested entity was not found.",
				};
			},
			async getMessage() {
				throw new Error("must not fetch messages after cursor invalidation");
			},
		} as unknown as GmailClient;

		const failing = new GmailSyncService(
			db,
			failingGmail,
			tokens,
			state,
			threads,
		);

		const outcome = await failing.sync(row);

		expect(outcome.status).toBe("synced");
		expect(outcome.reason).toContain("History expired");

		const refreshed = await db.mailboxSync.findUniqueOrThrow({
			where: { id: row.id },
		});
		expect(refreshed.cursor).toBeNull();
		expect(refreshed.status).toBe(GoogleSyncStatus.IDLE);
		row = refreshed;
	});
});
