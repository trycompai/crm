import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { DEFAULT_WORKSPACE_NAME, WORKSPACE_ID } from "@crm/auth";
import { db } from "@crm/db";
import { workspaceSlug } from "@crm/db/workspace";
import { AgentAccessService } from "../src/agent/agent-access.service";
import { AgentDefinitionsService } from "../src/agent/agent-definitions.service";

const suffix = crypto.randomUUID();
const userId = `agent-lifecycle-user-${suffix}`;
const teammateId = `agent-lifecycle-teammate-${suffix}`;
const memberId = `agent-lifecycle-member-${suffix}`;
const teammateMemberId = `agent-lifecycle-teammate-member-${suffix}`;
const access = new AgentAccessService(db);
const agents = new AgentDefinitionsService(db, access);

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
		const nextRunAt = new Date("2026-08-06T12:00:00.000Z");
		const lastRunAt = new Date("2026-08-05T12:00:00.000Z");
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
