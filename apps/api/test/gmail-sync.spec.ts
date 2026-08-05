import { beforeEach, describe, expect, it } from "bun:test";
import type { Db, MailboxSyncModel } from "@crm/db";
import { GoogleSyncStatus } from "@crm/db";
import type { ActivityStampService } from "../src/crm/activity-stamp.service";
import type { GmailClient } from "../src/google/gmail.client";
import { GmailSyncService } from "../src/google/gmail-sync.service";
import type { GoogleMatchService } from "../src/google/google-match.service";
import type { GoogleTokenService } from "../src/google/google-token.service";
import type { SyncStateService } from "../src/google/sync-state.service";

function harness(messageOutcomes: unknown[]) {
	const settled: Array<{ cursor?: string | null }> = [];
	let getMessageIndex = 0;

	const db = {
		emailMessage: {
			findMany: async () => [],
			findUnique: async () => null,
			aggregate: async () => ({
				_count: { _all: 0 },
				_min: { sentAt: null },
				_max: { sentAt: null },
			}),
			create: async () => ({}),
		},
		emailThread: {
			findUnique: async () => null,
			findFirst: async () => null,
			upsert: async () => ({
				id: "thread-1",
				firstMessageAt: new Date(),
				lastMessageAt: new Date(),
			}),
			update: async () => ({}),
		},
		activity: {
			upsert: async () => ({ createdAt: new Date() }),
		},
		mailboxSync: {
			update: async ({ data }: { data: { cursor?: string | null } }) => {
				settled.push({ cursor: data.cursor ?? null });
				return {};
			},
		},
	} as unknown as Db;

	const service = new GmailSyncService(
		db,
		{
			profile: async () => ({
				outcome: "ok" as const,
				data: { emailAddress: "rep@acme.com" },
			}),
			listHistory: async () => ({
				outcome: "ok" as const,
				data: {
					historyId: "200",
					history: [
						{ messagesAdded: [{ message: { id: "m1" } }] },
						{ messagesAdded: [{ message: { id: "m2" } }] },
					],
				},
			}),
			getMessage: async () => {
				const outcome = messageOutcomes[getMessageIndex] ?? {
					outcome: "failed",
					reason: "unexpected",
					retryable: false,
				};
				getMessageIndex += 1;
				return outcome;
			},
		} as unknown as GmailClient,
		{
			accessTokenFor: async () => ({
				outcome: "ok" as const,
				accessToken: "token",
			}),
		} as unknown as GoogleTokenService,
		{
			internalIdentity: async () => ({
				domains: new Set(["acme.com"]),
				addresses: new Set(["rep@acme.com"]),
			}),
			suppressedDomains: async () => new Set<string>(),
			suppressedEmails: async () => new Set<string>(),
		} as unknown as GoogleMatchService,
		{
			settle: async (_id: string, update: { cursor?: string | null }) => {
				settled.push({ cursor: update.cursor ?? null });
			},
			markRunning: async () => undefined,
			markFailed: async () => undefined,
			markNeedsReconnect: async () => undefined,
			markRateLimited: async () => undefined,
			clearCursor: async () => undefined,
		} as unknown as SyncStateService,
		{
			touch: async () => undefined,
		} as unknown as ActivityStampService,
	);

	return { service, settled };
}

const row = {
	id: "sync-1",
	userId: "u1",
	source: "gmail",
	status: GoogleSyncStatus.RUNNING,
	cursor: "100",
	lastSyncedAt: new Date(),
	lastError: null,
	retryAfter: null,
	autoCreate: false,
	createdAt: new Date(),
	updatedAt: new Date(),
} as MailboxSyncModel;

describe("GmailSyncService cursor", () => {
	beforeEach(() => {
		process.env.ALLOWED_SIGN_IN = "acme.com";
	});

	it("holds the cursor at the start history id when a message fetch is rate-limited", async () => {
		const { service, settled } = harness([
			{
				outcome: "rate-limited",
				reason: "User Rate Limit Exceeded",
				retryAfterMs: 60_000,
			},
			{ outcome: "ok", data: {} },
		]);

		await service.sync(row);

		expect(settled).toHaveLength(1);
		expect(settled[0]?.cursor).toBe("100");
	});

	it("holds the cursor when a message fetch times out (retryable failure)", async () => {
		const { service, settled } = harness([
			{
				outcome: "failed",
				reason: "Timed out after 20000ms.",
				retryable: true,
			},
			{ outcome: "ok", data: {} },
		]);

		await service.sync(row);

		expect(settled).toHaveLength(1);
		expect(settled[0]?.cursor).toBe("100");
	});

	it("advances the cursor past a message Gmail reports deleted", async () => {
		const { service, settled } = harness([
			{ outcome: "cursor-invalid", reason: "Requested entity was not found." },
			{ outcome: "ok", data: {} },
		]);

		await service.sync(row);

		expect(settled).toHaveLength(1);
		expect(settled[0]?.cursor).not.toBe("100");
	});

	it("advances the cursor past a non-retryable failure", async () => {
		const { service, settled } = harness([
			{ outcome: "failed", reason: "Forbidden", retryable: false },
			{ outcome: "ok", data: {} },
		]);

		await service.sync(row);

		expect(settled).toHaveLength(1);
		expect(settled[0]?.cursor).not.toBe("100");
	});

	it("advances the cursor when every message is fetched", async () => {
		const { service, settled } = harness([
			{ outcome: "ok", data: {} },
			{ outcome: "ok", data: {} },
		]);

		await service.sync(row);

		expect(settled).toHaveLength(1);
		expect(settled[0]?.cursor).not.toBe("100");
	});
});
