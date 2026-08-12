import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { db } from "@crm/db";
import { joinSlackChannel } from "../agent/lib/slack-membership";

const USER_ID = "slack-join-spec-user";
const ACCOUNT_ID = "slack-join-spec-account";
const CHANNEL_ID = "CJOINSPEC1";
const GRANT_ID = "slack-join-spec-grant";
const INVENTORY_KIND = "slack-people-match";

const realFetch = globalThis.fetch;

async function connect() {
	await db.user.upsert({
		where: { id: USER_ID },
		create: {
			id: USER_ID,
			name: "Slack Join Spec",
			email: `${USER_ID}@example.com`,
		},
		update: {},
	});
	await db.account.upsert({
		where: { id: ACCOUNT_ID },
		create: {
			id: ACCOUNT_ID,
			accountId: "T-JOIN-SPEC",
			providerId: "slack",
			userId: USER_ID,
			accessToken: "xoxb-join-spec",
		},
		update: { accessToken: "xoxb-join-spec" },
	});
}

function answers(error: string) {
	globalThis.fetch = (async () =>
		new Response(JSON.stringify({ ok: false, error }), {
			headers: { "content-type": "application/json" },
		})) as typeof fetch;
}

const requested: string[] = [];

function replies(reply: (url: string) => object) {
	globalThis.fetch = (async (input: URL | RequestInfo) => {
		const url = String(input instanceof Request ? input.url : input);
		requested.push(url);
		return new Response(JSON.stringify(reply(url)), {
			headers: { "content-type": "application/json" },
		});
	}) as typeof fetch;
}

let inventoryTaskIds: string[] = [];

beforeEach(async () => {
	requested.length = 0;
	inventoryTaskIds = (
		await db.agentTask.findMany({
			where: { kind: INVENTORY_KIND },
			select: { id: true },
		})
	).map((task) => task.id);
	await db.slackChannel.deleteMany({ where: { id: CHANNEL_ID } });
	await connect();
	await db.slackChannel.create({
		data: {
			id: CHANNEL_ID,
			name: "join-spec",
			isPrivate: false,
			isMember: false,
			available: true,
		},
	});
});

afterEach(async () => {
	globalThis.fetch = realFetch;
	await db.slackChannel.deleteMany({ where: { id: CHANNEL_ID } });
	await db.slackWorkspaceGrant.deleteMany({ where: { id: GRANT_ID } });
	await db.agentTask.deleteMany({
		where: { kind: INVENTORY_KIND, id: { notIn: inventoryTaskIds } },
	});
	await db.account.deleteMany({ where: { id: ACCOUNT_ID } });
	await db.user.deleteMany({ where: { id: USER_ID } });
});

describe("joining a Slack channel", () => {
	it("does not claim membership of an archived channel", async () => {
		answers("is_archived");

		const outcome = await joinSlackChannel(CHANNEL_ID);

		expect(outcome.joined).toBe(false);
		expect(outcome).toMatchObject({ needsHuman: true });

		const row = await db.slackChannel.findUnique({
			where: { id: CHANNEL_ID },
			select: { isMember: true },
		});
		expect(row?.isMember).toBe(false);
	});

	it("reads the channel from Slack rather than a row the migration reset", async () => {
		replies((url) =>
			url.includes("conversations.info")
				? { ok: true, channel: { is_private: true, is_member: true } }
				: { ok: false, error: "method_not_supported_for_channel_type" },
		);

		const outcome = await joinSlackChannel(CHANNEL_ID);

		expect(outcome).toEqual({ joined: true, already: true });
		expect(requested.some((url) => url.includes("conversations.join"))).toBe(
			false,
		);
		expect(
			await db.slackChannel.findUnique({
				where: { id: CHANNEL_ID },
				select: { isPrivate: true, isMember: true },
			}),
		).toEqual({ isPrivate: true, isMember: true });
		expect(
			await db.agentTask.count({
				where: { kind: INVENTORY_KIND, id: { notIn: inventoryTaskIds } },
			}),
		).toBe(1);
	});

	it("invites itself to a private channel a stale row calls public", async () => {
		await db.slackWorkspaceGrant.create({
			data: {
				id: GRANT_ID,
				teamId: "T-JOIN-SPEC",
				userToken: "xoxp-join-spec",
				userScopes: "groups:write",
			},
		});
		replies((url) => {
			if (url.includes("conversations.info")) {
				return { ok: false, error: "channel_not_found" };
			}
			if (url.includes("auth.test")) return { ok: true, user_id: "U-JOIN" };
			return { ok: true };
		});

		const outcome = await joinSlackChannel(CHANNEL_ID);

		expect(outcome).toEqual({ joined: true, already: false });
		expect(requested.some((url) => url.includes("conversations.invite"))).toBe(
			true,
		);
		expect(requested.some((url) => url.includes("conversations.join"))).toBe(
			false,
		);
		expect(
			await db.slackChannel.findUnique({
				where: { id: CHANNEL_ID },
				select: { isPrivate: true, isMember: true },
			}),
		).toEqual({ isPrivate: true, isMember: true });
	});

	it("accepts a channel Slack says it is already in", async () => {
		answers("already_in_channel");

		const outcome = await joinSlackChannel(CHANNEL_ID);

		expect(outcome).toEqual({ joined: true, already: true });

		const row = await db.slackChannel.findUnique({
			where: { id: CHANNEL_ID },
			select: { isMember: true },
		});
		expect(row?.isMember).toBe(true);
	});
});
