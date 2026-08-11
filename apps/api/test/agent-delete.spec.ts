import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { DEFAULT_WORKSPACE_NAME, WORKSPACE_ID } from "@crm/auth";
import { db } from "@crm/db";
import { workspaceSlug } from "@crm/db/workspace";
import { AgentAccessService } from "../src/agent/agent-access.service";
import { AgentDefinitionsService } from "../src/agent/agent-definitions.service";
import { AgentTriggerService } from "../src/agent/agent-trigger.service";

const suffix = crypto.randomUUID();
const userId = `agent-delete-user-${suffix}`;
const memberId = `agent-delete-member-${suffix}`;
const idempotencyPrefix = `agent-delete-${suffix}`;

const access = new AgentAccessService(db);
const agents = new AgentDefinitionsService(
	db,
	access,
	new AgentTriggerService(db),
);

let agentId: string;
let versionId: string;
let triggerId: string;
let queuedRunId: string;
let waitingRunId: string;
let runningRunId: string;
let deliveryRunId: string;

async function clean() {
	if (agentId) {
		await db.agentRunEvent.deleteMany({ where: { run: { agentId } } });
		await db.agentAction.deleteMany({ where: { agentId } });
		await db.agentAuditEvent.deleteMany({ where: { agentId } });
		await db.agentRun.deleteMany({ where: { agentId } });
		await db.agentTrigger.deleteMany({ where: { agentId } });
		await db.agentDefinition.updateMany({
			where: { id: agentId },
			data: { currentVersionId: null },
		});
		await db.agentVersion.deleteMany({ where: { agentId } });
		await db.agentDefinition.deleteMany({ where: { id: agentId } });
	}

	await db.member.deleteMany({ where: { id: memberId } });
	await db.user.deleteMany({ where: { id: userId } });
}

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
	await db.user.create({
		data: {
			id: userId,
			name: "Agent Delete Test",
			email: `${userId}@example.test`,
		},
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
		data: {
			name: "Delete me",
			status: "PAUSED",
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
			instructions: "Test deletion behavior.",
			manifest: {},
			modelId: "test/model",
			sandboxPolicy: {},
			createdById: userId,
			approvedAt: new Date(),
			deployedAt: new Date(),
		},
		select: { id: true },
	});
	versionId = version.id;
	await db.agentDefinition.update({
		where: { id: agentId },
		data: { currentVersionId: versionId },
	});

	const trigger = await db.agentTrigger.create({
		data: {
			agentId,
			versionId,
			type: "SCHEDULE",
			name: "Every hour",
			config: { intervalMinutes: 60 },
			createdById: userId,
			enabled: true,
			nextRunAt: new Date(Date.now() + 60 * 60 * 1000),
		},
		select: { id: true },
	});
	triggerId = trigger.id;

	const [queued, waiting, running, delivery] = await Promise.all([
		db.agentRun.create({
			data: {
				agentId,
				versionId,
				triggerId,
				triggerType: "SCHEDULE",
				status: "QUEUED",
				idempotencyKey: `${idempotencyPrefix}-queued`,
				correlationId: `${idempotencyPrefix}-queued`,
			},
			select: { id: true },
		}),
		db.agentRun.create({
			data: {
				agentId,
				versionId,
				triggerType: "MANUAL",
				status: "WAITING_FOR_APPROVAL",
				idempotencyKey: `${idempotencyPrefix}-waiting`,
				correlationId: `${idempotencyPrefix}-waiting`,
			},
			select: { id: true },
		}),
		db.agentRun.create({
			data: {
				agentId,
				versionId,
				triggerType: "MANUAL",
				status: "RUNNING",
				idempotencyKey: `${idempotencyPrefix}-running`,
				correlationId: `${idempotencyPrefix}-running`,
				startedAt: new Date(),
				sessionId: `${idempotencyPrefix}-active-session`,
			},
			select: { id: true },
		}),
		db.agentRun.create({
			data: {
				agentId,
				versionId,
				triggerType: "MANUAL",
				status: "RUNNING",
				idempotencyKey: `${idempotencyPrefix}-delivery`,
				correlationId: `${idempotencyPrefix}-delivery`,
				startedAt: new Date(),
			},
			select: { id: true },
		}),
	]);
	queuedRunId = queued.id;
	waitingRunId = waiting.id;
	runningRunId = running.id;
	deliveryRunId = delivery.id;
});

afterAll(async () => {
	await clean();
});

describe("deleting an agent", () => {
	it("stops future work while preserving its audit history", async () => {
		const removed = await agents.remove(agentId, userId);

		expect(removed.status).toBe("DELETED");
		expect(removed.disabledTriggers).toBe(1);
		expect(removed.cancelledRuns).toBe(3);

		const [definition, trigger, runs, runEvents, auditEvent, listed] =
			await Promise.all([
				db.agentDefinition.findUnique({ where: { id: agentId } }),
				db.agentTrigger.findUnique({ where: { id: triggerId } }),
				db.agentRun.findMany({
					where: {
						id: {
							in: [queuedRunId, waitingRunId, runningRunId, deliveryRunId],
						},
					},
					select: {
						id: true,
						status: true,
						errorCode: true,
						finishedAt: true,
					},
				}),
				db.agentRunEvent.findMany({
					where: {
						runId: { in: [queuedRunId, waitingRunId, deliveryRunId] },
					},
					select: { runId: true, type: true, data: true },
				}),
				db.agentAuditEvent.findFirst({
					where: { agentId, type: "agent.deleted" },
				}),
				agents.list(userId),
			]);

		expect(definition?.deletedAt).not.toBeNull();
		expect(trigger).toMatchObject({ enabled: false, nextRunAt: null });
		expect(
			runs.filter((run) =>
				[queuedRunId, waitingRunId, deliveryRunId].includes(run.id),
			),
		).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					status: "CANCELLED",
					errorCode: "AGENT_DELETED",
					finishedAt: expect.any(Date),
				}),
				expect.objectContaining({
					status: "CANCELLED",
					errorCode: "AGENT_DELETED",
					finishedAt: expect.any(Date),
				}),
				expect.objectContaining({
					status: "CANCELLED",
					errorCode: "AGENT_DELETED",
					finishedAt: expect.any(Date),
				}),
			]),
		);
		expect(runs.find((run) => run.id === runningRunId)?.status).toBe("RUNNING");
		expect(runEvents).toHaveLength(3);
		expect(runEvents).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					type: "run.cancelled",
					data: { reason: "agent.deleted" },
				}),
			]),
		);
		expect(auditEvent?.after).toEqual({
			status: "DELETED",
			disabledTriggers: 1,
			cancelledRuns: 3,
		});
		expect(listed.some((agent) => agent.id === agentId)).toBe(false);

		let lookupError: unknown;
		try {
			await agents.byId(agentId, userId);
		} catch (error) {
			lookupError = error;
		}
		expect((lookupError as Error).message).toBe(`No agent with id ${agentId}.`);
	});
});
