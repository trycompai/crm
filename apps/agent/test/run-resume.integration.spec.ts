import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { db } from "@crm/db";
import type { SendFn } from "eve/channels";
import { runToken } from "../agent/lib/custom-agent-dispatch";
import {
	claimSlackChannel,
	resumeAgentRun,
	runOnSlackChannel,
	slackChannelOwner,
} from "../agent/lib/run-resume";

const suffix = crypto.randomUUID();
const userId = `resume-user-${suffix}`;

let agentId = "";
let versionId = "";

type Delivery = {
	message: string;
	continuationToken?: string;
	mode?: string;
	attributes?: Record<string, string>;
};

type EveSendOptions = {
	continuationToken?: string;
	mode?: string;
	auth?: { attributes?: Record<string, string> };
};

const deliveries: Delivery[] = [];

const send = (async (message: string, options?: EveSendOptions) => {
	deliveries.push({
		message,
		continuationToken: options?.continuationToken,
		mode: options?.mode,
		attributes: options?.auth?.attributes,
	});
	return { id: `ses_${deliveries.length}` };
}) as unknown as SendFn;

const refusing = (async () => {
	throw new Error("eve refused: session is not active");
}) as unknown as SendFn;

async function makeRun(overrides: {
	status:
		| "QUEUED"
		| "RUNNING"
		| "WAITING_FOR_APPROVAL"
		| "SUCCEEDED"
		| "FAILED"
		| "CANCELLED";
	sessionId?: string | null;
}) {
	const unique = crypto.randomUUID();
	const run = await db.agentRun.create({
		data: {
			agentId,
			versionId,
			status: overrides.status,
			triggerType: "MANUAL",
			idempotencyKey: `resume-${unique}`,
			correlationId: `resume-${unique}`,
			sessionId: overrides.sessionId === null ? null : `ses_seed_${unique}`,
		},
		select: { id: true },
	});
	return run.id;
}

beforeAll(async () => {
	await db.user.create({
		data: {
			id: userId,
			name: "Resume Spike",
			email: `${userId}@example.test`,
		},
	});

	const agent = await db.agentDefinition.create({
		data: {
			name: `Resume spike ${suffix}`,
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
			instructions: "Resume spike.",
			manifest: {},
			modelId: "zai/glm-5.2-fast",
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
	await db.agentRun.deleteMany({ where: { agentId } });
	await db.agentDefinition.updateMany({
		where: { id: agentId },
		data: { currentVersionId: null },
	});
	await db.agentVersion.deleteMany({ where: { agentId } });
	await db.agentDefinition.deleteMany({ where: { id: agentId } });
	await db.user.deleteMany({ where: { id: userId } });
});

describe("resuming a parked run from an outside event", () => {
	it("delivers to the run's own continuation token, not a new session", async () => {
		deliveries.length = 0;
		const runId = await makeRun({ status: "WAITING_FOR_APPROVAL" });

		const outcome = await resumeAgentRun(
			{ runId, message: "The customer joined the channel.", source: "slack" },
			send,
		);

		expect(outcome.kind).toBe("resumed");
		expect(deliveries).toHaveLength(1);
		expect(deliveries[0]?.continuationToken).toBe(runToken(runId));
		expect(deliveries[0]?.message).toBe("The customer joined the channel.");
	});

	it("resumes in task mode, so it cannot pause for a per-action approval", async () => {
		deliveries.length = 0;
		const runId = await makeRun({ status: "RUNNING" });

		await resumeAgentRun({ runId, message: "org id", source: "slack" }, send);

		expect(deliveries[0]?.mode).toBe("task");
	});

	it("carries the run identity and the source, so the runner can revalidate", async () => {
		deliveries.length = 0;
		const runId = await makeRun({ status: "WAITING_FOR_APPROVAL" });

		await resumeAgentRun(
			{
				runId,
				message: "joined",
				source: "slack.member_joined_channel",
				attributes: { channelId: "C123" },
			},
			send,
		);

		expect(deliveries[0]?.attributes).toMatchObject({
			purpose: "team-agent",
			runId,
			agentId,
			versionId,
			resumeSource: "slack.member_joined_channel",
			channelId: "C123",
		});
	});

	it("refuses a caller attribute that redirects the session", async () => {
		deliveries.length = 0;
		const runId = await makeRun({ status: "WAITING_FOR_APPROVAL" });

		await resumeAgentRun(
			{
				runId,
				message: "hijack",
				source: "slack.message",
				attributes: {
					purpose: "research",
					runId: "run-of-somebody-else",
					agentId: "agent-of-somebody-else",
					versionId: "version-of-somebody-else",
					resumeSource: "made-up",
				},
			},
			send,
		);

		expect(deliveries[0]?.attributes).toMatchObject({
			purpose: "team-agent",
			runId,
			agentId,
			versionId,
			resumeSource: "slack.message",
		});
	});

	it("refuses a finished run, so a late event cannot restart it", async () => {
		for (const status of ["SUCCEEDED", "FAILED", "CANCELLED"] as const) {
			deliveries.length = 0;
			const runId = await makeRun({ status });

			const outcome = await resumeAgentRun(
				{ runId, message: "late", source: "slack" },
				send,
			);

			expect(outcome.kind).toBe("ignored");
			expect(deliveries).toHaveLength(0);
		}
	});

	it("refuses a run that never started a session", async () => {
		deliveries.length = 0;
		const runId = await makeRun({ status: "QUEUED", sessionId: null });

		const outcome = await resumeAgentRun(
			{ runId, message: "early", source: "slack" },
			send,
		);

		expect(outcome.kind).toBe("ignored");
		expect(deliveries).toHaveLength(0);
	});

	it("refuses a run whose agent is no longer live", async () => {
		const runId = await makeRun({ status: "WAITING_FOR_APPROVAL" });
		await db.agentDefinition.update({
			where: { id: agentId },
			data: { status: "PAUSED" },
		});

		const outcome = await resumeAgentRun(
			{ runId, message: "paused", source: "slack" },
			send,
		);

		await db.agentDefinition.update({
			where: { id: agentId },
			data: { status: "LIVE" },
		});

		expect(outcome.kind).toBe("ignored");
	});

	it("ignores an unknown run rather than throwing", async () => {
		const outcome = await resumeAgentRun(
			{ runId: `missing-${suffix}`, message: "x", source: "slack" },
			send,
		);

		expect(outcome).toMatchObject({ kind: "ignored", reason: "no such run" });
	});

	it("reports an undelivered send rather than throwing", async () => {
		const runId = await makeRun({ status: "WAITING_FOR_APPROVAL" });

		const outcome = await resumeAgentRun(
			{ runId, message: "refused", source: "slack" },
			refusing,
		);

		expect(outcome.kind).toBe("undelivered");
		if (outcome.kind !== "undelivered") throw new Error("expected undelivered");
		expect(outcome.reason).toContain("not active");
	});

	it("leaves the run's status alone; the runner owns its own state", async () => {
		const runId = await makeRun({ status: "WAITING_FOR_APPROVAL" });

		await resumeAgentRun({ runId, message: "hello", source: "slack" }, send);

		const after = await db.agentRun.findUnique({
			where: { id: runId },
			select: { status: true },
		});
		expect(after?.status).toBe("WAITING_FOR_APPROVAL");
	});
});

describe("finding the run an event belongs to", () => {
	it("finds the live run that owns a channel", async () => {
		const runId = await makeRun({ status: "WAITING_FOR_APPROVAL" });
		const channelId = `C-${crypto.randomUUID()}`;

		await claimSlackChannel(runId, channelId);

		expect(await runOnSlackChannel(channelId)).toBe(runId);
	});

	it("ignores a finished run, so its channel stops routing", async () => {
		const runId = await makeRun({ status: "SUCCEEDED" });
		const channelId = `C-${crypto.randomUUID()}`;

		await claimSlackChannel(runId, channelId);

		expect(await runOnSlackChannel(channelId)).toBeNull();
	});

	it("prefers the newest live run when a channel is reused", async () => {
		const channelId = `C-${crypto.randomUUID()}`;
		const older = await makeRun({ status: "WAITING_FOR_APPROVAL" });
		await claimSlackChannel(older, channelId);

		await new Promise((resolve) => setTimeout(resolve, 10));

		const newer = await makeRun({ status: "WAITING_FOR_APPROVAL" });
		await claimSlackChannel(newer, channelId);

		expect(await runOnSlackChannel(channelId)).toBe(newer);
	});

	it("does not reassign a channel a run already claimed", async () => {
		const runId = await makeRun({ status: "RUNNING" });
		const first = `C-${crypto.randomUUID()}`;
		const second = `C-${crypto.randomUUID()}`;

		await claimSlackChannel(runId, first);
		await claimSlackChannel(runId, second);

		expect(await runOnSlackChannel(first)).toBe(runId);
		expect(await runOnSlackChannel(second)).toBeNull();
	});

	it("says which channel the run watches, so a second claim is not silent", async () => {
		const runId = await makeRun({ status: "RUNNING" });
		const first = `C-${crypto.randomUUID()}`;
		const second = `C-${crypto.randomUUID()}`;

		expect(await claimSlackChannel(runId, first)).toBe(first);
		expect(await claimSlackChannel(runId, second)).toBe(first);
	});

	it("reports the run a paused agent holds, rather than nobody", async () => {
		const runId = await makeRun({ status: "WAITING_FOR_APPROVAL" });
		const channelId = `C-${crypto.randomUUID()}`;
		await claimSlackChannel(runId, channelId);
		await db.agentDefinition.update({
			where: { id: agentId },
			data: { status: "PAUSED" },
		});

		const held = await slackChannelOwner(channelId);
		const live = await runOnSlackChannel(channelId);

		await db.agentDefinition.update({
			where: { id: agentId },
			data: { status: "LIVE" },
		});

		expect(held).toEqual({ kind: "held", runId, agentStatus: "PAUSED" });
		expect(live).toBeNull();
	});

	it("reads an unknown or blank channel as nobody", async () => {
		expect(await runOnSlackChannel(`C-${crypto.randomUUID()}`)).toBeNull();
		expect(await runOnSlackChannel("   ")).toBeNull();
	});
});
