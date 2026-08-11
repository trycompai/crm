import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { DEFAULT_WORKSPACE_NAME, WORKSPACE_ID } from "@crm/auth";
import { db } from "@crm/db";
import { workspaceSlug } from "@crm/db/workspace";
import { ForbiddenException } from "@nestjs/common";
import { KernelIdempotencyService } from "../src/operating-kernel/kernel-idempotency.service";
import { OperatingKernelAccessService } from "../src/operating-kernel/operating-kernel-access.service";
import { OperatingKernelCleanupService } from "../src/operating-kernel/operating-kernel-cleanup.service";
import { SubjectResolverService } from "../src/operating-kernel/subject-resolver.service";
import { workListInput } from "../src/work/work.contracts";
import { WorkService } from "../src/work/work.service";

const suffix = crypto.randomUUID();
const ownerId = `kernel-owner-${suffix}`;
const memberId = `kernel-member-${suffix}`;
const secondMemberId = `kernel-member-two-${suffix}`;
const adminId = `kernel-admin-${suffix}`;
const secondAdminId = `kernel-admin-two-${suffix}`;
const outsiderId = `kernel-outsider-${suffix}`;
const memberMembershipId = `kernel-membership-${suffix}`;
const secondMembershipId = `kernel-membership-two-${suffix}`;
const adminMembershipId = `kernel-admin-membership-${suffix}`;
const secondAdminMembershipId = `kernel-admin-membership-two-${suffix}`;
const ownerMembershipId = `kernel-owner-membership-${suffix}`;
const outsiderMembershipId = `kernel-outsider-membership-${suffix}`;
const companyId = `kernel-company-${suffix}`;
const service = new WorkService(
	db,
	new OperatingKernelAccessService(db),
	new SubjectResolverService(db),
	new KernelIdempotencyService(),
);
const cleanup = new OperatingKernelCleanupService();
const workIds: string[] = [];
const requestIds: string[] = [];

function requestId(): string {
	const id = crypto.randomUUID();
	requestIds.push(id);
	return id;
}

async function receiptFor(idempotencyKey: string) {
	return db.actionReceipt.findUnique({
		where: { idempotencyKey },
		select: {
			id: true,
			provider: true,
			channel: true,
			operationKey: true,
			requestHash: true,
			status: true,
			completedAt: true,
			result: true,
		},
	});
}

async function createWork(input: {
	id: string;
	ownerId?: string | null;
	state?: "OPEN" | "IN_PROGRESS" | "WAITING" | "BLOCKED" | "DONE" | "DISMISSED";
	queue?: string;
	subjectId?: string;
	evidence?: { source: string; facts: string[] };
}) {
	workIds.push(input.id);
	return db.workItem.create({
		data: {
			id: input.id,
			subjectType: "COMPANY",
			subjectId: input.subjectId ?? companyId,
			subjectLabel: "Cached label must not become truth",
			ownerId: input.ownerId ?? null,
			queue: input.queue ?? "operator",
			urgency: "NORMAL",
			reason: `Reason ${input.id}`,
			state: input.state ?? "OPEN",
			primaryAction: `Action ${input.id}`,
			evidence: input.evidence,
		},
	});
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
	await db.user.createMany({
		data: [
			{ id: ownerId, name: "Kernel Owner", email: `${ownerId}@example.test` },
			{
				id: memberId,
				name: "Kernel Member",
				email: `${memberId}@example.test`,
			},
			{
				id: secondMemberId,
				name: "Kernel Member Two",
				email: `${secondMemberId}@example.test`,
			},
			{
				id: adminId,
				name: "Kernel Admin",
				email: `${adminId}@example.test`,
			},
			{
				id: secondAdminId,
				name: "Kernel Admin Two",
				email: `${secondAdminId}@example.test`,
			},
			{
				id: outsiderId,
				name: "Kernel Outsider",
				email: `${outsiderId}@example.test`,
			},
		],
	});
	await db.member.createMany({
		data: [
			{
				id: ownerMembershipId,
				organizationId: WORKSPACE_ID,
				userId: ownerId,
				role: "owner",
				createdAt: new Date(),
			},
			{
				id: memberMembershipId,
				organizationId: WORKSPACE_ID,
				userId: memberId,
				role: "member",
				createdAt: new Date(),
			},
			{
				id: secondMembershipId,
				organizationId: WORKSPACE_ID,
				userId: secondMemberId,
				role: "member",
				createdAt: new Date(),
			},
			{
				id: adminMembershipId,
				organizationId: WORKSPACE_ID,
				userId: adminId,
				role: "admin",
				createdAt: new Date(),
			},
			{
				id: secondAdminMembershipId,
				organizationId: WORKSPACE_ID,
				userId: secondAdminId,
				role: "admin",
				createdAt: new Date(),
			},
			{
				id: outsiderMembershipId,
				organizationId: WORKSPACE_ID,
				userId: outsiderId,
				role: "member",
				createdAt: new Date(),
			},
		],
	});
	await db.member.delete({ where: { id: outsiderMembershipId } });
	await db.company.create({
		data: {
			id: companyId,
			name: "Kernel Company",
			domain: `${suffix}.example.test`,
		},
	});
});

afterAll(async () => {
	await db.actionReceipt.deleteMany({
		where: { idempotencyKey: { in: requestIds } },
	});
	await db.agentTask.deleteMany({ where: { subjectId: companyId } });
	await db.approvalRequest.deleteMany({ where: { targetId: companyId } });
	await db.workItem.deleteMany({ where: { id: { in: workIds } } });
	await db.company.deleteMany({ where: { id: companyId } });
	await db.member.deleteMany({
		where: {
			id: {
				in: [
					ownerMembershipId,
					memberMembershipId,
					secondMembershipId,
					adminMembershipId,
					secondAdminMembershipId,
				],
			},
		},
	});
	await db.user.deleteMany({
		where: {
			id: {
				in: [
					ownerId,
					memberId,
					secondMemberId,
					adminId,
					secondAdminId,
					outsiderId,
				],
			},
		},
	});
});

describe("operating kernel Work", () => {
	it("requires workspace membership and returns paginated, resolved rows and facets", async () => {
		await createWork({
			id: `kernel-list-a-${suffix}`,
			queue: "alpha",
			evidence: { source: "test", facts: ["persisted"] },
		});
		await createWork({
			id: `kernel-list-b-${suffix}`,
			queue: "beta",
			ownerId: memberId,
		});
		await createWork({
			id: `kernel-list-missing-${suffix}`,
			subjectId: `missing-${suffix}`,
		});

		const result = await service.list(
			workListInput.parse({ page: 1, pageSize: 2, sort: "queue", dir: "asc" }),
			memberId,
		);

		expect(result.rows).toHaveLength(2);
		expect(result.total).toBeGreaterThanOrEqual(3);
		expect(result.facetCounts.queue?.alpha).toBe(1);
		expect(result.rows[0]?.subject.label).toBe("Kernel Company");
		expect(result.rows[0]?.subject.missing).toBe(false);
		expect(result.rows[0]?.evidence).toEqual({
			source: "test",
			facts: ["persisted"],
		});

		const missing = await service.detail(
			`kernel-list-missing-${suffix}`,
			memberId,
		);
		expect(missing.subject.label).toBeNull();
		expect(missing.subject.missing).toBe(true);
		expect(missing.evidence).toBeNull();
		await expect(
			service.list(workListInput.parse({}), outsiderId),
		).rejects.toBeInstanceOf(ForbiddenException);
	});

	it("enforces the transition graph, timestamps, and durable replay", async () => {
		const id = `kernel-transition-${suffix}`;
		await createWork({ id });

		const claimInput = { id, expectedVersion: 0, clientRequestId: requestId() };
		const claimed = await service.claim(claimInput, memberId);
		expect(claimed).toMatchObject({
			id,
			state: "OPEN",
			ownerId: memberId,
			version: 1,
		});
		expect(claimed.receipt).toMatchObject({
			status: "SUCCEEDED",
			operationKey: "work.claim",
			completedAt: expect.any(String),
		});
		expect(await service.claim(claimInput, memberId)).toEqual(claimed);
		const claimReceipt = await receiptFor(claimInput.clientRequestId);
		expect(claimReceipt).toMatchObject({
			provider: "lode-crm",
			channel: "work",
			operationKey: "work.claim",
			status: "SUCCEEDED",
			completedAt: expect.any(Date),
		});
		expect(claimReceipt?.id).toBe(claimed.receipt.id);
		expect(claimReceipt?.result).toEqual(claimed);
		expect(
			Object.keys(
				(claimReceipt?.result ?? {}) as Record<string, unknown>,
			).sort(),
		).toEqual([
			"completedAt",
			"id",
			"nextReviewAt",
			"ownerId",
			"receipt",
			"startedAt",
			"state",
			"version",
		]);
		expect(
			await db.actionReceipt.count({
				where: { idempotencyKey: claimInput.clientRequestId },
			}),
		).toBe(1);

		const startInput = {
			id,
			expectedVersion: 1,
			clientRequestId: requestId(),
		};
		const started = await service.start(startInput, memberId);
		expect(started.state).toBe("IN_PROGRESS");
		expect(started.startedAt).toBeString();
		expect(started.receipt.operationKey).toBe("work.start");

		const nextReviewAt = new Date(Date.now() + 60_000).toISOString();
		const waiting = await service.wait(
			{
				id,
				expectedVersion: 2,
				clientRequestId: requestId(),
				reason: "Waiting on a customer",
				nextReviewAt,
			},
			memberId,
		);
		expect(waiting).toMatchObject({ state: "WAITING", nextReviewAt });
		expect(waiting.receipt.operationKey).toBe("work.wait");
		expect(await service.start(startInput, memberId)).toEqual(started);

		const blocked = await service.block(
			{
				id,
				expectedVersion: 3,
				clientRequestId: requestId(),
				reason: "Blocked by missing data",
			},
			memberId,
		);
		expect(blocked).toMatchObject({ state: "BLOCKED", nextReviewAt: null });
		expect(blocked.receipt.operationKey).toBe("work.block");

		const completed = await service.complete(
			{ id, expectedVersion: 4, clientRequestId: requestId() },
			memberId,
		);
		expect(completed).toMatchObject({
			state: "DONE",
			completedAt: expect.any(String),
		});
		expect(completed.receipt.operationKey).toBe("work.complete");

		const dismissedId = `kernel-dismiss-${suffix}`;
		await createWork({ id: dismissedId, ownerId: memberId });
		const dismissed = await service.dismiss(
			{
				id: dismissedId,
				expectedVersion: 0,
				clientRequestId: requestId(),
				reason: "No longer needed",
			},
			memberId,
		);
		expect(dismissed).toMatchObject({
			state: "DISMISSED",
			completedAt: expect.any(String),
		});
		expect(dismissed.receipt.operationKey).toBe("work.dismiss");
		const failedRequestId = requestId();
		await expect(
			service.dismiss(
				{
					id,
					expectedVersion: 5,
					clientRequestId: failedRequestId,
					reason: "Too late",
				},
				memberId,
			),
		).rejects.toThrow("Terminal work cannot transition");
		expect(await receiptFor(failedRequestId)).toBeNull();
	});

	it("binds replay receipts to the authenticated actor", async () => {
		const id = `kernel-actor-${suffix}`;
		await createWork({ id, ownerId: memberId });
		const input = {
			id,
			assigneeId: secondMemberId,
			expectedVersion: 0,
			clientRequestId: requestId(),
		};

		await service.assign(input, adminId);
		await expect(service.assign(input, secondAdminId)).rejects.toThrow(
			"client request id has already been used",
		);
		await expect(
			service.assign({ ...input, assigneeId: memberId }, adminId),
		).rejects.toThrow("client request id has already been used");
	});

	it("enforces role and owner authority", async () => {
		const id = `kernel-authority-${suffix}`;
		await createWork({ id, ownerId: ownerId });
		await expect(
			service.start(
				{ id, expectedVersion: 0, clientRequestId: requestId() },
				memberId,
			),
		).rejects.toThrow("assigned to you");
		await expect(
			service.assign(
				{
					id,
					assigneeId: memberId,
					expectedVersion: 0,
					clientRequestId: requestId(),
				},
				memberId,
			),
		).rejects.toThrow("owner or admin");
		const assigned = await service.assign(
			{
				id,
				assigneeId: memberId,
				expectedVersion: 0,
				clientRequestId: requestId(),
			},
			ownerId,
		);
		expect(assigned.ownerId).toBe(memberId);
		expect(assigned.receipt.operationKey).toBe("work.assign");
	});

	it("allows exactly one concurrent claim and rejects stale versions", async () => {
		const id = `kernel-race-${suffix}`;
		await createWork({ id });
		const firstRequestId = requestId();
		const secondRequestId = requestId();
		const results = await Promise.allSettled([
			service.claim(
				{ id, expectedVersion: 0, clientRequestId: firstRequestId },
				memberId,
			),
			service.claim(
				{ id, expectedVersion: 0, clientRequestId: secondRequestId },
				secondMemberId,
			),
		]);
		expect(
			results.filter((result) => result.status === "fulfilled"),
		).toHaveLength(1);
		expect(
			results.filter((result) => result.status === "rejected"),
		).toHaveLength(1);
		const row = await db.workItem.findUnique({
			where: { id },
			select: { ownerId: true, version: true },
		});
		expect([memberId, secondMemberId]).toContain(row?.ownerId as string);
		expect(row?.version).toBe(1);
		expect(
			await db.actionReceipt.count({
				where: { idempotencyKey: { in: [firstRequestId, secondRequestId] } },
			}),
		).toBe(1);
		const staleRequestId = requestId();
		await expect(
			service.start(
				{ id, expectedVersion: 0, clientRequestId: staleRequestId },
				memberId,
			),
		).rejects.toThrow("version is stale");
		expect(await receiptFor(staleRequestId)).toBeNull();
	});

	it("cleans linked kernel records without erasing their history", async () => {
		const workId = `kernel-cleanup-work-${suffix}`;
		const approvalId = `kernel-cleanup-approval-${suffix}`;
		const approvedApprovalId = `kernel-cleanup-approved-${suffix}`;
		const taskId = `kernel-cleanup-task-${suffix}`;
		await createWork({ id: workId });
		await db.approvalRequest.create({
			data: {
				id: approvalId,
				action: "outreach.send",
				contentDigest: `digest-${suffix}`,
				contentSnapshot: { subject: "Test" },
				targetType: "COMPANY",
				targetId: companyId,
				risk: "LOW",
				policyVersion: "test-v1",
				expiresAt: new Date(Date.now() + 60_000),
				idempotencyKey: `approval-${suffix}`,
			},
		});
		await db.approvalRequest.create({
			data: {
				id: approvedApprovalId,
				action: "outreach.send",
				contentDigest: `approved-digest-${suffix}`,
				contentSnapshot: { subject: "Approved" },
				targetType: "COMPANY",
				targetId: companyId,
				risk: "LOW",
				policyVersion: "test-v1",
				expiresAt: new Date(Date.now() + 60_000),
				status: "APPROVED",
				approverId: memberId,
				decidedAt: new Date(),
				idempotencyKey: `approved-${suffix}`,
			},
		});
		await db.agentTask.create({
			data: {
				id: taskId,
				subjectType: "COMPANY",
				subjectId: companyId,
				kind: "test",
				reason: "Test task",
				dueAt: new Date(),
				state: "LEASED",
			},
		});

		await db.$transaction(async (tx) => {
			await cleanup.beforeSubjectDelete(tx, { type: "COMPANY", id: companyId });
			await tx.company.delete({ where: { id: companyId } });
		});

		expect(
			await db.approvalRequest.findUnique({
				where: { id: approvalId },
				select: { status: true },
			}),
		).toEqual({ status: "INVALIDATED" });
		expect(
			await db.approvalRequest.findUnique({
				where: { id: approvedApprovalId },
				select: { status: true },
			}),
		).toEqual({ status: "INVALIDATED" });
		expect(
			await db.workItem.findUnique({
				where: { id: workId },
				select: { state: true },
			}),
		).toEqual({ state: "DISMISSED" });
		expect(
			await db.agentTask.findUnique({
				where: { id: taskId },
				select: { state: true, finishedAt: true, outcome: true },
			}),
		).toMatchObject({ state: "CANCELLED", outcome: "SUBJECT_DELETED" });
		await db.company.create({
			data: {
				id: companyId,
				name: "Kernel Company",
				domain: `${suffix}.example.test`,
			},
		});
	});
});
