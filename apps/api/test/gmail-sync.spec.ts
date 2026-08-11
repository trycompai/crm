import { describe, expect, it } from "bun:test";
import type { Db, MailboxSyncModel as MailboxSync } from "@crm/db";
import type {
	GmailClient,
	GmailMessage,
	HistoryList,
} from "../src/google/gmail.client";
import { GmailSyncService } from "../src/google/gmail-sync.service";
import type { MailboxResult } from "../src/mailbox/mailbox-api.client";
import type { MailboxTokenService } from "../src/mailbox/mailbox-token.service";
import type { SyncStateService } from "../src/mailbox/sync-state.service";
import type {
	IncomingMessage,
	ThreadWriterService,
} from "../src/mailbox/thread-writer.service";

const row = {
	id: "sync-1",
	userId: "user-1",
	source: "gmail",
	cursor: "h0",
	autoCreate: true,
} as unknown as MailboxSync;

const ok = <T>(data: T): MailboxResult<T> => ({ outcome: "ok", data });

function message(id: string): GmailMessage {
	return {
		id,
		internalDate: "1754042400000",
		payload: {
			headers: [
				{ name: "Message-ID", value: `<${id}@mail.test>` },
				{ name: "From", value: "Buyer <buyer@example.test>" },
				{ name: "To", value: "Rep <rep@trycomp.ai>" },
				{ name: "Subject", value: "Pricing" },
				{ name: "Date", value: "Fri, 1 Aug 2025 10:00:00 +0000" },
			],
			body: { data: "SGVsbG8=" },
		},
	};
}

function harness(options: {
	history: HistoryList[];
	getMessage?: (id: string) => Promise<MailboxResult<GmailMessage>>;
}) {
	const calls: Array<{ pageToken?: string }> = [];
	const stored: IncomingMessage[] = [];
	const settled: Array<{ cursor?: string | null }> = [];
	const failed: string[] = [];

	const gmail = {
		async profile() {
			return ok({ emailAddress: "rep@trycomp.ai", historyId: "h0" });
		},
		async listHistory(_token: string, request: { pageToken?: string }) {
			calls.push({ pageToken: request.pageToken });
			return ok(options.history[calls.length - 1] ?? { historyId: "h0" });
		},
		async getMessage(_token: string, id: string) {
			return options.getMessage?.(id) ?? Promise.resolve(ok(message(id)));
		},
	} as unknown as GmailClient;

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
		async markNeedsReconnect() {},
		async markRateLimited() {},
		async markFailed(_id: string, reason: string) {
			failed.push(reason);
		},
	} as unknown as SyncStateService;

	const db = {
		emailMessage: {
			async findMany() {
				return [];
			},
		},
	} as unknown as Db;

	const threads = {
		async context() {
			return {};
		},
		async store(_row: MailboxSync, _options: unknown, parsed: IncomingMessage) {
			stored.push(parsed);
			return true;
		},
	} as unknown as ThreadWriterService;

	return {
		service: new GmailSyncService(db, gmail, tokens, state, threads),
		calls,
		stored,
		settled,
		failed,
	};
}

describe("GmailSyncService", () => {
	it("reads all history pages before advancing the cursor", async () => {
		const kit = harness({
			history: [
				{
					historyId: "h1",
					nextPageToken: "page-2",
					history: [{ messagesAdded: [{ message: { id: "m1" } }] }],
				},
				{
					historyId: "h2",
					history: [{ messagesAdded: [{ message: { id: "m2" } }] }],
				},
			],
		});

		const result = await kit.service.sync(row);

		expect(result.status).toBe("synced");
		expect(kit.calls).toEqual([
			{ pageToken: undefined },
			{ pageToken: "page-2" },
		]);
		expect(kit.stored.map((item) => item.gmailMessageId)).toEqual(["m1", "m2"]);
		expect(kit.settled.at(-1)?.cursor).toBe("h2");
	});

	it("does not advance the cursor when a message read fails", async () => {
		const kit = harness({
			history: [
				{
					historyId: "h1",
					history: [{ messagesAdded: [{ message: { id: "m1" } }] }],
				},
			],
			getMessage: async () => ({
				outcome: "failed",
				reason: "temporary read failure",
				retryable: true,
			}),
		});

		const result = await kit.service.sync(row);

		expect(result.status).toBe("failed");
		expect(kit.failed).toEqual(["temporary read failure"]);
		expect(kit.settled).toEqual([]);
	});
});
