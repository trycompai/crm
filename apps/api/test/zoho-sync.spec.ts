import { describe, expect, it } from "bun:test";
import type { MailboxSyncModel as MailboxSync } from "@crm/db";
import type { SyncSource } from "../src/mailbox/mailbox.constants";
import type { MailboxTokenService } from "../src/mailbox/mailbox-token.service";
import type { SyncStateService } from "../src/mailbox/sync-state.service";
import type {
	IncomingMessage,
	ThreadWriterService,
} from "../src/mailbox/thread-writer.service";
import type {
	ZohoHeaders,
	ZohoMailClient,
	ZohoMessageSummary,
} from "../src/zoho/zoho-mail.client";
import { ZohoMailSyncService } from "../src/zoho/zoho-mail-sync.service";

type Ok<T> = { outcome: "ok"; data: T };
type NotOk =
	| { outcome: "cursor-invalid"; reason: string }
	| { outcome: "unauthorized"; reason: string }
	| { outcome: "rate-limited"; reason: string; retryAfterMs: number }
	| { outcome: "failed"; reason: string; retryable: boolean };

const ok = <T>(data: T): Ok<T> => ({ outcome: "ok", data });

type StoreOptions = { mailbox: string; origin: SyncSource };

const CURSOR = Date.parse("2025-08-01T09:00:00.000Z");

const INBOX = "folder-inbox";
const SPAM = "folder-spam";

const row = {
	id: "sync-1",
	userId: "user-1",
	source: "zohomail",
	cursor: String(CURSOR),
	autoCreate: true,
} as unknown as MailboxSync;

const rowWith = (cursor: string | null): MailboxSync =>
	({ ...row, cursor }) as MailboxSync;

type Harness = {
	service: ZohoMailSyncService;
	stored: IncomingMessage[];
	settled: { cursor?: string | null }[];
	rateLimited: number[];
	reconnected: string[];
	failed: string[];
	listedFrom: number[];
	headerCalls: string[];
};

function headersFor(values: Record<string, string>): ZohoHeaders {
	const map = new Map<string, string[]>();
	for (const [name, value] of Object.entries(values)) {
		map.set(name.toLowerCase(), [value]);
	}

	return { values: map };
}

function harness(options: {
	pages?: ZohoMessageSummary[][];
	headers?: Record<string, Record<string, string>>;
	content?: (messageId: string) => Ok<{ content: string }>;
	headerResult?: (messageId: string) => Ok<ZohoHeaders> | NotOk;
	accounts?: Ok<unknown[]> | NotOk;
	folders?: Ok<unknown[]> | NotOk;
}): Harness {
	const stored: IncomingMessage[] = [];
	const settled: { cursor?: string | null }[] = [];
	const rateLimited: number[] = [];
	const reconnected: string[] = [];
	const failed: string[] = [];
	const listedFrom: number[] = [];
	const headerCalls: string[] = [];

	const pages = options.pages ?? [[]];

	const zoho = {
		async accounts() {
			return (
				options.accounts ??
				ok([
					{
						accountId: "acct-1",
						mailboxAddress: "rep@trycomp.ai",
						type: "ZOHO_ACCOUNT",
						enabled: true,
					},
					// An attached IMAP mailbox must never be picked: the Zoho Mail
					// API cannot read one, so choosing it would fail every tick.
					{
						accountId: "acct-imap",
						mailboxAddress: "old@elsewhere.com",
						type: "IMAP_ACCOUNT",
					},
				])
			);
		},
		async folders() {
			return (
				options.folders ??
				ok([
					{ folderId: INBOX, folderName: "Inbox", folderType: "Inbox" },
					{ folderId: SPAM, folderName: "Spam", folderType: "Spam" },
				])
			);
		},
		async listMessages(
			_token: string,
			_accountId: string,
			page: { start: number },
		) {
			listedFrom.push(page.start);

			// `start` is 1-based and counts messages, not pages.
			let consumed = 1;
			for (const messages of pages) {
				if (consumed === page.start) return ok(messages);
				consumed += messages.length;
			}

			return ok([]);
		},
		async messageHeaders(
			_token: string,
			_accountId: string,
			_folderId: string,
			messageId: string,
		) {
			headerCalls.push(messageId);

			if (options.headerResult) return options.headerResult(messageId);

			return ok(
				headersFor(
					options.headers?.[messageId] ?? {
						"Message-Id": `<${messageId}@acme.com>`,
					},
				),
			);
		},
		async messageContent(
			_token: string,
			_accountId: string,
			_folderId: string,
			messageId: string,
		) {
			if (options.content) return options.content(messageId);

			return ok({ content: "<div>Hello</div>" });
		},
		messageUrl(folderId: string, messageId: string) {
			return `https://mail.zoho.com/zm/#mail/folder/${folderId}/p/${messageId}`;
		},
	} as unknown as ZohoMailClient;

	const tokens = {
		async accessTokenFor() {
			return { outcome: "ok" as const, accessToken: "token" };
		},
	} as unknown as MailboxTokenService;

	const state = {
		async markRunning() {},
		async settle(_id: string, update: { cursor?: string | null }) {
			settled.push(update);
		},
		async clearCursor() {},
		async markNeedsReconnect(_id: string, reason: string) {
			reconnected.push(reason);
		},
		async markRateLimited(_id: string, retryAfterMs: number) {
			rateLimited.push(retryAfterMs);
		},
		async markFailed(_id: string, reason: string) {
			failed.push(reason);
		},
	} as unknown as SyncStateService;

	const threads = {
		async context() {
			return {};
		},
		async store(
			_row: MailboxSync,
			_options: StoreOptions,
			parsed: IncomingMessage,
		) {
			stored.push(parsed);
			return true;
		},
	} as unknown as ThreadWriterService;

	return {
		service: new ZohoMailSyncService(zoho, tokens, state, threads),
		stored,
		settled,
		rateLimited,
		reconnected,
		failed,
		listedFrom,
		headerCalls,
	};
}

function summary(
	overrides: Partial<ZohoMessageSummary> = {},
): ZohoMessageSummary {
	return {
		messageId: "zm-1",
		folderId: INBOX,
		threadId: "thread-1",
		subject: "Pricing",
		summary: "Hello",
		fromAddress: "jane@acme.com",
		sender: "Jane",
		toAddress: '"Rep" <rep@trycomp.ai>',
		ccAddress: null,
		sentDateInGMT: CURSOR + 60_000,
		receivedTime: CURSOR + 60_000,
		...overrides,
	} as ZohoMessageSummary;
}

describe("the first Zoho tick", () => {
	it("marks where now is instead of back-filling the whole mailbox", async () => {
		const kit = harness({ pages: [[summary()]] });

		const outcome = await kit.service.sync(rowWith(null));

		expect(outcome.status).toBe("synced");
		expect(kit.stored).toHaveLength(0);
		expect(kit.settled).toHaveLength(1);

		const cursor = Number(kit.settled[0]?.cursor);
		expect(Number.isFinite(cursor)).toBe(true);
	});
});

describe("reading new mail", () => {
	it("stores a message the CRM has not seen and keeps a link back to Zoho", async () => {
		const kit = harness({ pages: [[summary()]] });

		await kit.service.sync(row);

		expect(kit.stored).toHaveLength(1);
		const message = kit.stored[0];

		expect(message?.rfcMessageId).toBe("zm-1@acme.com");
		expect(message?.from.email).toBe("jane@acme.com");
		expect(message?.from.name).toBe("Jane");
		expect(message?.recipients).toEqual([
			{ email: "rep@trycomp.ai", name: "Rep", kind: "to" },
		]);
		expect(message?.body).toBe("Hello");
		expect(message?.zohoMessageId).toBe("zm-1");
		expect(message?.zohoWebLink).toContain("/zm/#mail/folder/folder-inbox/p/");
	});

	it("stops at the first message the previous tick already read", async () => {
		const kit = harness({
			pages: [
				[
					summary({ messageId: "new", receivedTime: CURSOR + 60_000 }),
					summary({ messageId: "old", receivedTime: CURSOR - 60_000 }),
				],
			],
		});

		await kit.service.sync(row);

		expect(kit.stored.map((message) => message.zohoMessageId)).toEqual(["new"]);
		expect(kit.headerCalls).toEqual(["new"]);
	});

	it("moves the cursor to the newest message it saw", async () => {
		const newest = CURSOR + 120_000;
		const kit = harness({
			pages: [
				[
					summary({ messageId: "a", receivedTime: newest }),
					summary({ messageId: "b", receivedTime: CURSOR + 60_000 }),
				],
			],
		});

		await kit.service.sync(row);

		expect(kit.settled.at(-1)?.cursor).toBe(String(newest));
	});

	it("never files mail out of Spam or Trash", async () => {
		const kit = harness({
			pages: [
				[
					summary({ messageId: "junk", folderId: SPAM }),
					summary({ messageId: "real", folderId: INBOX }),
				],
			],
		});

		await kit.service.sync(row);

		expect(kit.stored.map((message) => message.zohoMessageId)).toEqual([
			"real",
		]);
	});

	it("pages by message count, which is what Zoho's start parameter means", async () => {
		const kit = harness({
			pages: [
				Array.from({ length: 50 }, (_unused, index) =>
					summary({
						messageId: `p1-${index}`,
						receivedTime: CURSOR + 120_000 - index,
					}),
				),
				[summary({ messageId: "p2-0", receivedTime: CURSOR - 60_000 })],
			],
		});

		await kit.service.sync(row);

		expect(kit.listedFrom).toEqual([1, 51]);
	});
});

describe("threading a Zoho message", () => {
	it("roots a reply on References, so it joins a thread seen through Gmail", async () => {
		const kit = harness({
			pages: [[summary({ messageId: "reply" })]],
			headers: {
				reply: {
					"Message-Id": "<reply@acme.com>",
					References: "<first@acme.com> <second@acme.com>",
				},
			},
		});

		await kit.service.sync(row);

		expect(kit.stored[0]?.rootId).toBe("first@acme.com");
	});

	it("falls back to Zoho's own thread id when the headers carry no chain", async () => {
		const kit = harness({
			pages: [[summary({ messageId: "orphan", threadId: "t-9" })]],
		});

		await kit.service.sync(row);

		expect(kit.stored[0]?.rootId).toBe("zoho-thread:t-9");
	});

	it("skips a message with no RFC Message-ID rather than inventing one", async () => {
		const kit = harness({
			pages: [[summary({ messageId: "headerless" })]],
			headers: { headerless: { Subject: "Pricing" } },
		});

		await kit.service.sync(row);

		expect(kit.stored).toHaveLength(0);
	});

	it("skips a message that vanished between the list and the fetch", async () => {
		const kit = harness({
			pages: [[summary({ messageId: "gone" })]],
			headerResult: () => ({
				outcome: "cursor-invalid",
				reason: "No such message.",
			}),
		});

		const outcome = await kit.service.sync(row);

		expect(outcome.status).toBe("synced");
		expect(kit.stored).toHaveLength(0);
		expect(kit.failed).toHaveLength(0);
	});
});

describe("when Zoho refuses", () => {
	it("asks for a reconnect on 401 rather than retrying forever", async () => {
		const kit = harness({
			accounts: { outcome: "unauthorized", reason: "Invalid OAuth token." },
		});

		const outcome = await kit.service.sync(row);

		expect(outcome.status).toBe("reconnect");
		expect(kit.reconnected).toEqual(["Invalid OAuth token."]);
	});

	it("backs off on a rate limit", async () => {
		const kit = harness({
			folders: {
				outcome: "rate-limited",
				reason: "Too many requests.",
				retryAfterMs: 90_000,
			},
		});

		const outcome = await kit.service.sync(row);

		expect(outcome.status).toBe("rate-limited");
		expect(kit.rateLimited).toEqual([90_000]);
	});

	it("fails loudly when the login has no mailbox this API can read", async () => {
		const kit = harness({
			accounts: ok([
				{
					accountId: "acct-imap",
					mailboxAddress: "x@y.com",
					type: "IMAP_ACCOUNT",
				},
			]),
		});

		const outcome = await kit.service.sync(row);

		expect(outcome.status).toBe("failed");
		expect(kit.failed.at(0)).toContain("no readable mailbox");
	});
});
