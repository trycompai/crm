import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { DEFAULT_WORKSPACE_NAME, WORKSPACE_ID } from "@crm/auth";
import { db } from "@crm/db";
import { approvalContentDigest } from "@crm/db/approval";
import { workspaceSlug } from "@crm/db/workspace";
import { InstancesService } from "../src/instances/instances.service";
import { OperatingKernelAccessService } from "../src/operating-kernel/operating-kernel-access.service";

const suffix = crypto.randomUUID();
const ownerId = `instances-owner-${suffix}`;
const memberId = `instances-member-${suffix}`;
const ownerMemberId = `instances-owner-member-${suffix}`;
const companyId = `instances-company-${suffix}`;
const accountId = `instances-account-${suffix}`;
const instanceId = `instances-instance-${suffix}`;
const secretReferenceId = `instances-secret-${suffix}`;
const providerAccountId = `instances-provider-account-${suffix}`;
const resourceId = `instances-resource-${suffix}`;
const observedStateId = `instances-observed-${suffix}`;
const desiredRevisionId = `instances-desired-${suffix}`;
const planId = `instances-plan-${suffix}`;
const planStepId = `instances-plan-step-${suffix}`;
const commandId = `instances-command-${suffix}`;
const operationId = `instances-operation-${suffix}`;
const approvalId = `instances-approval-${suffix}`;
const receiptId = `instances-receipt-${suffix}`;
const workId = `instances-work-${suffix}`;
const leak = `do-not-leak-${suffix}`;
const instances = new InstancesService(
	db,
	new OperatingKernelAccessService(db),
);

async function clean() {
	await db.actionReceipt.deleteMany({ where: { id: receiptId } });
	await db.providerOperation.deleteMany({ where: { id: operationId } });
	await db.controlCommand.deleteMany({ where: { id: commandId } });
	await db.planStep.deleteMany({ where: { id: planStepId } });
	await db.plan.deleteMany({ where: { id: planId } });
	await db.approvalRequest.deleteMany({ where: { id: approvalId } });
	await db.costLineItem.deleteMany({
		where: { customerAccountId: accountId },
	});
	await db.usageSample.deleteMany({
		where: { customerAccountId: accountId },
	});
	await db.incident.deleteMany({ where: { instanceId } });
	await db.providerResource.deleteMany({ where: { id: resourceId } });
	await db.providerAccount.deleteMany({ where: { id: providerAccountId } });
	await db.secretReference.deleteMany({ where: { id: secretReferenceId } });
	await db.desiredStateRevision.deleteMany({
		where: { id: desiredRevisionId },
	});
	await db.observedState.deleteMany({ where: { id: observedStateId } });
	await db.workItem.deleteMany({ where: { id: workId } });
	await db.customerInstance.deleteMany({ where: { id: instanceId } });
	await db.customerAccount.deleteMany({ where: { id: accountId } });
	await db.company.deleteMany({ where: { id: companyId } });
	await db.member.deleteMany({
		where: { id: { in: [memberId, ownerMemberId] } },
	});
	await db.user.deleteMany({ where: { id: ownerId } });
}

beforeAll(async () => {
	await clean();
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
			id: ownerId,
			name: "Instances Owner",
			email: `${ownerId}@test.dev`,
		},
	});
	await db.member.createMany({
		data: [
			{
				id: memberId,
				organizationId: WORKSPACE_ID,
				userId: ownerId,
				role: "member",
				createdAt: new Date(),
			},
		],
	});
	await db.company.create({
		data: {
			id: companyId,
			name: `Instances Company ${suffix}`,
			domain: `instances-${suffix}.example.test`,
		},
	});
	await db.customerAccount.create({
		data: {
			id: accountId,
			companyId,
			name: `Instances Customer ${suffix}`,
			status: "ACTIVE",
			metadata: {
				onboardingFoundation: {
					requiredGaps: ["providerResourceCensus", "observedState"],
				},
			},
		},
	});
	await db.customerInstance.create({
		data: {
			id: instanceId,
			accountId,
			key: `production-${suffix}`,
			name: `Production ${suffix}`,
			environment: "production",
			region: "us-east-1",
			status: "ACTIVE",
			externalId: `instance-external-${suffix}`,
			metadata: { hidden: leak },
		},
	});
	await db.secretReference.create({
		data: {
			id: secretReferenceId,
			customerAccountId: accountId,
			provider: "vercel",
			externalAccountId: `team-${suffix}`,
			reference: leak,
			status: "ACTIVE",
			capabilityMetadata: { hidden: leak },
		},
	});
	await db.providerAccount.create({
		data: {
			id: providerAccountId,
			customerAccountId: accountId,
			instanceId,
			provider: "vercel",
			externalAccountId: `team-${suffix}`,
			displayName: "Vercel production",
			status: "ACTIVE",
			scopes: [leak],
			secretReferenceId,
			metadata: { hidden: leak },
		},
	});
	await db.providerResource.create({
		data: {
			id: resourceId,
			customerAccountId: accountId,
			providerAccountId,
			instanceId,
			provider: "vercel",
			resourceType: "project",
			externalId: `project-${suffix}`,
			name: "Customer app",
			status: "DRIFTED",
			observed: { hidden: leak },
			observedAt: new Date("2026-08-11T10:00:00.000Z"),
		},
	});
	await db.observedState.create({
		data: {
			id: observedStateId,
			instanceId,
			digest: `observed-digest-${suffix}`,
			observed: { hidden: leak },
			status: "STALE",
			source: "local-test",
			observedAt: new Date("2026-08-11T10:05:00.000Z"),
		},
	});
	await db.desiredStateRevision.create({
		data: {
			id: desiredRevisionId,
			instanceId,
			revision: 1,
			digest: `desired-digest-${suffix}`,
			desired: { hidden: leak },
			status: "PLANNED",
			source: "operator",
		},
	});
	const expiresAt = new Date("2026-08-25T12:00:00.000Z");
	const approvalSnapshot = {
		instanceId,
		planId,
		providerExecutionDisabled: true,
		modelExecutionDisabled: true,
	};
	const contentDigest = approvalContentDigest({
		action: "instances.plan.approve",
		contentSnapshot: approvalSnapshot,
		targetType: "PLAN",
		targetId: planId,
		risk: "HIGH",
		policyVersion: "instances-readonly-v1",
		expiresAt,
		invalidationVersion: 0,
	});
	await db.approvalRequest.create({
		data: {
			id: approvalId,
			action: "instances.plan.approve",
			contentDigest,
			contentSnapshot: approvalSnapshot,
			targetType: "PLAN",
			targetId: planId,
			targetLabel: "Approve dry-run plan",
			risk: "HIGH",
			policyVersion: "instances-readonly-v1",
			requestorId: ownerId,
			expiresAt,
			status: "PENDING",
			idempotencyKey: `instances:approval:${suffix}`,
		},
	});
	await db.plan.create({
		data: {
			id: planId,
			instanceId,
			desiredRevisionId,
			observedStateId,
			preconditionDigest: `precondition-${suffix}`,
			contentDigest,
			status: "DRAFT",
			idempotencyKey: `instances:plan:${suffix}`,
			approvalRequestId: approvalId,
			summary: "Dry-run provider resource reconciliation.",
		},
	});
	await db.planStep.create({
		data: {
			id: planStepId,
			planId,
			instanceId,
			position: 1,
			operation: "verify-project",
			provider: "vercel",
			resourceType: "project",
			resourceId,
			desired: { hidden: leak },
			observed: { hidden: leak },
			status: "PENDING",
			operationKey: `instances:step:${suffix}`,
			idempotencyKey: `instances:step:${suffix}`,
		},
	});
	await db.controlCommand.create({
		data: {
			id: commandId,
			instanceId,
			command: "discover",
			payload: { hidden: leak },
			contentDigest: `command-digest-${suffix}`,
			status: "QUEUED",
			idempotencyKey: `instances:command:${suffix}`,
			requestedByType: "USER",
			requestedById: ownerId,
			result: { hidden: leak },
		},
	});
	await db.providerOperation.create({
		data: {
			id: operationId,
			customerAccountId: accountId,
			instanceId,
			providerAccountId,
			planStepId,
			provider: "vercel",
			operation: "read-project",
			operationKey: `instances:operation:${suffix}`,
			idempotencyKey: `instances:operation:${suffix}`,
			status: "QUEUED",
			request: { hidden: leak },
			response: { hidden: leak },
		},
	});
	await db.actionReceipt.create({
		data: {
			id: receiptId,
			operationKey: "instances.operation.read",
			idempotencyKey: `instances:receipt:${suffix}`,
			requestHash: `receipt-hash-${suffix}`,
			provider: "vercel",
			channel: "instances",
			providerAccountId,
			providerOperationId: operationId,
			status: "SUCCEEDED",
			costUsd: "0.000000",
			completedAt: new Date("2026-08-11T10:06:00.000Z"),
			providerReadback: { hidden: leak },
			result: { hidden: leak },
		},
	});
	await db.incident.create({
		data: {
			instanceId,
			provider: "vercel",
			fingerprint: `incident-${suffix}`,
			severity: "HIGH",
			status: "OPEN",
			title: "Drift detected",
			summary: "Resource status requires review.",
			metadata: { hidden: leak },
			detectedAt: new Date("2026-08-11T10:07:00.000Z"),
		},
	});
	await db.usageSample.create({
		data: {
			customerAccountId: accountId,
			instanceId,
			providerAccountId,
			provider: "vercel",
			metric: `requests-${suffix}`,
			quantity: "12.000000",
			unit: "count",
			observedAt: new Date("2026-08-11T10:08:00.000Z"),
			dimensions: { hidden: leak },
			source: "local-test",
		},
	});
	await db.costLineItem.create({
		data: {
			customerAccountId: accountId,
			instanceId,
			providerAccountId,
			provider: "vercel",
			externalId: `cost-${suffix}`,
			category: "hosting",
			description: "Projected platform usage",
			quantity: "1.000000",
			unitCost: "2.50000000",
			totalCost: "2.50000000",
			currency: "USD",
			periodStart: new Date("2026-08-01T00:00:00.000Z"),
			periodEnd: new Date("2026-08-31T23:59:59.000Z"),
			metadata: { hidden: leak },
		},
	});
	await db.workItem.create({
		data: {
			id: workId,
			subjectType: "CUSTOMER_INSTANCE",
			subjectId: instanceId,
			subjectLabel: `Production ${suffix}`,
			ownerId,
			queue: "instances",
			urgency: "NORMAL",
			reason: "Prepare read-only instance discovery dry-run.",
			primaryAction: "Prepare instance discovery dry-run",
			evidence: {
				requiredGaps: ["providerResourceCensus", "observedState"],
				providerMutationDisabled: true,
				customerMutationDisabled: true,
			},
		},
	});
});

afterAll(clean);

describe("instances read model", () => {
	it("lists and details redacted read-only instance state", async () => {
		const list = await instances.list(
			{
				q: suffix,
				sort: "updatedAt",
				dir: "desc",
				page: 1,
				pageSize: 25,
				status: "ACTIVE",
				environment: "production",
				provider: "vercel",
			},
			ownerId,
		);
		expect(list.rows).toHaveLength(1);
		expect(list.rows[0]?.counts.resources).toBe(1);
		expect(list.rows[0]?.counts.openWork).toBe(1);
		expect(list.rows[0]?.counts.pendingApprovals).toBe(1);
		expect(list.rows[0]?.counts.openIncidents).toBe(1);
		expect(list.facetCounts.status?.ACTIVE).toBe(1);
		expect(list.facetCounts.environment?.production).toBe(1);
		expect(list.facetCounts.provider?.vercel).toBe(1);

		const memberDetail = await instances.byId(instanceId, ownerId);
		expect(memberDetail.providerAccounts).toHaveLength(1);
		expect(memberDetail.resources[0]).toMatchObject({
			provider: "vercel",
			resourceType: "project",
			status: "DRIFTED",
		});
		expect(memberDetail.latestObservedState?.status).toBe("STALE");
		expect(memberDetail.latestDesiredRevision?.status).toBe("PLANNED");
		expect(memberDetail.plans[0]?.steps).toHaveLength(1);
		expect(memberDetail.commands).toHaveLength(1);
		expect(memberDetail.operations).toHaveLength(1);
		expect(memberDetail.receipts).toHaveLength(1);
		expect(memberDetail.approvals[0]?.integrityValid).toBe(true);
		expect(memberDetail.approvals[0]?.capabilities.canApprove).toBe(false);
		expect(memberDetail.incidents).toHaveLength(0);
		expect(memberDetail.safety.secretValuesHidden).toBe(true);
		expect(memberDetail.safety.requiredGaps).toContain(
			"providerResourceCensus",
		);
		expect(JSON.stringify(memberDetail)).not.toContain(leak);

		await db.member.update({
			where: { id: memberId },
			data: { role: "owner" },
		});
		const adminDetail = await instances.byId(instanceId, ownerId);
		expect(adminDetail.viewer.isAdmin).toBe(true);
		expect(adminDetail.incidents).toHaveLength(1);
		expect(JSON.stringify(adminDetail)).not.toContain(leak);
	});
});
