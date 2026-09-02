import {
	afterAll,
	beforeAll,
	beforeEach,
	describe,
	expect,
	it,
} from "bun:test";
import { db } from "@crm/db";
import { channelOfRun } from "../agent/lib/run-resume";
import {
	inviteToRunSlackChannel,
	openRunSlackChannel,
} from "../agent/lib/run-runtime";

const suffix = crypto.randomUUID();
const userId = `slack-actions-user-${suffix}`;
const accountId = `slack-actions-account-${suffix}`;

const realFetch = globalThis.fetch;
let created = 0;

function slackReplies(reply: (url: string) => object) {
	globalThis.fetch = (async (input: URL | RequestInfo) => {
		const url = String(input instanceof Request ? input.url : input);
		return new Response(JSON.stringify(reply(url)), {
			headers: { "content-type": "application/json" },
		});
	}) as typeof fetch;
}

const slackManifest = (actions: unknown[]) => ({
	triggers: [
		{ type: "MANUAL", name: "Run now", summary: "Run on demand", config: {} },
	],
	dataScope: {
		mode: "WORKSPACE",
		summary: "Workspace CRM records",
		resources: [{ kind: "integration", id: "slack:workspace", label: "Slack" }],
	},
	actions,
});

const openAction = {
	type: "slack.channel.open",
	provider: "slack",
	summary: "Open the customer channel",
};
const inviteAction = {
	type: "slack.channel.invite",
	provider: "slack",
	summary: "Invite the buyer",
};
const summaryAction = {
	type: "run.summary",
	provider: "crm",
	summary: "Say what happened",
};

let agentId = "";

async function makeRun(actions: unknown[]) {
	const unique = crypto.randomUUID();
	const version = await db.agentVersion.create({
		data: {
			agentId,
			number: (await db.agentVersion.count({ where: { agentId } })) + 1,
			status: "DEPLOYED",
			createdById: userId,
			instructions: "x",
			manifest: slackManifest(actions),
			modelId: "m",
			sandboxPolicy: {},
		},
		select: { id: true },
	});
	const run = await db.agentRun.create({
		data: {
			agentId,
			versionId: version.id,
			status: "RUNNING",
			triggerType: "MANUAL",
			idempotencyKey: `sca-${unique}`,
			correlationId: `sca-${unique}`,
			sessionId: `ses_${unique}`,
		},
		select: { id: true },
	});
	return run.id;
}

beforeAll(async () => {
	await db.user.create({
		data: {
			id: userId,
			name: "Slack Actions",
			email: `${userId}@example.test`,
		},
	});
	const agent = await db.agentDefinition.create({
		data: {
			name: `Slack actions ${suffix}`,
			status: "LIVE",
			createdById: userId,
		},
		select: { id: true },
	});
	agentId = agent.id;
	await db.account.create({
		data: {
			id: accountId,
			accountId: `T-${suffix}`,
			providerId: "slack",
			userId,
			accessToken: "xoxb-slack-actions",
		},
	});
});

afterAll(async () => {
	globalThis.fetch = realFetch;
	await db.agentAction.deleteMany({ where: { agentId } });
	await db.agentRun.deleteMany({ where: { agentId } });
	await db.agentDefinition.updateMany({
		where: { id: agentId },
		data: { currentVersionId: null },
	});
	await db.agentVersion.deleteMany({ where: { agentId } });
	await db.agentDefinition.deleteMany({ where: { id: agentId } });
	await db.account.deleteMany({ where: { id: accountId } });
	await db.user.deleteMany({ where: { id: userId } });
});

beforeEach(() => {
	created = 0;
	globalThis.fetch = realFetch;
});

describe("opening a channel as a deployed run", () => {
	it("refuses when the version does not approve opening a channel", async () => {
		const runId = await makeRun([summaryAction]);

		await expect(
			openRunSlackChannel(runId, "call-1", {
				name: "Acme onboarding",
				isPrivate: false,
			}),
		).rejects.toThrow("does not allow slack.channel.open");
	});

	it("opens the channel and makes the run watch it", async () => {
		const runId = await makeRun([openAction, summaryAction]);
		const channelId = `C-${crypto.randomUUID()}`;
		slackReplies(() => {
			created += 1;
			return { ok: true, channel: { id: channelId, name: "acme-onboarding" } };
		});

		const outcome = await openRunSlackChannel(runId, "call-1", {
			name: "Acme Onboarding",
			isPrivate: false,
		});

		expect(outcome).toMatchObject({
			channelId,
			channelName: "acme-onboarding",
			watching: true,
			replayed: false,
		});
		expect(await channelOfRun(runId)).toBe(channelId);
		await db.slackChannel.deleteMany({ where: { id: channelId } });
	});

	it("replays the same call instead of opening a second channel", async () => {
		const runId = await makeRun([openAction, summaryAction]);
		const channelId = `C-${crypto.randomUUID()}`;
		slackReplies(() => {
			created += 1;
			return { ok: true, channel: { id: channelId, name: "acme-onboarding" } };
		});

		await openRunSlackChannel(runId, "call-1", {
			name: "Acme Onboarding",
			isPrivate: false,
		});
		const again = await openRunSlackChannel(runId, "call-1", {
			name: "Acme Onboarding",
			isPrivate: false,
		});

		expect(again.replayed).toBe(true);
		expect(again.channelId).toBe(channelId);
		expect(created).toBe(1);
		await db.slackChannel.deleteMany({ where: { id: channelId } });
	});

	it("adds the deal owner when Slack knows them", async () => {
		const dealId = `deal-${crypto.randomUUID()}`;
		const company = await db.company.create({
			data: { name: `Owner Co ${suffix}`, domain: `${dealId}.test` },
			select: { id: true },
		});
		await db.deal.create({
			data: {
				id: dealId,
				name: "Owner deal",
				stage: "CLOSED_WON",
				companyId: company.id,
				ownerId: userId,
				amount: 1,
				currency: "USD",
			},
		});
		await db.slackMemberMatch.create({
			data: { crmUserId: userId, slackUserId: "U-OWNER" },
		});

		const runId = await makeRun([openAction, summaryAction]);
		await db.agentRun.update({
			where: { id: runId },
			data: { input: { record: { kind: "deal", id: dealId } } },
		});

		const channelId = `C-${crypto.randomUUID()}`;
		const invited: unknown[] = [];
		globalThis.fetch = (async (
			input: URL | RequestInfo,
			init?: RequestInit,
		) => {
			const url = String(input instanceof Request ? input.url : input);
			if (url.includes("conversations.invite")) {
				invited.push(JSON.parse(String(init?.body)));
			}
			return new Response(
				JSON.stringify(
					url.includes("conversations.create")
						? { ok: true, channel: { id: channelId, name: "owner-co" } }
						: { ok: true },
				),
				{ headers: { "content-type": "application/json" } },
			);
		}) as typeof fetch;

		const outcome = await openRunSlackChannel(runId, "call-1", {
			name: "Owner Co",
			isPrivate: false,
		});

		expect(outcome.owner).toMatchObject({
			added: true,
			slackUserId: "U-OWNER",
		});
		expect(invited).toEqual([{ channel: channelId, users: "U-OWNER" }]);

		await db.slackChannel.deleteMany({ where: { id: channelId } });
		await db.slackMemberMatch.deleteMany({ where: { crmUserId: userId } });
		await db.deal.deleteMany({ where: { id: dealId } });
		await db.company.deleteMany({ where: { id: company.id } });
	});

	it("refuses a name with nothing Slack accepts", async () => {
		const runId = await makeRun([openAction, summaryAction]);

		await expect(
			openRunSlackChannel(runId, "call-1", {
				name: "!!! ---",
				isPrivate: false,
			}),
		).rejects.toThrow("no letters or numbers");
	});
});

describe("inviting people as a deployed run", () => {
	it("refuses before a channel exists, rather than inviting nobody", async () => {
		const runId = await makeRun([inviteAction, summaryAction]);

		await expect(
			inviteToRunSlackChannel(runId, "call-1", { emails: ["buyer@x.test"] }),
		).rejects.toThrow("no Slack channel yet");
	});

	it("invites into the channel the run opened", async () => {
		const runId = await makeRun([openAction, inviteAction, summaryAction]);
		const channelId = `C-${crypto.randomUUID()}`;
		const posted: { url: string; body: unknown }[] = [];
		globalThis.fetch = (async (
			input: URL | RequestInfo,
			init?: RequestInit,
		) => {
			const url = String(input instanceof Request ? input.url : input);
			posted.push({
				url,
				body: init?.body ? JSON.parse(String(init.body)) : null,
			});
			return new Response(
				JSON.stringify(
					url.includes("conversations.create")
						? { ok: true, channel: { id: channelId, name: "acme-onboarding" } }
						: url.includes("users.lookupByEmail")
							? { ok: false, error: "users_not_found" }
							: {
									ok: true,
									invite_id: "I1",
									url: "https://slack.com/invite/x",
								},
				),
				{ headers: { "content-type": "application/json" } },
			);
		}) as typeof fetch;

		await openRunSlackChannel(runId, "open-1", {
			name: "Acme Onboarding",
			isPrivate: false,
		});
		const outcome = await inviteToRunSlackChannel(runId, "invite-1", {
			emails: ["buyer@customer.test"],
		});

		expect(outcome).toMatchObject({
			channelId,
			replayed: false,
			result: {
				type: "slack.channel.invite",
				invite_id: "I1",
				url: "https://slack.com/invite/x",
				email: "buyer@customer.test",
				kind: "connect",
			},
		});
		expect(outcome.invited).toHaveLength(1);
		expect(outcome.invited?.[0]).toMatchObject({
			invite_id: "I1",
			url: "https://slack.com/invite/x",
		});
		expect(
			posted.find((call) => call.url.includes("conversations.inviteShared"))
				?.body,
		).toMatchObject({
			channel: channelId,
			emails: ["buyer@customer.test"],
			external_limited: false,
		});

		const row = await db.agentAction.findFirst({
			where: { runId, type: "slack.channel.invite" },
			select: { externalId: true, result: true },
		});
		expect(row?.externalId).toBe("I1");
		expect(row?.result).toMatchObject({
			type: "slack.channel.invite",
			invite_id: "I1",
			url: "https://slack.com/invite/x",
			email: "buyer@customer.test",
			kind: "connect",
		});

		const replay = await inviteToRunSlackChannel(runId, "invite-1", {
			emails: ["buyer@customer.test"],
		});
		expect(replay).toMatchObject({
			channelId,
			replayed: true,
			result: {
				type: "slack.channel.invite",
				invite_id: "I1",
				url: "https://slack.com/invite/x",
				email: "buyer@customer.test",
				kind: "connect",
			},
		});
		await db.slackChannel.deleteMany({ where: { id: channelId } });
	});

	it("fails the action when Slack refuses every address", async () => {
		const runId = await makeRun([openAction, inviteAction, summaryAction]);
		const channelId = `C-${crypto.randomUUID()}`;
		slackReplies((url) =>
			url.includes("conversations.create")
				? { ok: true, channel: { id: channelId, name: "acme-onboarding" } }
				: url.includes("users.lookupByEmail")
					? { ok: false, error: "users_not_found" }
					: { ok: false, error: "restricted_action" },
		);

		await openRunSlackChannel(runId, "open-1", {
			name: "Acme Onboarding",
			isPrivate: false,
		});

		await expect(
			inviteToRunSlackChannel(runId, "invite-1", {
				emails: ["buyer@customer.test"],
			}),
		).rejects.toThrow(
			"This workspace doesn't let Comp AI send that invitation.",
		);

		const action = await db.agentAction.findFirst({
			where: { runId, type: "slack.channel.invite" },
			select: { status: true },
		});
		expect(action?.status).toBe("FAILED");
		await db.slackChannel.deleteMany({ where: { id: channelId } });
	});
});
