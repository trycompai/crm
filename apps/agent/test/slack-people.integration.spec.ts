import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { db } from "@crm/db";
import {
	persistSlackChannels,
	refreshSlackChannels,
} from "../agent/lib/slack-people";

const USER_ID = "slack-people-spec-user";
const ACCOUNT_ID = "slack-people-spec-account";
const PREFIX = "CSPEC";

const realFetch = globalThis.fetch;

let restore: Array<{ id: string; available: boolean }> = [];

async function connect() {
	await db.user.upsert({
		where: { id: USER_ID },
		create: {
			id: USER_ID,
			name: "Slack Spec",
			email: `${USER_ID}@example.com`,
		},
		update: {},
	});
	await db.account.upsert({
		where: { id: ACCOUNT_ID },
		create: {
			id: ACCOUNT_ID,
			accountId: "T-SPEC",
			providerId: "slack",
			userId: USER_ID,
			accessToken: "xoxb-spec",
		},
		update: { accessToken: "xoxb-spec" },
	});
}

async function disconnect() {
	await db.account.deleteMany({ where: { providerId: "slack" } });
	await db.slackChannel.deleteMany({ where: { id: { startsWith: PREFIX } } });
}

beforeEach(async () => {
	restore = await db.slackChannel.findMany({
		select: { id: true, available: true },
	});
	await db.slackChannel.deleteMany({ where: { id: { startsWith: PREFIX } } });
	await connect();
});

afterEach(async () => {
	globalThis.fetch = realFetch;
	await db.slackChannel.deleteMany({ where: { id: { startsWith: PREFIX } } });
	await db.account.deleteMany({ where: { id: ACCOUNT_ID } });
	await db.user.deleteMany({ where: { id: USER_ID } });
	for (const row of restore) {
		await db.slackChannel.updateMany({
			where: { id: row.id },
			data: { available: row.available },
		});
	}
});

function slackReply(body: unknown): Response {
	return new Response(JSON.stringify(body), {
		status: 200,
		headers: { "content-type": "application/json" },
	});
}

describe("persistSlackChannels", () => {
	it("creates, updates and retires the inventory in one pass", async () => {
		await db.slackChannel.create({
			data: {
				id: `${PREFIX}-keep`,
				name: "old-name",
				memberCount: 1,
				available: false,
			},
		});
		await db.slackChannel.create({
			data: { id: `${PREFIX}-gone`, name: "gone", available: true },
		});

		const written = await persistSlackChannels(
			[
				{
					id: `${PREFIX}-keep`,
					name: "keep",
					num_members: 12,
					is_member: true,
				},
				{
					id: `${PREFIX}-new`,
					name: "new",
					num_members: 3,
					is_private: true,
					is_member: false,
				},
				{ id: `${PREFIX}-quiet`, name: "quiet", is_member: true },
				{ id: `${PREFIX}-archived`, name: "archived", is_archived: true },
			],
			true,
		);

		expect(written).toBe(3);

		const rows = await db.slackChannel.findMany({
			where: { id: { startsWith: PREFIX } },
			orderBy: { id: "asc" },
			select: {
				id: true,
				name: true,
				memberCount: true,
				isPrivate: true,
				isMember: true,
				available: true,
			},
		});

		expect(rows).toEqual([
			{
				id: `${PREFIX}-gone`,
				name: "gone",
				memberCount: null,
				isPrivate: false,
				isMember: false,
				available: false,
			},
			{
				id: `${PREFIX}-keep`,
				name: "keep",
				memberCount: 12,
				isPrivate: false,
				isMember: true,
				available: true,
			},
			{
				id: `${PREFIX}-new`,
				name: "new",
				memberCount: 3,
				isPrivate: true,
				isMember: false,
				available: true,
			},
			{
				id: `${PREFIX}-quiet`,
				name: "quiet",
				memberCount: null,
				isPrivate: false,
				isMember: true,
				available: true,
			},
		]);
	});

	it("retires every channel when nothing is available", async () => {
		await db.slackChannel.create({
			data: { id: `${PREFIX}-only`, name: "only", available: true },
		});

		expect(await persistSlackChannels([], false)).toBe(0);

		const row = await db.slackChannel.findUnique({
			where: { id: `${PREFIX}-only` },
			select: { available: true },
		});
		expect(row?.available).toBe(false);
	});

	it("writes nothing when Slack is disconnected", async () => {
		await disconnect();

		const written = await persistSlackChannels(
			[{ id: `${PREFIX}-ghost`, name: "ghost", is_member: true }],
			false,
		);

		expect(written).toBe(0);
		expect(
			await db.slackChannel.count({ where: { id: `${PREFIX}-ghost` } }),
		).toBe(0);
	});
});

describe("refreshSlackChannels", () => {
	it("aborts a stalled Slack list request", async () => {
		let signal: AbortSignal | null = null;
		globalThis.fetch = (async (_input: unknown, init?: RequestInit) => {
			signal = init?.signal ?? null;
			return slackReply({ ok: true, channels: [] });
		}) as typeof fetch;

		await refreshSlackChannels();

		expect(signal).toBeInstanceOf(AbortSignal);
	});

	it("follows the cursor across pages", async () => {
		const seen: string[] = [];
		globalThis.fetch = (async (input: URL) => {
			const cursor = input.searchParams.get("cursor") ?? "";
			seen.push(cursor);
			if (cursor === "") {
				return slackReply({
					ok: true,
					channels: [
						{ id: `${PREFIX}-a`, name: "a", is_member: true, unknown: 1 },
					],
					response_metadata: { next_cursor: "page-2" },
				});
			}
			return slackReply({
				ok: true,
				channels: [{ id: `${PREFIX}-b`, name: "b", is_member: true }],
				response_metadata: { next_cursor: "" },
			});
		}) as unknown as typeof fetch;

		expect(await refreshSlackChannels()).toBe(2);
		expect([...new Set(seen)]).toEqual(["", "page-2"]);
	});

	it("does not resurrect the inventory a disconnect removed", async () => {
		globalThis.fetch = (async () => {
			await disconnect();
			return slackReply({
				ok: true,
				channels: [{ id: `${PREFIX}-late`, name: "late", is_member: true }],
			});
		}) as typeof fetch;

		expect(await refreshSlackChannels()).toBe(0);
		expect(
			await db.slackChannel.count({ where: { id: { startsWith: PREFIX } } }),
		).toBe(0);
	});

	it("explains a rejected list", async () => {
		globalThis.fetch = (async () =>
			slackReply({ ok: false, error: "missing_scope" })) as typeof fetch;

		expect(refreshSlackChannels()).rejects.toThrow(
			"Slack channel lookup needs an additional permission. Reconnect Slack and retry.",
		);
	});
});
