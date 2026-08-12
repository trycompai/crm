import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { DEFAULT_WORKSPACE_NAME, WORKSPACE_ID } from "@crm/auth";
import { db } from "@crm/db";
import { workspaceSlug } from "@crm/db/workspace";
import { AgentAccessService } from "../src/agent/agent-access.service";
import { AgentObservabilityService } from "../src/agent/agent-observability.service";

const suffix = crypto.randomUUID();
const userId = `agent-obs-user-${suffix}`;
const memberId = `agent-obs-member-${suffix}`;
let agentId = "";
let versionId = "";
const service = new AgentObservabilityService(db, new AgentAccessService(db));

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
			name: "Agent Obs Test",
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
		data: { name: "Obs fleet", status: "LIVE", createdById: userId },
		select: { id: true },
	});
	agentId = agent.id;
	const version = await db.agentVersion.create({
		data: {
			agentId,
			number: 1,
			status: "DEPLOYED",
			instructions: "Report health only.",
			manifest: {
				lifecycleRole: "qualify",
				actions: [
					{ type: "run.summary", provider: "crm", summary: "done" },
				],
				dataScope: { mode: "WORKSPACE", summary: "workspace", resources: [] },
			},
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

	const succeeded = await db.agentRun.create({
		data: {
			agentId,
			versionId,
			triggerType: "MANUAL",
			status: "SUCCEEDED",
			idempotencyKey: `obs-ok-${suffix}`,
			correlationId: `obs-ok-corr-${suffix}`,
			inputTokens: 10,
			outputTokens: 5,
			costUsd: "0.01",
			sessionId: `session-ok-${suffix}`,
			startedAt: new Date(),
			finishedAt: new Date(),
		},
		select: { id: true },
	});
	await db.agentAction.create({
		data: {
			agentId,
			runId: succeeded.id,
			type: "crm.activity.create",
			provider: "crm",
			summary: "NOTE only",
			status: "SUCCEEDED",
			idempotencyKey: `obs-action-${suffix}`,
		},
	});
	await db.agentRun.create({
		data: {
			agentId,
			versionId,
			triggerType: "EVENT",
			status: "FAILED",
			idempotencyKey: `obs-dep-${suffix}`,
			correlationId: `obs-dep-corr-${suffix}`,
			errorCode: "DEPENDENCY_UNAVAILABLE",
			errorMessage: "Slack missing",
			finishedAt: new Date(),
		},
	});
	const cancelled = await db.agentRun.create({
		data: {
			agentId,
			versionId,
			triggerType: "SCHEDULE",
			status: "CANCELLED",
			idempotencyKey: `obs-cancel-${suffix}`,
			correlationId: `obs-cancel-corr-${suffix}`,
			cancelRequestedAt: new Date(),
			finishedAt: new Date(),
		},
		select: { id: true },
	});
	await db.agentAction.create({
		data: {
			agentId,
			runId: cancelled.id,
			type: "run.summary",
			provider: "crm",
			summary: "partial",
			status: "SUCCEEDED",
			idempotencyKey: `obs-cancel-action-${suffix}`,
		},
	});
});

afterAll(async () => {
	if (agentId) {
		await db.agentAction.deleteMany({ where: { agentId } });
		await db.agentRunEvent.deleteMany({
			where: { run: { agentId } },
		});
		await db.agentRun.deleteMany({ where: { agentId } });
		await db.agentDefinition.update({
			where: { id: agentId },
			data: { currentVersionId: null },
		});
		await db.agentVersion.deleteMany({ where: { agentId } });
		await db.agentDefinition.deleteMany({ where: { id: agentId } });
	}
	await db.member.deleteMany({ where: { id: memberId } });
	await db.user.deleteMany({ where: { id: userId } });
});

describe("agent observability fleet", () => {
	it("aggregates status, role, quality, and consumption without free text", async () => {
		const fleet = await service.fleet(userId);

		expect(fleet.windowHours).toBe(24);
		expect(fleet.runsByStatus.SUCCEEDED).toBeGreaterThanOrEqual(1);
		expect(fleet.runsByStatus.FAILED).toBeGreaterThanOrEqual(1);
		expect(fleet.runsByStatus.CANCELLED).toBeGreaterThanOrEqual(1);
		expect(fleet.runsByTrigger.MANUAL).toBeGreaterThanOrEqual(1);
		expect(fleet.runsByLifecycleRole.qualify).toBeGreaterThanOrEqual(3);
		expect(fleet.actionsByType["crm.activity.create"]).toBeGreaterThanOrEqual(
			1,
		);
		expect(fleet.quality.dependencyFailures).toBeGreaterThanOrEqual(1);
		expect(fleet.quality.cancelAfterAction).toBeGreaterThanOrEqual(1);
		expect(fleet.consumption.inputTokens).toBeGreaterThanOrEqual(10);
		expect(fleet.consumption.outputTokens).toBeGreaterThanOrEqual(5);
		expect(fleet.consumption.costUsd).toBeGreaterThanOrEqual(0.01);
		expect(fleet.consumption.sessionsWithTrace).toBeGreaterThanOrEqual(1);
		expect(fleet.agents.byLifecycleRole.qualify).toBeGreaterThanOrEqual(1);

		const encoded = JSON.stringify(fleet);
		expect(encoded).not.toContain("NOTE only");
		expect(encoded).not.toContain("Slack missing");
		expect(encoded).not.toContain("Report health only");
	});
});
