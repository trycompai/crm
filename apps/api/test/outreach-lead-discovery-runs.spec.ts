import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { DEFAULT_WORKSPACE_NAME, WORKSPACE_ID } from "@crm/auth";
import { db } from "@crm/db";
import { workspaceSlug } from "@crm/db/workspace";
import { AgentTriggerService } from "../src/agent/agent-trigger.service";
import { KernelIdempotencyService } from "../src/operating-kernel/kernel-idempotency.service";
import { OperatingKernelAccessService } from "../src/operating-kernel/operating-kernel-access.service";
import { OperatingKernelCleanupService } from "../src/operating-kernel/operating-kernel-cleanup.service";
import { OutreachService } from "../src/outreach/outreach.service";

const suffix = crypto.randomUUID();
const userId = `lead-discovery-${suffix}`;
const membershipId = `lead-discovery-member-${suffix}`;
const requestIds: string[] = [];
const taskIds: string[] = [];
const workItemIds: string[] = [];
const approvalRequestIds: string[] = [];
const agent = {
	discoverProspects: () => {
		throw new Error("Lead discovery must stay paused and provider-free.");
	},
} as unknown as AgentTriggerService;
const outreach = new OutreachService(
	db,
	agent,
	new OperatingKernelCleanupService(),
	new OperatingKernelAccessService(db),
	new KernelIdempotencyService(),
);

function clientRequestId() {
	const id = crypto.randomUUID();
	requestIds.push(id);
	return id;
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
		data: { id: userId, name: "Lead Planner", email: `${userId}@example.test` },
	});
	await db.member.create({
		data: {
			id: membershipId,
			organizationId: WORKSPACE_ID,
			userId,
			role: "member",
			createdAt: new Date(),
		},
	});
});

afterAll(async () => {
	await db.actionReceipt.deleteMany({
		where: { idempotencyKey: { in: requestIds } },
	});
	await db.workItem.deleteMany({ where: { id: { in: workItemIds } } });
	await db.agentTask.deleteMany({ where: { id: { in: taskIds } } });
	await db.approvalRequest.deleteMany({
		where: { id: { in: approvalRequestIds } },
	});
	await db.member.deleteMany({ where: { id: membershipId } });
	await db.user.deleteMany({ where: { id: userId } });
});

describe("outreach lead discovery runs", () => {
	it("plans, displays, cancels and retries provider-free paused runs", async () => {
		const requestId = clientRequestId();
		const input = {
			count: 12,
			countryCodes: ["GB", "US"] as ("GB" | "US")[],
			cohortName: "Commercial landscaping operators",
			budgetUsd: 18.75,
			clientRequestId: requestId,
		};

		const planned = await outreach.findMore(input, userId);
		const taskId = planned.taskId as string;
		const workItemId = planned.workItemId as string;
		const approvalRequestId = planned.approvalRequestId as string;
		taskIds.push(taskId);
		workItemIds.push(workItemId);
		approvalRequestIds.push(approvalRequestId);

		expect(planned.executionPaused).toBe(true);
		expect(planned.providerExecutionDisabled).toBe(true);
		expect(planned.queued).toBe(0);

		const replay = await outreach.findMore(input, userId);
		expect(replay.taskId).toBe(taskId);
		const replayedTaskCount = await db.agentTask.count({
			where: { idempotencyKey: `lead-discovery:${requestId}` },
		});
		expect(replayedTaskCount).toBe(1);

		const task = await db.agentTask.findUnique({
			where: { id: taskId },
			select: {
				state: true,
				startedAt: true,
				budget: true,
				budgetUsd: true,
				costUsd: true,
				operationKey: true,
				provider: true,
				channel: true,
				approvalRequestId: true,
				approvalContentDigest: true,
				scopes: true,
			},
		});
		expect(task?.state).toBe("WAITING_FOR_APPROVAL");
		expect(task?.startedAt).toBeNull();
		expect(task?.budget).toBe(12);
		expect(task?.budgetUsd?.toFixed(6)).toBe("18.750000");
		expect(task?.costUsd?.toFixed(6)).toBe("0.000000");
		expect(task?.operationKey).toBe("outreach.lead-discovery.request");
		expect(task?.provider).toBe("agent");
		expect(task?.channel).toBe("outreach");
		expect(task?.approvalRequestId).toBe(approvalRequestId);
		expect(task?.approvalContentDigest).toBe(
			planned.approvalContentDigest as string,
		);

		const approval = await db.approvalRequest.findUnique({
			where: { id: approvalRequestId },
			select: {
				action: true,
				status: true,
				targetType: true,
				targetId: true,
				risk: true,
				policyVersion: true,
			},
		});
		expect(approval).toEqual({
			action: "outreach.lead-discovery.execute",
			status: "PENDING",
			targetType: "WORKSPACE",
			targetId: WORKSPACE_ID,
			risk: "MEDIUM",
			policyVersion: "lead-discovery-paused-v1",
		});

		const work = await db.workItem.findUnique({
			where: { id: workItemId },
			select: { queue: true, state: true, ownerId: true, evidence: true },
		});
		expect(work?.queue).toBe("growth");
		expect(work?.state).toBe("OPEN");
		expect(work?.ownerId).toBe(userId);

		const status = await outreach.supplyStatus();
		expect(status.discovery?.id).toBe(taskId);
		expect(status.discovery?.state).toBe("paused");

		const [run] = (await outreach.leadDiscoveryRuns()).filter(
			(row) => row.id === taskId,
		);
		expect(run?.state).toBe("WAITING_FOR_APPROVAL");
		expect(run?.targetCount).toBe(12);
		expect(run?.targetRegions).toEqual(["GB", "US"]);
		expect(run?.budgetUsd).toBe("18.750000");
		expect(run?.estimatedCostUsd).toBe("18.750000");
		expect(run?.actualCostUsd).toBe("0.000000");
		expect(run?.approvalRequestId).toBe(approvalRequestId);
		expect(run?.executionPaused).toBe(true);
		expect(run?.providerExecutionDisabled).toBe(true);
		expect(run?.progress).toBe(0);
		expect(run?.canCancel).toBe(true);
		expect(run?.canRetry).toBe(false);
		expect(run?.requiredGates.map((gate) => gate.key)).toEqual([
			"freshness",
			"currentJobEvidence",
			"namedPerson",
			"verifiedRoute",
			"jurisdictionPolicy",
			"abcDrafts",
		]);
		expect(run?.receipts[0]?.operationKey).toBe(
			"outreach.lead-discovery.request",
		);

		const cancel = await outreach.cancelLeadDiscovery(
			taskId,
			userId,
			clientRequestId(),
		);
		expect(cancel.cancelled).toBe(true);
		expect(cancel.receipt.operationKey).toBe("outreach.lead-discovery.cancel");
		const cancelledTask = await db.agentTask.findUnique({
			where: { id: taskId },
			select: { state: true, finishedAt: true },
		});
		expect(cancelledTask).toMatchObject({ state: "CANCELLED" });
		const dismissedWork = await db.workItem.findUnique({
			where: { id: workItemId },
			select: { state: true },
		});
		expect(dismissedWork).toEqual({ state: "DISMISSED" });
		const cancelledApproval = await db.approvalRequest.findUnique({
			where: { id: approvalRequestId },
			select: { status: true },
		});
		expect(cancelledApproval).toEqual({ status: "CANCELLED" });

		const retry = await outreach.retryLeadDiscovery(
			taskId,
			userId,
			clientRequestId(),
		);
		const retryTaskId = retry.taskId as string;
		const retryWorkItemId = retry.workItemId as string;
		const retryApprovalRequestId = retry.approvalRequestId as string;
		taskIds.push(retryTaskId);
		workItemIds.push(retryWorkItemId);
		approvalRequestIds.push(retryApprovalRequestId);
		expect(retry.retried).toBe(true);
		expect(retry.parentTaskId).toBe(taskId);
		expect(retry.executionPaused).toBe(true);

		const retryRun = (await outreach.leadDiscoveryRuns()).find(
			(row) => row.id === retryTaskId,
		);
		expect(retryRun?.state).toBe("WAITING_FOR_APPROVAL");
		expect(retryRun?.parentTaskId).toBe(taskId);
		expect(retryRun?.approvalRequestId).toBe(retryApprovalRequestId);
		expect(retryRun?.canCancel).toBe(true);
	});
});
