import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { DEFAULT_WORKSPACE_NAME, WORKSPACE_ID } from "@crm/auth";
import { db } from "@crm/db";
import { workspaceSlug } from "@crm/db/workspace";
import { AgentAccessService } from "../src/agent/agent-access.service";
import { AgentRunsService } from "../src/agent/agent-runs.service";
import type { AgentTriggerService } from "../src/agent/agent-trigger.service";

const suffix = crypto.randomUUID();
const userId = `agent-run-user-${suffix}`;
const outsiderId = `agent-run-outsider-${suffix}`;
const memberId = `agent-run-member-${suffix}`;
let agentId = "";
let versionId = "";
let pokeCount = 0;
const trigger = {
	deployedAgentRunQueued() {
		pokeCount += 1;
	},
} as AgentTriggerService;
const service = new AgentRunsService(db, new AgentAccessService(db), trigger);

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
				name: "Agent Run Test",
				email: `${userId}@example.test`,
			},
			{
				id: outsiderId,
				name: "Agent Run Outsider",
				email: `${outsiderId}@example.test`,
			},
		],
	});
	await db.member.create({
		data: {
			id: memberId,
			organizationId: WORKSPACE_ID,
			userId,
			role: "member",
			createdAt: new Date(),
		},
	});
	const agent = await db.agentDefinition.create({
		data: { name: "Run safely", status: "LIVE", createdById: userId },
		select: { id: true },
	});
	agentId = agent.id;
	const version = await db.agentVersion.create({
		data: {
			agentId,
			number: 1,
			status: "DEPLOYED",
			instructions: "Run once.",
			manifest: {},
			modelId: "test/model",
			sandboxPolicy: {},
			createdById: userId,
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
	await db.member.deleteMany({ where: { id: memberId } });
	await db.user.deleteMany({ where: { id: { in: [userId, outsiderId] } } });
});

describe("manual agent runs", () => {
	it("returns ordered, transport-safe run and activity history", async () => {
		const clientRequestId = crypto.randomUUID();
		const { id: runId } = await service.runNow(
			{ id: agentId, clientRequestId },
			userId,
		);
		const startedAt = new Date("2026-08-05T12:00:00.000Z");
		const completedAt = new Date("2026-08-05T12:00:02.000Z");
		await db.agentRun.update({
			where: { id: runId },
			data: {
				status: "SUCCEEDED",
				summary: "Prepared the account brief",
				modelId: "test/model",
				inputTokens: 120,
				outputTokens: 80,
				costUsd: "0.012345",
				startedAt,
				finishedAt: completedAt,
			},
		});
		await db.agentRunEvent.create({
			data: {
				runId,
				sequence: 1,
				type: "run.completed",
				data: { summary: "Prepared the account brief" },
				emittedAt: completedAt,
			},
		});
		await db.agentAction.create({
			data: {
				agentId,
				runId,
				type: "timeline.note.created",
				provider: "crm",
				targetType: "company",
				targetId: "company-1",
				targetLabel: "Acme",
				summary: "Added a meeting brief",
				status: "SUCCEEDED",
				idempotencyKey: `action-${clientRequestId}`,
				plannedAt: startedAt,
				startedAt,
				completedAt,
			},
		});

		const [runs, activity] = await Promise.all([
			service.list(agentId, 1, userId),
			service.activity(agentId, 1, userId),
		]);
		expect(runs).toHaveLength(1);
		expect(runs[0]).toMatchObject({
			id: runId,
			status: "SUCCEEDED",
			costUsd: "0.012345",
			startedAt: startedAt.toISOString(),
			finishedAt: completedAt.toISOString(),
			events: [
				{ sequence: 0, type: "run.queued", emittedAt: expect.any(String) },
				{
					sequence: 1,
					type: "run.completed",
					emittedAt: completedAt.toISOString(),
				},
			],
			actions: [
				{
					type: "timeline.note.created",
					plannedAt: startedAt.toISOString(),
					startedAt: startedAt.toISOString(),
					completedAt: completedAt.toISOString(),
				},
			],
		});
		expect(runs[0]?.createdAt).toBe(
			new Date(runs[0]?.createdAt ?? "").toISOString(),
		);
		expect(activity).toHaveLength(1);
		expect(activity[0]).toMatchObject({
			type: "run.requested",
			requestId: clientRequestId,
			emittedAt: expect.any(String),
			actorUser: { id: userId },
			version: { id: versionId, number: 1 },
		});
	});

	it("rejects a manual run while an agent is not live", async () => {
		const beforePokeCount = pokeCount;
		const draft = await db.agentDefinition.create({
			data: {
				name: "Draft run guard",
				status: "DRAFT",
				createdById: userId,
			},
			select: { id: true },
		});

		let runError: unknown;
		try {
			await service.runNow(
				{ id: draft.id, clientRequestId: crypto.randomUUID() },
				userId,
			);
		} catch (error) {
			runError = error;
		}
		expect((runError as Error).message).toBe("This agent is not live yet.");
		expect(pokeCount).toBe(beforePokeCount);
	});

	it("deduplicates concurrent requests and keeps the run and audit atomic", async () => {
		const beforePokeCount = pokeCount;
		const clientRequestId = crypto.randomUUID();
		const results = await Promise.all(
			Array.from({ length: 4 }, () =>
				service.runNow({ id: agentId, clientRequestId }, userId),
			),
		);

		expect(new Set(results.map((result) => result.id)).size).toBe(1);
		expect(
			await db.agentRun.count({ where: { idempotencyKey: clientRequestId } }),
		).toBe(1);
		expect(
			await db.agentAuditEvent.count({
				where: { agentId, type: "run.requested", requestId: clientRequestId },
			}),
		).toBe(1);
		expect(pokeCount).toBe(beforePokeCount + 4);
	});

	it("checks workspace membership before replaying an existing request", async () => {
		const clientRequestId = crypto.randomUUID();
		await service.runNow({ id: agentId, clientRequestId }, userId);

		let error: Error | null = null;
		try {
			await service.runNow({ id: agentId, clientRequestId }, outsiderId);
		} catch (caught) {
			error = caught as Error;
		}
		expect(error?.message).toBe("You are not a member of this workspace.");
	});

	it("allows only one agent to claim a globally reused request id", async () => {
		const otherAgent = await db.agentDefinition.create({
			data: { name: "Other live agent", status: "LIVE", createdById: userId },
			select: { id: true },
		});
		const otherVersion = await db.agentVersion.create({
			data: {
				agentId: otherAgent.id,
				number: 1,
				status: "DEPLOYED",
				instructions: "Run once.",
				manifest: {},
				modelId: "test/model",
				sandboxPolicy: {},
				createdById: userId,
			},
			select: { id: true },
		});
		await db.agentDefinition.update({
			where: { id: otherAgent.id },
			data: { currentVersionId: otherVersion.id },
		});
		const clientRequestId = crypto.randomUUID();

		const attempts = await Promise.allSettled([
			service.runNow({ id: agentId, clientRequestId }, userId),
			service.runNow({ id: otherAgent.id, clientRequestId }, userId),
		]);
		expect(
			attempts.filter((attempt) => attempt.status === "fulfilled"),
		).toHaveLength(1);
		expect(
			attempts.filter((attempt) => attempt.status === "rejected"),
		).toHaveLength(1);
		expect(
			await db.agentRun.count({ where: { idempotencyKey: clientRequestId } }),
		).toBe(1);
	});
});
