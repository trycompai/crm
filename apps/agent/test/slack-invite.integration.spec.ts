import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { db } from "@crm/db";
import { inviteToSlackChannel } from "../agent/lib/slack-invite";

const USER_ID = "slack-invite-spec-user";
const ACCOUNT_ID = "slack-invite-spec-account";
const CHANNEL_ID = "CINVITESPEC1";

const realFetch = globalThis.fetch;
const requested: { url: string; body: unknown }[] = [];

function replies(reply: (url: string) => object) {
	globalThis.fetch = (async (input: URL | RequestInfo, init?: RequestInit) => {
		const url = String(input instanceof Request ? input.url : input);
		requested.push({
			url,
			body: init?.body ? JSON.parse(String(init.body)) : null,
		});
		return new Response(JSON.stringify(reply(url)), {
			headers: { "content-type": "application/json" },
		});
	}) as typeof fetch;
}

const sent = (fragment: string) =>
	requested.find((call) => call.url.includes(fragment));

beforeEach(async () => {
	requested.length = 0;
	await db.user.upsert({
		where: { id: USER_ID },
		create: {
			id: USER_ID,
			name: "Slack Invite Spec",
			email: `${USER_ID}@example.com`,
		},
		update: {},
	});
	await db.account.upsert({
		where: { id: ACCOUNT_ID },
		create: {
			id: ACCOUNT_ID,
			accountId: "T-INVITE-SPEC",
			providerId: "slack",
			userId: USER_ID,
			accessToken: "xoxb-invite-spec",
		},
		update: { accessToken: "xoxb-invite-spec" },
	});
});

afterEach(async () => {
	globalThis.fetch = realFetch;
	await db.account.deleteMany({ where: { id: ACCOUNT_ID } });
	await db.user.deleteMany({ where: { id: USER_ID } });
});

describe("inviting somebody to a channel", () => {
	it("adds a colleague straight away, because Slack already knows them", async () => {
		replies((url) =>
			url.includes("users.lookupByEmail")
				? { ok: true, user: { id: "U7" } }
				: { ok: true },
		);

		const outcome = await inviteToSlackChannel(CHANNEL_ID, "rep@ours.test");

		expect(outcome).toEqual({
			invited: true,
			email: "rep@ours.test",
			kind: "member",
		});
		expect(sent("conversations.invite")?.body).toMatchObject({
			channel: CHANNEL_ID,
			users: "U7",
		});
		expect(sent("conversations.inviteShared")).toBeUndefined();
	});

	it("sends a Slack Connect invitation to somebody outside the workspace", async () => {
		replies((url) =>
			url.includes("users.lookupByEmail")
				? { ok: false, error: "users_not_found" }
				: { ok: true, invite_id: "I1", url: "https://slack.com/invite/abc" },
		);

		const outcome = await inviteToSlackChannel(
			CHANNEL_ID,
			"buyer@customer.test",
		);

		expect(outcome).toMatchObject({
			invited: true,
			kind: "connect",
			invite_id: "I1",
			url: "https://slack.com/invite/abc",
		});
		expect(sent("conversations.inviteShared")?.body).toMatchObject({
			channel: CHANNEL_ID,
			emails: ["buyer@customer.test"],
			external_limited: false,
		});
	});

	it("keeps invite_id when Slack withholds the url", async () => {
		replies((url) =>
			url.includes("users.lookupByEmail")
				? { ok: false, error: "users_not_found" }
				: { ok: true, invite_id: "I1" },
		);

		const outcome = await inviteToSlackChannel(
			CHANNEL_ID,
			"buyer@customer.test",
		);

		expect(outcome).toEqual({
			invited: true,
			email: "buyer@customer.test",
			kind: "connect",
			invite_id: "I1",
			url: undefined,
		});
		expect(sent("conversations.inviteShared")?.body).toMatchObject({
			channel: CHANNEL_ID,
			emails: ["buyer@customer.test"],
			external_limited: false,
		});
	});

	it("treats somebody already in the channel as invited, so a retry is quiet", async () => {
		replies((url) =>
			url.includes("users.lookupByEmail")
				? { ok: true, user: { id: "U7" } }
				: { ok: false, error: "already_in_channel" },
		);

		const outcome = await inviteToSlackChannel(CHANNEL_ID, "rep@ours.test");

		expect(outcome).toMatchObject({ invited: true, kind: "member" });
	});

	it("says the workspace refused, rather than claiming the invitation went", async () => {
		replies((url) =>
			url.includes("users.lookupByEmail")
				? { ok: false, error: "users_not_found" }
				: { ok: false, error: "restricted_action" },
		);

		const outcome = await inviteToSlackChannel(
			CHANNEL_ID,
			"buyer@customer.test",
		);

		expect(outcome.invited).toBe(false);
		expect(outcome).toMatchObject({
			reason: expect.stringContaining(
				"This workspace doesn't let Comp AI send that invitation.",
			),
		});
	});

	it("stops on a lookup failure that is not a missing person", async () => {
		replies(() => ({ ok: false, error: "invalid_auth" }));

		const outcome = await inviteToSlackChannel(CHANNEL_ID, "rep@ours.test");

		expect(outcome.invited).toBe(false);
		expect(outcome).toMatchObject({
			reason: expect.stringContaining("reconnected"),
		});
		expect(sent("conversations.inviteShared")).toBeUndefined();
	});

	it("refuses when Slack is not connected at all", async () => {
		await db.account.deleteMany({ where: { id: ACCOUNT_ID } });

		const outcome = await inviteToSlackChannel(CHANNEL_ID, "rep@ours.test");

		expect(outcome).toMatchObject({
			invited: false,
			reason: "Slack is not connected.",
		});
	});
});
