import { describe, expect, it } from "bun:test";
import type { MailboxSyncModel as MailboxSync } from "@crm/db";
import type { MailboxTokenService } from "../src/mailbox/mailbox-token.service";
import type { SyncStateService } from "../src/mailbox/sync-state.service";
import type {
	IncomingMessage,
	ThreadWriterService,
} from "../src/mailbox/thread-writer.service";
import type { GraphClient, GraphMessage } from "../src/microsoft/graph.client";
import { OutlookSyncService } from "../src/microsoft/outlook-sync.service";

type Ok<T> = { outcome: "ok"; data: T };
type NotOk =
	| { outcome: "cursor-invalid"; reason: string }
	| { outcome: "unauthorized"; reason: string }
	| { outcome: "rate-limited"; reason: string; retryAfterMs: number }
	| { outcome: "failed"; reason: string; retryable: boolean };

const ok = <T>(data: T): Ok<T> => ({ outcome: "ok", data });

const row = {
	id: "sync-1",
	userId: "user-1",
	source: "outlook",
	cursor: "2025-08-01T00:00:00.000Z",
	autoCreate: true,
} as unknown as MailboxSync;

type Harness = {
	service: OutlookSyncService;
	stored: IncomingMessage[];
	settled: { cursor?: string | null }[];
	rateLimited: number[];
	reconnected: string[];
	failed: string[];
	meResolvedAt: { value: number };
};

function harness(options: {
	folder?: (name: string) => Ok<{ id?: string }> | NotOk;
	pages?: GraphMessage[][];
	meDelayMs?: number;
}): Harness {
	const stored: IncomingMessage[] = [];
	const settled: { cursor?: string | null }[] = [];
	const rateLimited: number[] = [];
	const reconnected: string[] = [];
	const failed: string[] = [];
	const meResolvedAt = { value: 0 };

	const pages = options.pages ?? [[]];
	let index = 0;

	const graph = {
		async me() {
			if (options.meDelayMs) {
				await new Promise((resolve) => setTimeout(resolve, options.meDelayMs));
			}
			meResolvedAt.value = Date.now();
			return ok({ mail: "rep@trycomp.ai" });
		},
		async folder(_token: string, name: string) {
			return options.folder
				? options.folder(name)
				: ok({ id: `folder-${name}` });
		},
		async listMessages() {
			index = 0;
			return ok({
				value: pages[0] ?? [],
				...(pages.length > 1 ? { "@odata.nextLink": "next-1" } : {}),
			});
		},
		async nextPage() {
			index += 1;
			return ok({
				value: pages[index] ?? [],
				...(index + 1 < pages.length
					? { "@odata.nextLink": `next-${index + 1}` }
					: {}),
			});
		},
	} as unknown as GraphClient;

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
		async store(_row: MailboxSync, _options: unknown, parsed: IncomingMessage) {
			stored.push(parsed);
			return true;
		},
	} as unknown as ThreadWriterService;

	return {
		service: new OutlookSyncService(graph, tokens, state, threads),
		stored,
		settled,
		rateLimited,
		reconnected,
		failed,
		meResolvedAt,
	};
}

const rowWith = (cursor: string | null): MailboxSync =>
	({ ...row, cursor }) as MailboxSync;

function message(overrides: Partial<GraphMessage> = {}): GraphMessage {
	return {
		id: "graph-1",
		internetMessageId: "<msg-1@acme.com>",
		conversationId: "conv-1",
		subject: "Pricing",
		from: { emailAddress: { name: "Jane", address: "jane@acme.com" } },
		toRecipients: [{ emailAddress: { address: "rep@trycomp.ai" } }],
		receivedDateTime: "2025-08-01T09:00:00.000Z",
		sentDateTime: "2025-08-01T09:00:00.000Z",
		body: { contentType: "text", content: "Hello" },
		parentFolderId: "folder-inbox",
		...overrides,
	};
}

describe("OutlookSyncService threading", () => {
	it("keeps a conversation together when Graph returns unrelated headers", async () => {
		const kit = harness({
			pages: [
				[
					message({
						id: "a",
						internetMessageId: "<first@acme.com>",
						internetMessageHeaders: [
							{ name: "x-ms-exchange-organization-authas", value: "Internal" },
							{ name: "Return-Path", value: "<jane@acme.com>" },
						],
					}),
					message({
						id: "b",
						internetMessageId: "<second@acme.com>",
						receivedDateTime: "2025-08-01T09:05:00.000Z",
						sentDateTime: "2025-08-01T09:05:00.000Z",
						internetMessageHeaders: [
							{ name: "Content-Type", value: "text/plain" },
						],
					}),
				],
			],
		});

		await kit.service.sync(row);

		expect(kit.stored.map((parsed) => parsed.rootId)).toEqual([
			"outlook-conversation:conv-1",
			"outlook-conversation:conv-1",
		]);
	});

	it("prefers a real threading header over the conversation id", async () => {
		const kit = harness({
			pages: [
				[
					message({
						internetMessageHeaders: [
							{ name: "Return-Path", value: "<jane@acme.com>" },
							{
								name: "References",
								value: "<root@acme.com> <second@acme.com>",
							},
						],
					}),
				],
			],
		});

		await kit.service.sync(row);

		expect(kit.stored[0]?.rootId).toBe("root@acme.com");
	});

	it("takes the first id when In-Reply-To carries a list", async () => {
		const kit = harness({
			pages: [
				[
					message({
						internetMessageHeaders: [
							{
								name: "In-Reply-To",
								value: "<root@acme.com> <second@acme.com>",
							},
						],
					}),
				],
			],
		});

		await kit.service.sync(row);

		expect(kit.stored[0]?.rootId).toBe("root@acme.com");
	});

	it("falls back to its own id only when there is no conversation", async () => {
		const kit = harness({
			pages: [[message({ conversationId: undefined })]],
		});

		await kit.service.sync(row);

		expect(kit.stored[0]?.rootId).toBe("msg-1@acme.com");
	});
});

describe("OutlookSyncService excluded folders", () => {
	it("defers the tick when a folder lookup is throttled", async () => {
		const kit = harness({
			folder: () => ({
				outcome: "rate-limited",
				reason: "Too many requests",
				retryAfterMs: 30_000,
			}),
			pages: [[message()]],
		});

		const outcome = await kit.service.sync(row);

		expect(outcome.status).toBe("rate-limited");
		expect(kit.rateLimited).toEqual([30_000]);
		expect(kit.stored).toHaveLength(0);
		expect(kit.settled).toHaveLength(0);
	});

	it("asks for a reconnect when a folder lookup is unauthorized", async () => {
		const kit = harness({
			folder: () => ({ outcome: "unauthorized", reason: "Invalid token" }),
			pages: [[message()]],
		});

		const outcome = await kit.service.sync(row);

		expect(outcome.status).toBe("reconnect");
		expect(kit.reconnected).toEqual(["Invalid token"]);
		expect(kit.stored).toHaveLength(0);
	});

	it("treats a 404 as a mailbox without that folder and carries on", async () => {
		const kit = harness({
			folder: (name) =>
				name === "junkemail"
					? { outcome: "cursor-invalid", reason: "Not found" }
					: ok({ id: "folder-deleteditems" }),
			pages: [
				[
					message({ parentFolderId: "folder-inbox" }),
					message({
						id: "deleted",
						internetMessageId: "<deleted@acme.com>",
						parentFolderId: "folder-deleteditems",
					}),
				],
			],
		});

		const outcome = await kit.service.sync(row);

		expect(outcome.status).toBe("synced");
		expect(kit.stored).toHaveLength(1);
	});
});

describe("OutlookSyncService budget", () => {
	const bulk = (count: number, offset: number): GraphMessage[] =>
		Array.from({ length: count }, (_, i) => {
			const n = offset + i;
			return message({
				id: `m-${n}`,
				internetMessageId: `<m-${n}@acme.com>`,
				conversationId: `conv-${n}`,
				receivedDateTime: new Date(
					Date.UTC(2025, 7, 1, 9, 0, 0) + n * 60_000,
				).toISOString(),
				sentDateTime: new Date(
					Date.UTC(2025, 7, 1, 9, 0, 0) + n * 60_000,
				).toISOString(),
			});
		});

	it("never processes more than the declared budget", async () => {
		const kit = harness({
			pages: [bulk(50, 0), bulk(50, 50), bulk(50, 100)],
		});

		await kit.service.sync(row);

		expect(kit.stored).toHaveLength(120);
	});

	it("leaves the cursor on the last message it actually processed", async () => {
		const kit = harness({
			pages: [bulk(50, 0), bulk(50, 50), bulk(50, 100)],
		});

		await kit.service.sync(row);

		const lastProcessed = new Date(
			Date.UTC(2025, 7, 1, 9, 0, 0) + 119 * 60_000,
		).toISOString();

		expect(kit.stored[119]?.rfcMessageId).toBe("m-119@acme.com");
		expect(kit.settled.at(-1)?.cursor).toBe(lastProcessed);
	});
});

describe("OutlookSyncService first run", () => {
	it("watermarks setup before the first round trip, not after", async () => {
		const kit = harness({ meDelayMs: 30 });

		await kit.service.sync(rowWith(null));

		const cursor = kit.settled.at(-1)?.cursor;
		expect(cursor).toBeTruthy();
		expect(new Date(String(cursor)).getTime()).toBeLessThan(
			kit.meResolvedAt.value - 20,
		);
	});
});
