import {
	afterAll,
	beforeAll,
	beforeEach,
	describe,
	expect,
	it,
} from "bun:test";
import { db } from "@crm/db";
import type { SlackEvent } from "@crm/validation";
import type { SendFn } from "eve/channels";
import { runToken } from "../agent/lib/custom-agent-dispatch";
import { claimSlackChannel } from "../agent/lib/run-resume";
import {
	describe as describeEvent,
	dispatchSlackEvent,
	drainSlackEvents,
} from "../agent/lib/slack-events";

const suffix = crypto.randomUUID();
const userId = `slack-events-user-${suffix}`;

let agentId = "";
let versionId = "";

const deliveries: { message: string; continuationToken?: string }[] = [];

type EveSendOptions = {
	continuationToken?: string;
};

const send = (async (message: string, options?: EveSendOptions) => {
	deliveries.push({
		message,
		continuationToken: options?.continuationToken,
	});
	return { id: `ses_${deliveries.length}` };
}) as unknown as SendFn;

const refusing = (async () => {
	throw new Error("eve refused: the session is not active");
}) as unknown as SendFn;

async function makeRun(
	channelId: string | null,
	status = "WAITING_FOR_APPROVAL",
) {
	const unique = crypto.randomUUID();
	const run = await db.agentRun.create({
		data: {
			agentId,
			versionId,
			status: status as "WAITING_FOR_APPROVAL",
			triggerType: "MANUAL",
			idempotencyKey: `se-${unique}`,
			correlationId: `se-${unique}`,
			sessionId: `ses_seed_${unique}`,
		},
		select: { id: true },
	});
	if (channelId) await claimSlackChannel(run.id, channelId);
	return run.id;
}

async function inbox(event: SlackEvent, channelId: string | null) {
	const eventId = `Ev-${crypto.randomUUID()}`;
	const row = await db.slackEventInbox.create({
		data: {
			eventId,
			type: String(event.type),
			channelId,
			teamId: "T1",
			payload: {
				type: "event_callback",
				event_id: eventId,
				team_id: "T1",
				event,
			},
		},
		select: { id: true },
	});
	return row.id;
}

beforeAll(async () => {
	await db.user.create({
		data: { id: userId, name: "Slack Events", email: `${userId}@example.test` },
	});
	const agent = await db.agentDefinition.create({
		data: {
			name: `Slack events ${suffix}`,
			status: "LIVE",
			createdById: userId,
		},
		select: { id: true },
	});
	agentId = agent.id;
	const version = await db.agentVersion.create({
		data: {
			agentId,
			number: 1,
			status: "DEPLOYED",
			createdById: userId,
			instructions: "x",
			manifest: {},
			modelId: "m",
			sandboxPolicy: {},
		},
		select: { id: true },
	});
	versionId = version.id;
	await db.agentDefinition.update({
		where: { id: agentId },
		data: { currentVersionId: versionId },
	});
});

afterAll(async () => {
	await db.slackEventInbox.deleteMany({ where: { teamId: "T1" } });
	await db.agentAction.deleteMany({ where: { agentId } });
	await db.agentRun.deleteMany({ where: { agentId } });
	await db.agentDefinition.updateMany({
		where: { id: agentId },
		data: { currentVersionId: null },
	});
	await db.agentVersion.deleteMany({ where: { agentId } });
	await db.agentDefinition.deleteMany({ where: { id: agentId } });
	await db.user.deleteMany({ where: { id: userId } });
});

beforeEach(() => {
	deliveries.length = 0;
});

describe("turning a stored Slack event into a resume", () => {
	it("resumes the run that owns the channel", async () => {
		const channelId = `C-${crypto.randomUUID()}`;
		const runId = await makeRun(channelId);
		const id = await inbox(
			{ type: "message", channel: channelId, user: "U1", text: "org_abc" },
			channelId,
		);

		const outcome = await dispatchSlackEvent(id, send);

		expect(outcome?.resumed).toBe(true);
		expect(deliveries).toHaveLength(1);
		expect(deliveries[0]?.continuationToken).toBe(runToken(runId));
		expect(deliveries[0]?.message).toContain("org_abc");
	});

	it("marks the row processed, so a second drain does nothing", async () => {
		const channelId = `C-${crypto.randomUUID()}`;
		await makeRun(channelId);
		const id = await inbox(
			{ type: "message", channel: channelId, text: "hello" },
			channelId,
		);

		await dispatchSlackEvent(id, send);
		const again = await dispatchSlackEvent(id, send);

		expect(again).toBeNull();
		expect(deliveries).toHaveLength(1);
	});

	it("claims the row so two drains resume the event once", async () => {
		const channelId = `C-${crypto.randomUUID()}`;
		await makeRun(channelId);
		const id = await inbox(
			{ type: "message", channel: channelId, text: "once" },
			channelId,
		);

		const outcomes = await Promise.all([
			dispatchSlackEvent(id, send),
			dispatchSlackEvent(id, send),
		]);

		expect(outcomes.filter((outcome) => outcome?.resumed)).toHaveLength(1);
		expect(deliveries).toHaveLength(1);
	});

	it("settles an event whose channel owns no run, rather than retrying forever", async () => {
		const channelId = `C-${crypto.randomUUID()}`;
		const id = await inbox(
			{ type: "message", channel: channelId, text: "nobody home" },
			channelId,
		);

		const outcome = await dispatchSlackEvent(id, send);

		expect(outcome?.resumed).toBe(false);
		expect(outcome?.outcome).toContain("No live agent run");
		expect(deliveries).toHaveLength(0);

		const row = await db.slackEventInbox.findUnique({
			where: { id },
			select: { processedAt: true },
		});
		expect(row?.processedAt).not.toBeNull();
	});

	it("settles an event that names no channel", async () => {
		const id = await inbox({ type: "message", text: "no channel" }, null);

		const outcome = await dispatchSlackEvent(id, send);

		expect(outcome?.outcome).toContain("names no channel");
	});

	it("records the run it resumed against the event", async () => {
		const channelId = `C-${crypto.randomUUID()}`;
		const runId = await makeRun(channelId);
		const id = await inbox(
			{ type: "member_joined_channel", channel: channelId, user: "U9" },
			channelId,
		);

		await dispatchSlackEvent(id, send);

		const row = await db.slackEventInbox.findUnique({
			where: { id },
			select: { runId: true },
		});
		expect(row?.runId).toBe(runId);
	});

	it("drains every pending event and counts the resumes", async () => {
		const channelId = `C-${crypto.randomUUID()}`;
		const runId = await makeRun(channelId);
		const first = await inbox(
			{ type: "message", channel: channelId, text: "a" },
			channelId,
		);
		const second = await inbox(
			{ type: "message", channel: channelId, text: "b" },
			channelId,
		);
		const orphan = await inbox(
			{ type: "message", channel: "C-nobody", text: "c" },
			"C-nobody",
		);

		const resumed = await drainSlackEvents(send);

		expect(resumed).toBe(2);

		const rows = await db.slackEventInbox.findMany({
			where: { id: { in: [first, second, orphan] } },
			select: { id: true, processedAt: true, runId: true, outcome: true },
		});

		expect(rows).toHaveLength(3);
		for (const row of rows) {
			expect(row.processedAt).not.toBeNull();
		}
		expect(rows.filter((row) => row.runId === runId)).toHaveLength(2);
		expect(rows.find((row) => row.id === orphan)?.outcome).toContain(
			"No live agent run",
		);
	});

	it("keeps a channel message while the agent is paused, then replays it", async () => {
		const channelId = `C-${crypto.randomUUID()}`;
		const runId = await makeRun(channelId);
		const id = await inbox(
			{ type: "message", channel: channelId, text: "still here" },
			channelId,
		);
		await db.agentDefinition.update({
			where: { id: agentId },
			data: { status: "PAUSED" },
		});

		let held: Awaited<ReturnType<typeof dispatchSlackEvent>>;
		let heldRow: { processedAt: Date | null } | null;
		try {
			held = await dispatchSlackEvent(id, send);
			heldRow = await db.slackEventInbox.findUnique({
				where: { id },
				select: { processedAt: true },
			});
		} finally {
			await db.agentDefinition.update({
				where: { id: agentId },
				data: { status: "LIVE" },
			});
		}

		await db.slackEventInbox.updateMany({
			where: { id },
			data: { leasedUntil: null },
		});

		const resumed = await dispatchSlackEvent(id, send);
		const resumedRow = await db.slackEventInbox.findUnique({
			where: { id },
			select: { processedAt: true, runId: true },
		});

		expect(held?.resumed).toBe(false);
		expect(held?.outcome).toContain("paused");
		expect(heldRow?.processedAt).toBeNull();
		expect(resumed?.resumed).toBe(true);
		expect(deliveries).toHaveLength(1);
		expect(deliveries[0]?.continuationToken).toBe(runToken(runId));
		expect(resumedRow?.processedAt).not.toBeNull();
		expect(resumedRow?.runId).toBe(runId);
	});

	it("keeps a fresh event for another try when the resume does not land", async () => {
		const channelId = `C-${crypto.randomUUID()}`;
		await makeRun(channelId);
		const id = await inbox(
			{ type: "message", channel: channelId, text: "retry" },
			channelId,
		);

		const outcome = await dispatchSlackEvent(id, refusing);

		expect(outcome?.resumed).toBe(false);

		const row = await db.slackEventInbox.findUnique({
			where: { id },
			select: { processedAt: true },
		});
		expect(row?.processedAt).toBeNull();
	});
});

describe("what the agent is told", () => {
	it("names the channel and the text for a message", () => {
		const message = describeEvent({
			type: "message",
			channel: "C1",
			user: "U1",
			text: "org_abc123",
		});

		expect(message).toContain("C1");
		expect(message).toContain("U1");
		expect(message).toContain("org_abc123");
	});

	it("says somebody joined, and tells the run to carry on", () => {
		const message = describeEvent({
			type: "member_joined_channel",
			channel: "C1",
			user: "U7",
		});

		expect(message).toContain("joined");
		expect(message).toContain("U7");
		expect(message).toContain("Carry on");
	});

	it("says the agent was mentioned, not that a message arrived", () => {
		const message = describeEvent({
			type: "app_mention",
			channel: "C1",
			user: "U3",
			text: "<@U1> where are we",
		});

		expect(message).toContain("mentioned");
		expect(message).toContain("U3");
		expect(message).toContain("where are we");
	});

	it("truncates a very long message rather than sending the lot", () => {
		const message = describeEvent({
			type: "message",
			channel: "C1",
			text: "x".repeat(9000),
		});

		expect(message.length).toBeLessThan(3000);
	});
});
