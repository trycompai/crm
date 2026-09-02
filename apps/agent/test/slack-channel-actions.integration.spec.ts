import {
	afterAll,
	afterEach,
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
	postRunSlackMessage,
} from "../agent/lib/run-runtime";

const suffix = crypto.randomUUID();
const userId = `slack-actions-user-${suffix}`;
const accountId = `slack-actions-account-${suffix}`;

const realFetch = globalThis.fetch;
let created = 0;

const channelIds: string[] = [];
const dealIds: string[] = [];
const companyIds: string[] = [];
const unexpected: string[] = [];

function newChannelId() {
	const id = `C-${crypto.randomUUID()}`;
	channelIds.push(id);
	return id;
}

type SlackReply = {
	ok: boolean;
	error?: string;
	channel?: { id: string; name: string } | string;
	ts?: string;
	invite_id?: string;
	url?: string;
};

function jsonReply(reply: SlackReply) {
	return new Response(JSON.stringify(reply), {
		headers: { "content-type": "application/json" },
	});
}

async function refusal(work: Promise<unknown>): Promise<string> {
	try {
		await work;
	} catch (error) {
		return error instanceof Error ? error.message : String(error);
	}
	return "";
}

function slackReplies(reply: (url: string) => SlackReply) {
	globalThis.fetch = (async (input: URL | RequestInfo) => {
		const url = String(input instanceof Request ? input.url : input);
		return jsonReply(reply(url));
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
const postRunChannelAction = {
	type: "slack.message.post",
	provider: "slack",
	summary: "Greet them in the channel this run opened",
	destination: { kind: "channel", resolution: "run-channel" },
};
const postChosenAction = {
	type: "slack.message.post",
	provider: "slack",
	summary: "Tell sales",
	destination: {
		kind: "channel",
		resolution: "chosen",
		id: "C-SALES",
		label: "#sales",
	},
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
	await db.slackChannel.deleteMany({ where: { id: { in: channelIds } } });
	await db.slackMemberMatch.deleteMany({ where: { crmUserId: userId } });
	await db.deal.deleteMany({ where: { id: { in: dealIds } } });
	await db.company.deleteMany({ where: { id: { in: companyIds } } });
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
	unexpected.length = 0;
	slackReplies((url) => {
		unexpected.push(url);
		return { ok: false, error: "unexpected_slack_call" };
	});
});

afterEach(() => {
	expect(unexpected).toEqual([]);
});

describe("opening a channel as a deployed run", () => {
	it("refuses when the version does not approve opening a channel", async () => {
		const runId = await makeRun([summaryAction]);

		expect(
			await refusal(
				openRunSlackChannel(runId, "call-1", {
					name: "Acme onboarding",
					isPrivate: false,
				}),
			),
		).toContain("does not allow slack.channel.open");
	});

	it("opens the channel and makes the run watch it", async () => {
		const runId = await makeRun([openAction, summaryAction]);
		const channelId = newChannelId();
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
	});

	it("replays the same call instead of opening a second channel", async () => {
		const runId = await makeRun([openAction, summaryAction]);
		const channelId = newChannelId();
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
	});

	it("keeps the channel the run owns instead of opening a second one", async () => {
		const runId = await makeRun([openAction, summaryAction]);
		const first = newChannelId();
		const second = newChannelId();
		let next = first;
		slackReplies((url) => {
			if (!url.includes("conversations.create")) return { ok: true };
			created += 1;
			return {
				ok: true,
				channel: {
					id: next,
					name: next === first ? "acme-onboarding" : "acme-billing",
				},
			};
		});

		await openRunSlackChannel(runId, "open-1", {
			name: "Acme Onboarding",
			isPrivate: false,
		});
		next = second;
		const again = await openRunSlackChannel(runId, "open-2", {
			name: "Acme Billing",
			isPrivate: false,
		});

		expect(created).toBe(1);
		expect(again).toMatchObject({
			channelId: first,
			channelName: "acme-onboarding",
			watching: true,
		});
		expect(await channelOfRun(runId)).toBe(first);

		const stored = await db.slackChannel.findMany({
			where: { id: { in: [first, second] } },
			select: { id: true },
		});
		expect(stored.map((row) => row.id)).toEqual([first]);

		const action = await db.agentAction.findUnique({
			where: { idempotencyKey: `${runId}:open-2` },
			select: { status: true, externalId: true },
		});
		expect(action).toMatchObject({ status: "SUCCEEDED", externalId: first });
	});

	it("refuses to reuse the channel it owns once that channel is archived", async () => {
		const runId = await makeRun([openAction, summaryAction]);
		const channelId = newChannelId();
		slackReplies((url) => {
			if (!url.includes("conversations.create")) return { ok: true };
			created += 1;
			return { ok: true, channel: { id: channelId, name: "acme-onboarding" } };
		});

		await openRunSlackChannel(runId, "open-1", {
			name: "Acme Onboarding",
			isPrivate: false,
		});
		await db.slackChannel.update({
			where: { id: channelId },
			data: { available: false },
		});

		const message = await refusal(
			openRunSlackChannel(runId, "open-2", {
				name: "Acme Billing",
				isPrivate: false,
			}),
		);

		expect(message).toContain("cannot reach that channel");
		expect(created).toBe(1);
		expect(await channelOfRun(runId)).toBe(channelId);
	});

	it("refuses to reuse the channel it owns once it cannot post there", async () => {
		const runId = await makeRun([openAction, summaryAction]);
		const channelId = newChannelId();
		slackReplies((url) => {
			if (url.includes("conversations.create")) {
				created += 1;
				return {
					ok: true,
					channel: { id: channelId, name: "acme-onboarding" },
				};
			}
			if (url.includes("conversations.join")) {
				return { ok: false, error: "channel_not_found" };
			}
			if (url.includes("conversations.info")) return { ok: false };
			return { ok: true };
		});

		await openRunSlackChannel(runId, "open-1", {
			name: "Acme Onboarding",
			isPrivate: false,
		});
		await db.slackChannel.update({
			where: { id: channelId },
			data: { isMember: false },
		});

		const message = await refusal(
			openRunSlackChannel(runId, "open-2", {
				name: "Acme Billing",
				isPrivate: false,
			}),
		);

		expect(message).toContain("cannot post there");
		expect(created).toBe(1);
	});

	it("adds the deal owner when Slack knows them", async () => {
		const dealId = `deal-${crypto.randomUUID()}`;
		dealIds.push(dealId);
		const company = await db.company.create({
			data: { name: `Owner Co ${suffix}`, domain: `${dealId}.test` },
			select: { id: true },
		});
		companyIds.push(company.id);
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

		const channelId = newChannelId();
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
	});

	it("refuses a name with nothing Slack accepts", async () => {
		const runId = await makeRun([openAction, summaryAction]);

		expect(
			await refusal(
				openRunSlackChannel(runId, "call-1", {
					name: "!!! ---",
					isPrivate: false,
				}),
			),
		).toContain("no letters or numbers");
	});
});

describe("inviting people as a deployed run", () => {
	it("refuses before a channel exists, rather than inviting nobody", async () => {
		const runId = await makeRun([inviteAction, summaryAction]);

		expect(
			await refusal(
				inviteToRunSlackChannel(runId, "call-1", { emails: ["buyer@x.test"] }),
			),
		).toContain("hasn't opened a Slack channel yet");
	});

	it("invites into the channel the run opened", async () => {
		const runId = await makeRun([openAction, inviteAction, summaryAction]);
		const channelId = newChannelId();
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
	});

	it("stops the rest of the invitations when the run is cancelled", async () => {
		const runId = await makeRun([openAction, inviteAction, summaryAction]);
		const channelId = newChannelId();
		const asked: string[] = [];
		globalThis.fetch = (async (
			input: URL | RequestInfo,
			init?: RequestInit,
		) => {
			const url = String(input instanceof Request ? input.url : input);
			if (url.includes("conversations.inviteShared")) {
				const body = JSON.parse(String(init?.body));
				asked.push(String(body.emails[0]));
				await db.agentRun.update({
					where: { id: runId },
					data: { status: "CANCELLED" },
				});
				return jsonReply({
					ok: true,
					invite_id: "I1",
					url: "https://slack.com/invite/x",
				});
			}
			if (url.includes("conversations.create")) {
				return jsonReply({
					ok: true,
					channel: { id: channelId, name: "acme-onboarding" },
				});
			}
			if (url.includes("users.lookupByEmail")) {
				return jsonReply({ ok: false, error: "users_not_found" });
			}
			return jsonReply({ ok: true });
		}) as typeof fetch;

		await openRunSlackChannel(runId, "open-1", {
			name: "Acme Onboarding",
			isPrivate: false,
		});

		expect(
			await refusal(
				inviteToRunSlackChannel(runId, "invite-1", {
					emails: ["first@customer.test", "second@customer.test"],
				}),
			),
		).toBe("This agent run is not active.");
		expect(asked).toEqual(["first@customer.test"]);
	});

	it("fails the action when Slack refuses every address", async () => {
		const runId = await makeRun([openAction, inviteAction, summaryAction]);
		const channelId = newChannelId();
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

		expect(
			await refusal(
				inviteToRunSlackChannel(runId, "invite-1", {
					emails: ["buyer@customer.test"],
				}),
			),
		).toContain("This workspace doesn't let Comp AI send that invitation.");

		const action = await db.agentAction.findFirst({
			where: { runId, type: "slack.channel.invite" },
			select: { status: true },
		});
		expect(action?.status).toBe("FAILED");
	});
});

describe("posting as a deployed run", () => {
	it("posts into the channel the run opened", async () => {
		const runId = await makeRun([
			openAction,
			postRunChannelAction,
			summaryAction,
		]);
		const channelId = newChannelId();
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
						: {
								ok: true,
								channel: channelId,
								ts: "123.456",
							},
				),
				{ headers: { "content-type": "application/json" } },
			);
		}) as typeof fetch;

		await openRunSlackChannel(runId, "open-1", {
			name: "Acme Onboarding",
			isPrivate: false,
		});
		const outcome = await postRunSlackMessage(runId, "post-1", {
			text: "Hello Acme",
		});

		expect(outcome).toMatchObject({
			destination: "this run's channel",
			replayed: false,
			result: {
				type: "slack.message.post",
				channel: channelId,
				ts: "123.456",
			},
		});
		expect(
			posted.find((call) => call.url.includes("chat.postMessage"))?.body,
		).toMatchObject({
			channel: channelId,
			text: "Hello Acme",
		});
	});

	it("refuses to post before the run opens a channel", async () => {
		const runId = await makeRun([postRunChannelAction, summaryAction]);

		expect(
			await refusal(
				postRunSlackMessage(runId, "post-1", { text: "Hello Acme" }),
			),
		).toContain("hasn't opened a Slack channel yet");
	});

	it("still posts to a chosen standing channel", async () => {
		const runId = await makeRun([postChosenAction, summaryAction]);
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
				JSON.stringify({
					ok: true,
					channel: "C-SALES",
					ts: "123.456",
				}),
				{ headers: { "content-type": "application/json" } },
			);
		}) as typeof fetch;

		const outcome = await postRunSlackMessage(runId, "post-1", {
			text: "A demo is booked",
		});

		expect(outcome).toMatchObject({
			destination: "#sales",
			replayed: false,
			result: {
				type: "slack.message.post",
				channel: "C-SALES",
				ts: "123.456",
			},
		});
		expect(
			posted.find((call) => call.url.includes("chat.postMessage"))?.body,
		).toMatchObject({
			channel: "C-SALES",
			text: "A demo is booked",
		});
	});
});
