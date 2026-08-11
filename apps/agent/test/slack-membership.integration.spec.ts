import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { db } from "@crm/db";
import { joinSlackChannel } from "../agent/lib/slack-membership";

const USER_ID = "slack-join-spec-user";
const ACCOUNT_ID = "slack-join-spec-account";
const CHANNEL_ID = "CJOINSPEC1";

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

beforeEach(async () => {
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
