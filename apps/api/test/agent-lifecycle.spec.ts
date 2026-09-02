import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { DEFAULT_WORKSPACE_NAME, WORKSPACE_ID } from "@crm/auth";
import { db, type Prisma } from "@crm/db";
import { workspaceSlug } from "@crm/db/workspace";
import { AgentAccessService } from "../src/agent/agent-access.service";
import { AgentDefinitionsService } from "../src/agent/agent-definitions.service";
import { AgentTriggerService } from "../src/agent/agent-trigger.service";

const suffix = crypto.randomUUID();
const userId = `agent-lifecycle-user-${suffix}`;
const teammateId = `agent-lifecycle-teammate-${suffix}`;
const memberId = `agent-lifecycle-member-${suffix}`;
const teammateMemberId = `agent-lifecycle-teammate-member-${suffix}`;
const joinChannel = `renewals-${suffix}`;
const joinReason = `Add Comp AI to #${joinChannel}`;
const access = new AgentAccessService(db);
const agents = new AgentDefinitionsService(
	db,
	access,
	new AgentTriggerService(db),
);

beforeAll(async () => {
	await db.organization.upsert({
		where: { id: WORKSPACE_ID },
		update: {},
		create: {
			id: WORKSPACE_ID,
			name: DEFAULT_WORKSPACE_NAME,
			slug: workspaceSlug(DEFAULT_WORKSPACE_NAME),
			createdAt: new Date(),
		},
	});
	await db.user.createMany({
		data: [
			{
				id: userId,
				name: "Agent Lifecycle Test",
				email: `${userId}@example.test`,
			},
			{
				id: teammateId,
				name: "Agent Lifecycle Teammate",
				email: `${teammateId}@example.test`,
			},
		],
	});
	await db.member.createMany({
		data: [
			{
				id: memberId,
				organizationId: WORKSPACE_ID,
				userId,
				role: "member",
				createdAt: new Date(),
			},
			{
				id: teammateMemberId,
				organizationId: WORKSPACE_ID,
				userId: teammateId,
				role: "member",
				createdAt: new Date(),
			},
		],
	});
});

afterAll(async () => {
	const agentIds = (
		await db.agentDefinition.findMany({
			where: { createdById: userId },
			select: { id: true },
		})
	).map((agent) => agent.id);
	if (agentIds.length > 0) {
		await db.agentRunEvent.deleteMany({
			where: { run: { agentId: { in: agentIds } } },
		});
		await db.agentAction.deleteMany({
			where: { agentId: { in: agentIds } },
		});
		await db.agentAuditEvent.deleteMany({
			where: { agentId: { in: agentIds } },
		});
		await db.agentRun.deleteMany({
			where: { agentId: { in: agentIds } },
		});
		await db.agentTrigger.deleteMany({
			where: { agentId: { in: agentIds } },
		});
		await db.agentBuilderArtifact.deleteMany({
			where: { version: { agentId: { in: agentIds } } },
		});
		await db.agentDefinition.updateMany({
			where: { id: { in: agentIds } },
			data: { currentVersionId: null },
		});
		await db.agentVersion.deleteMany({
			where: { agentId: { in: agentIds } },
		});
		await db.agentDefinition.deleteMany({
			where: { id: { in: agentIds } },
		});
	}
	await db.agentTask.deleteMany({
		where: { kind: "slack-channel-join", reason: joinReason },
	});
	await db.member.deleteMany({
		where: { id: { in: [memberId, teammateMemberId] } },
	});
	await db.user.deleteMany({ where: { id: { in: [userId, teammateId] } } });
});

async function createAgent(versionCount = 1, status = "DRAFT" as const) {
	const agent = await db.agentDefinition.create({
		data: {
			name: `Lifecycle agent ${crypto.randomUUID()}`,
			status,
			createdById: userId,
		},
		select: { id: true },
	});
	const versions = [];
	for (let number = 1; number <= versionCount; number += 1) {
		versions.push(
			await db.agentVersion.create({
				data: {
					agentId: agent.id,
					number,
					status: "READY",
					instructions: `Version ${number}`,
					manifest: {},
					modelId: "test/model",
					sandboxPolicy: {},
					createdById: userId,
				},
				select: { id: true, number: true },
			}),
		);
	}
	return { agentId: agent.id, versions };
}

const postAction = {
	type: "slack.message.post",
	provider: "slack",
	summary: "Post the summary",
	destination: {
		kind: "channel",
		resolution: "chosen",
		id: "C0001",
		label: "#renewals",
	},
};

const noteAction = {
	type: "crm.note.write",
	provider: "crm",
	summary: "Write a note",
};

const capableManifest = {
	name: "Renewal watcher",
	description: "Watch renewals.",
	actions: [postAction, noteAction],
	dataScope: { mode: "WORKSPACE", summary: "Everything", resources: [] },
};

async function deployedAgent(manifest: Prisma.InputJsonObject) {
	const { agentId, versions } = await createAgent();
	const versionId = versions[0]?.id;
	if (!versionId) throw new Error("Missing version");

	await db.agentVersion.update({
		where: { id: versionId },
		data: { manifest },
	});
	await agents.deploy(
		{ id: agentId, versionId, clientRequestId: crypto.randomUUID() },
		userId,
	);

	return { agentId, versionId };
}

describe("agent lifecycle", () => {
	it("returns stable private and team contracts while auditing metadata edits", async () => {
		const { agentId, versions } = await createAgent();
		const versionId = versions[0]?.id;
		if (!versionId) throw new Error("Missing version");

		const updated = await agents.update(
			{
				id: agentId,
				name: "Renewal monitor",
				description: "   ",
			},
			userId,
		);
		expect(updated).toMatchObject({
			id: agentId,
			name: "Renewal monitor",
			description: null,
			status: "DRAFT",
		});
		expect(await agents.byId(agentId, userId)).toMatchObject({
			canManage: true,
			reviewVersion: {
				id: versionId,
				number: 1,
				status: "READY",
			},
		});
		expect(
			(await agents.list(userId)).some((agent) => agent.id === agentId),
		).toBe(false);
		let privateDraftError: unknown;
		try {
			await agents.byId(agentId, teammateId);
		} catch (error) {
			privateDraftError = error;
		}
		expect((privateDraftError as Error).message).toBe(
			`No agent with id ${agentId}.`,
		);

		await agents.deploy(
			{ id: agentId, versionId, clientRequestId: crypto.randomUUID() },
			userId,
		);
		const nextRunAt = new Date("2036-08-06T12:00:00.000Z");
		const lastRunAt = new Date("2036-08-05T12:00:00.000Z");
		await db.agentTrigger.create({
			data: {
				agentId,
				versionId,
				type: "SCHEDULE",
				name: "Every morning",
				config: { intervalMinutes: 1440 },
				createdById: userId,
				enabled: true,
				nextRunAt,
				lastRunAt,
			},
		});

		const detail = await agents.byId(agentId, teammateId);
		const listed = await agents.list(teammateId);
		const audit = await db.agentAuditEvent.findFirstOrThrow({
			where: { agentId, type: "agent.updated" },
		});
		const listItem = listed.find((agent) => agent.id === agentId);
		expect(detail).toMatchObject({
			id: agentId,
			canManage: false,
			status: "LIVE",
			currentVersion: {
				id: versionId,
				approvedAt: expect.any(String),
				deployedAt: expect.any(String),
			},
			triggers: [
				{
					name: "Every morning",
					nextRunAt: nextRunAt.toISOString(),
					lastRunAt: lastRunAt.toISOString(),
				},
			],
		});
		expect(detail.createdAt).toBe(new Date(detail.createdAt).toISOString());
		expect(detail.updatedAt).toBe(new Date(detail.updatedAt).toISOString());
		expect(listItem).toMatchObject({
			id: agentId,
			status: "LIVE",
			currentVersion: { id: versionId, deployedAt: expect.any(String) },
			triggers: [{ nextRunAt: nextRunAt.toISOString() }],
			runCount: 0,
		});
		expect(audit.before).toEqual({
			name: expect.stringContaining("Lifecycle agent"),
			description: null,
		});
		expect(audit.after).toEqual({
			name: "Renewal monitor",
			description: null,
		});
	});

	it("promotes versioned draft metadata only when that version is deployed", async () => {
		const { agentId, versions } = await createAgent();
		const versionId = versions[0]?.id;
		if (!versionId) throw new Error("Missing version");

		await db.agentVersion.update({
			where: { id: versionId },
			data: {
				manifest: {
					name: "Pipeline health monitor",
					description: "Summarize pipeline health for the team.",
				},
			},
		});
		const before = await db.agentDefinition.findUniqueOrThrow({
			where: { id: agentId },
			select: { name: true, description: true, status: true },
		});
		expect(before).toMatchObject({
			name: expect.stringContaining("Lifecycle agent"),
			description: null,
			status: "DRAFT",
		});

		await agents.deploy(
			{ id: agentId, versionId, clientRequestId: crypto.randomUUID() },
			userId,
		);

		const after = await db.agentDefinition.findUniqueOrThrow({
			where: { id: agentId },
			select: {
				name: true,
				description: true,
				status: true,
				currentVersionId: true,
			},
		});
		expect(after).toEqual({
			name: "Pipeline health monitor",
			description: "Summarize pipeline health for the team.",
			status: "LIVE",
			currentVersionId: versionId,
		});
	});

	it("keeps a draft private when pause or archive is requested", async () => {
		const { agentId } = await createAgent();

		const errors: Error[] = [];
		for (const transition of [agents.pause, agents.archive]) {
			try {
				await transition.call(agents, agentId, userId);
			} catch (error) {
				errors.push(error as Error);
			}
		}
		expect(errors.map((error) => error.message)).toEqual([
			"Only a live agent can be paused.",
			"Only a live or paused agent can be archived.",
		]);

		const [definition, teamAgents] = await Promise.all([
			db.agentDefinition.findUnique({ where: { id: agentId } }),
			agents.list(userId),
		]);
		expect(definition?.status).toBe("DRAFT");
		expect(teamAgents.some((agent) => agent.id === agentId)).toBe(false);
	});

	it("moves only through valid deployed lifecycle states", async () => {
		const { agentId, versions } = await createAgent(2);
		const firstVersionId = versions[0]?.id;
		const secondVersionId = versions[1]?.id;
		if (!firstVersionId || !secondVersionId)
			throw new Error("Missing versions");

		await agents.deploy(
			{
				id: agentId,
				versionId: firstVersionId,
				clientRequestId: crypto.randomUUID(),
			},
			userId,
		);
		await agents.pause(agentId, userId);
		await agents.resume(agentId, userId);
		await agents.archive(agentId, userId);
		await agents.restore(agentId, userId);
		await agents.deploy(
			{
				id: agentId,
				versionId: secondVersionId,
				clientRequestId: crypto.randomUUID(),
			},
			userId,
		);

		const [definition, deployedVersions] = await Promise.all([
			db.agentDefinition.findUnique({ where: { id: agentId } }),
			db.agentVersion.findMany({
				where: { agentId, status: "DEPLOYED" },
				select: { id: true },
			}),
		]);
		expect(definition).toMatchObject({
			status: "LIVE",
			currentVersionId: secondVersionId,
			archivedAt: null,
		});
		expect(deployedVersions).toEqual([{ id: secondVersionId }]);
	});

	it("serializes deployments and preserves request idempotency", async () => {
		const { agentId, versions } = await createAgent(2);
		const firstVersionId = versions[0]?.id;
		const secondVersionId = versions[1]?.id;
		if (!firstVersionId || !secondVersionId)
			throw new Error("Missing versions");
		const clientRequestId = crypto.randomUUID();

		const collision = await Promise.allSettled([
			agents.deploy(
				{ id: agentId, versionId: firstVersionId, clientRequestId },
				userId,
			),
			agents.deploy(
				{ id: agentId, versionId: secondVersionId, clientRequestId },
				userId,
			),
		]);
		expect(
			collision.filter((result) => result.status === "fulfilled"),
		).toHaveLength(1);
		expect(
			collision.filter((result) => result.status === "rejected"),
		).toHaveLength(1);

		const definition = await db.agentDefinition.findUniqueOrThrow({
			where: { id: agentId },
			select: { currentVersionId: true },
		});
		const currentVersionId = definition.currentVersionId;
		if (!currentVersionId) throw new Error("Missing current version");
		const retries = await Promise.all(
			Array.from({ length: 4 }, () =>
				agents.deploy(
					{
						id: agentId,
						versionId: currentVersionId,
						clientRequestId,
					},
					userId,
				),
			),
		);
		expect(new Set(retries.map((retry) => retry.versionId))).toEqual(
			new Set([currentVersionId]),
		);
		expect(
			await db.agentAuditEvent.count({
				where: { agentId, type: "agent.deployed", requestId: clientRequestId },
			}),
		).toBe(1);
		expect(
			await db.agentVersion.count({
				where: { agentId, status: "DEPLOYED" },
			}),
		).toBe(1);
	});

	it("moves triggers onto the version a revision creates", async () => {
		const { agentId, versionId } = await deployedAgent(capableManifest);
		const trigger = await db.agentTrigger.create({
			data: {
				agentId,
				versionId,
				type: "SCHEDULE",
				name: "Every morning",
				config: { intervalMinutes: 1440 },
				createdById: userId,
				enabled: true,
				nextRunAt: new Date("2036-08-12T06:00:00.000Z"),
			},
			select: { id: true },
		});

		const revised = await agents.revise(
			{
				id: agentId,
				clientRequestId: crypto.randomUUID(),
				actions: ["slack.message.post"],
				resources: [{ id: "acme", kind: "company", label: "Acme" }],
			},
			userId,
		);
		const revisedId = revised.versionId;
		if (!revisedId) throw new Error("Missing revised version");

		const [definition, revision, moved] = await Promise.all([
			db.agentDefinition.findUniqueOrThrow({
				where: { id: agentId },
				select: { currentVersionId: true },
			}),
			db.agentVersion.findUniqueOrThrow({
				where: { id: revisedId },
				select: { manifest: true },
			}),
			db.agentTrigger.findUniqueOrThrow({
				where: { id: trigger.id },
				select: { versionId: true, enabled: true },
			}),
		]);

		expect(revisedId).not.toBe(versionId);
		expect(definition.currentVersionId).toBe(revisedId);
		expect(moved).toEqual({ versionId: revisedId, enabled: true });
		expect(revision.manifest).toMatchObject({
			name: "Renewal watcher",
			description: "Watch renewals.",
			actions: [
				{
					type: "slack.message.post",
					destination: {
						kind: "channel",
						resolution: "chosen",
						id: "C0001",
						label: "#renewals",
					},
				},
			],
			dataScope: {
				mode: "SELECTED",
				resources: [{ id: "acme", kind: "company", label: "Acme" }],
			},
		});
	});

	it("moves triggers onto the version a file save creates", async () => {
		const { agentId, versionId } = await deployedAgent(capableManifest);
		await db.agentBuilderArtifact.create({
			data: {
				versionId,
				path: "agent/instructions.md",
				language: "markdown",
				content: "Watch renewals.",
				revision: 1,
				status: "READY",
			},
		});
		const trigger = await db.agentTrigger.create({
			data: {
				agentId,
				versionId,
				type: "SCHEDULE",
				name: "Every morning",
				config: { intervalMinutes: 1440 },
				createdById: userId,
				enabled: true,
				nextRunAt: new Date("2036-08-12T06:00:00.000Z"),
			},
			select: { id: true },
		});

		const saved = await agents.saveFile(
			{
				id: agentId,
				clientRequestId: crypto.randomUUID(),
				path: "agent/instructions.md",
				content: "Watch renewals every morning.",
			},
			userId,
		);
		const savedId = saved.versionId;
		if (!savedId) throw new Error("Missing saved version");

		const [definition, moved, audit] = await Promise.all([
			db.agentDefinition.findUniqueOrThrow({
				where: { id: agentId },
				select: { currentVersionId: true },
			}),
			db.agentTrigger.findUniqueOrThrow({
				where: { id: trigger.id },
				select: { versionId: true, enabled: true },
			}),
			db.agentAuditEvent.findFirstOrThrow({
				where: { agentId, type: "agent.file.saved" },
				select: { after: true },
			}),
		]);

		expect(saved.saved).toBe(true);
		expect(savedId).not.toBe(versionId);
		expect(definition.currentVersionId).toBe(savedId);
		expect(moved).toEqual({ versionId: savedId, enabled: true });
		expect(audit.after).toMatchObject({ triggers: 1 });
	});

	it("numbers a revision above every existing version", async () => {
		const { agentId } = await deployedAgent(capableManifest);
		await db.agentVersion.create({
			data: {
				agentId,
				number: 9,
				status: "DRAFT",
				instructions: "A later draft",
				manifest: capableManifest,
				modelId: "test/model",
				sandboxPolicy: {},
				createdById: userId,
			},
		});

		const revised = await agents.revise(
			{
				id: agentId,
				clientRequestId: crypto.randomUUID(),
				resources: [],
			},
			userId,
		);
		if (!revised.versionId) throw new Error("Missing revised version");

		expect(
			await db.agentVersion.findUniqueOrThrow({
				where: { id: revised.versionId },
				select: { number: true },
			}),
		).toEqual({ number: 10 });
	});

	it("queues the channel join with the version that moves the agent", async () => {
		const { agentId } = await deployedAgent(capableManifest);

		const revised = await agents.revise(
			{
				id: agentId,
				clientRequestId: crypto.randomUUID(),
				channel: { id: "C0009", name: joinChannel },
			},
			userId,
		);
		if (!revised.versionId) throw new Error("Missing revised version");

		const [version, join] = await Promise.all([
			db.agentVersion.findUniqueOrThrow({
				where: { id: revised.versionId },
				select: { manifest: true },
			}),
			db.agentTask.findFirst({
				where: { kind: "slack-channel-join", reason: joinReason },
				select: { payload: true },
			}),
		]);

		expect(version.manifest).toMatchObject({
			actions: [
				{
					type: "slack.message.post",
					destination: {
						kind: "channel",
						resolution: "chosen",
						id: "C0009",
						label: `#${joinChannel}`,
					},
				},
				{ type: "crm.note.write" },
			],
		});
		expect(join?.payload).toMatchObject({
			type: "slack.channel.join",
			channelId: "C0009",
			channelName: joinChannel,
		});
	});

	it("refuses a channel change when no action posts anywhere", async () => {
		const { agentId } = await deployedAgent({
			...capableManifest,
			actions: [noteAction],
		});

		let refusal: unknown;
		try {
			await agents.revise(
				{
					id: agentId,
					clientRequestId: crypto.randomUUID(),
					channel: { id: "C0002", name: "wins" },
				},
				userId,
			);
		} catch (error) {
			refusal = error;
		}

		expect((refusal as Error).message).toBe(
			"None of this agent's actions post to a channel, so its channel cannot be changed.",
		);
		expect(await db.agentVersion.count({ where: { agentId } })).toBe(1);
	});

	it("cannot resurrect an agent when deletion races a transition", async () => {
		const { agentId, versions } = await createAgent();
		const versionId = versions[0]?.id;
		if (!versionId) throw new Error("Missing version");
		await agents.deploy(
			{
				id: agentId,
				versionId,
				clientRequestId: crypto.randomUUID(),
			},
			userId,
		);

		await Promise.allSettled([
			agents.pause(agentId, userId),
			agents.remove(agentId, userId),
		]);

		expect(
			await db.agentDefinition.findUnique({
				where: { id: agentId },
				select: { status: true },
			}),
		).toEqual({ status: "DELETED" });
	});
});
