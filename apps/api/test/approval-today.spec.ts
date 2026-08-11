import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { DEFAULT_WORKSPACE_NAME, WORKSPACE_ID } from "@crm/auth";
import { db } from "@crm/db";
import { approvalContentDigest } from "@crm/db/approval";
import { workspaceSlug } from "@crm/db/workspace";
import { ForbiddenException } from "@nestjs/common";
import { approvalListInput } from "../src/approval/approval.contracts";
import { ApprovalService } from "../src/approval/approval.service";
import { ApprovalExecutionService } from "../src/operating-kernel/approval-execution.service";
import { KernelIdempotencyService } from "../src/operating-kernel/kernel-idempotency.service";
import { OperatingKernelAccessService } from "../src/operating-kernel/operating-kernel-access.service";
import { SubjectResolverService } from "../src/operating-kernel/subject-resolver.service";
import { todayInput } from "../src/today/today.contracts";
import { TodayService } from "../src/today/today.service";
import { workListInput } from "../src/work/work.contracts";
import { WorkService } from "../src/work/work.service";

const suffix = crypto.randomUUID();
const ownerId = `today-owner-${suffix}`;
const adminId = `today-admin-${suffix}`;
const memberId = `today-member-${suffix}`;
const foreignId = `today-foreign-${suffix}`;
const companyId = `today-company-${suffix}`;
const accountId = `today-account-${suffix}`;
const instanceId = `today-instance-${suffix}`;
const ownerMembershipId = `today-owner-membership-${suffix}`;
const adminMembershipId = `today-admin-membership-${suffix}`;
const memberMembershipId = `today-member-membership-${suffix}`;
const membershipIds = [
	ownerMembershipId,
	adminMembershipId,
	memberMembershipId,
];
const approvalIds: string[] = [];
const approvalRequestKeys: string[] = [];
const workIds: string[] = [];
const taskIds: string[] = [];

const access = new OperatingKernelAccessService(db);
const subjects = new SubjectResolverService(db);
const idempotency = new KernelIdempotencyService();
const approvals = new ApprovalService(db, access, subjects, idempotency);
const today = new TodayService(db, access, subjects);
const execution = new ApprovalExecutionService(db);
const work = new WorkService(db, access, subjects, idempotency);

function validApproval(input: {
	id: string;
	action?: string;
	risk?: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
	targetId?: string;
	expiresAt?: Date;
	invalidationVersion?: number;
}) {
	const contentSnapshot = { body: `Private approval body ${input.id}` };
	const expiresAt = input.expiresAt ?? new Date(Date.now() + 60 * 60_000);
	const invalidationVersion = input.invalidationVersion ?? 0;
	const action = input.action ?? "outreach.send";
	const risk = input.risk ?? "LOW";
	const targetId = input.targetId ?? companyId;
	const contentDigest = approvalContentDigest({
		action,
		contentSnapshot,
		targetType: "COMPANY",
		targetId,
		risk,
		policyVersion: "today-v1",
		expiresAt,
		invalidationVersion,
	});
	approvalIds.push(input.id);
	const idempotencyKey = `today-approval-${input.id}`;
	approvalRequestKeys.push(idempotencyKey);
	return db.approvalRequest.create({
		data: {
			id: input.id,
			action,
			contentDigest,
			contentSnapshot,
			targetType: "COMPANY",
			targetId,
			risk,
			policyVersion: "today-v1",
			expiresAt,
			invalidationVersion,
			status: "PENDING",
			idempotencyKey,
		},
	});
}

async function createWork(input: {
	id: string;
	ownerId?: string | null;
	state?: "OPEN" | "IN_PROGRESS" | "WAITING" | "BLOCKED";
}) {
	workIds.push(input.id);
	return db.workItem.create({
		data: {
			id: input.id,
			subjectType: "COMPANY",
			subjectId: companyId,
			ownerId: input.ownerId ?? null,
			queue: "today",
			urgency: "HIGH",
			dueAt: new Date(Date.now() + 60_000),
			nextReviewAt:
				input.state === "WAITING" ? new Date(Date.now() + 60_000) : undefined,
			reason: `Work reason ${input.id}`,
			state: input.state ?? "OPEN",
			primaryAction: `Work action ${input.id}`,
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
			{ id: ownerId, name: "Today Owner", email: `${ownerId}@example.test` },
			{ id: adminId, name: "Today Admin", email: `${adminId}@example.test` },
			{ id: memberId, name: "Today Member", email: `${memberId}@example.test` },
			{
				id: foreignId,
				name: "Foreign Member",
				email: `${foreignId}@example.test`,
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
				id: adminMembershipId,
				organizationId: WORKSPACE_ID,
				userId: adminId,
				role: "admin",
				createdAt: new Date(),
			},
			{
				id: memberMembershipId,
				organizationId: WORKSPACE_ID,
				userId: memberId,
				role: "member",
				createdAt: new Date(),
			},
		],
	});
	await db.company.create({
		data: { id: companyId, name: "Today Company", domain: `${suffix}.test` },
	});
	await db.customerAccount.create({
		data: { id: accountId, name: "Today Account", companyId },
	});
	await db.customerInstance.create({
		data: {
			id: instanceId,
			accountId,
			key: `today-${suffix}`,
			name: "Today Instance",
			environment: "test",
			region: "test",
		},
	});
});

afterAll(async () => {
	await db.actionReceipt.deleteMany({
		where: { idempotencyKey: { in: approvalRequestKeys } },
	});
	await db.incident.deleteMany({ where: { instanceId } });
	await db.agentTask.deleteMany({ where: { id: { in: taskIds } } });
	await db.approvalRequest.deleteMany({ where: { id: { in: approvalIds } } });
	await db.workItem.deleteMany({ where: { id: { in: workIds } } });
	await db.customerInstance.deleteMany({ where: { id: instanceId } });
	await db.customerAccount.deleteMany({ where: { id: accountId } });
	await db.company.deleteMany({ where: { id: companyId } });
	await db.member.deleteMany({ where: { id: { in: membershipIds } } });
	await db.user.deleteMany({
		where: { id: { in: [ownerId, adminId, memberId, foreignId] } },
	});
});

describe("approval API", () => {
	it("keeps list summary-only and denies ineligible detail", async () => {
		const lowId = `today-list-low-${suffix}`;
		const highId = `today-list-high-${suffix}`;
		await validApproval({ id: lowId });
		await validApproval({
			id: highId,
			action: "infrastructure.restart",
			risk: "HIGH",
		});

		const list = await approvals.list(
			approvalListInput.parse({ page: 1, pageSize: 10 }),
			memberId,
		);
		const row = list.rows.find((item) => item.id === lowId);
		expect(row).toBeDefined();
		expect(row).not.toHaveProperty("contentSnapshot");
		expect(row?.viewer.canApprove).toBe(true);
		await expect(approvals.detail(highId, memberId)).rejects.toBeInstanceOf(
			ForbiddenException,
		);
		const adminDetail = await approvals.detail(highId, adminId);
		expect(adminDetail.contentSnapshot).toEqual({
			body: `Private approval body ${highId}`,
		});
	});

	it("reports corrupted integrity without exposing mutation capability", async () => {
		const id = `today-corrupt-${suffix}`;
		const approval = await validApproval({ id });
		await db.approvalRequest.update({
			where: { id },
			data: { contentDigest: `corrupt-${approval.contentDigest}` },
		});
		const list = await approvals.list(
			approvalListInput.parse({ page: 1, pageSize: 100 }),
			adminId,
		);
		const row = list.rows.find((item) => item.id === id);
		expect(row?.integrityValid).toBe(false);
		expect(row?.viewer).toEqual({
			canApprove: false,
			canReject: false,
			canInvalidate: false,
		});
		const detail = await approvals.detail(id, adminId);
		expect(detail.integrityValid).toBe(false);
		expect(detail.contentSnapshot).toBeDefined();
		await expect(
			approvals.reject(
				{
					id,
					expectedVersion: 0,
					contentDigest: approval.contentDigest,
					invalidationVersion: 0,
					clientRequestId: crypto.randomUUID(),
				},
				adminId,
			),
		).rejects.toThrow("digest is invalid");
	});

	it("approves with actor-bound replay and rejects an authorized collision", async () => {
		const id = `today-approve-${suffix}`;
		const approval = await validApproval({ id });
		const clientRequestId = crypto.randomUUID();
		approvalRequestKeys.push(clientRequestId);
		const input = {
			id,
			expectedVersion: 0,
			contentDigest: approval.contentDigest,
			invalidationVersion: 0,
			clientRequestId,
		};
		const first = await approvals.approve(input, memberId);
		expect(first.approval.status).toBe("APPROVED");
		expect(first.receipt.status).toBe("SUCCEEDED");
		expect(await approvals.approve(input, memberId)).toEqual(first);
		await expect(approvals.approve(input, adminId)).rejects.toThrow(
			"client request id has already been used",
		);
		const receipt = await db.actionReceipt.findUnique({
			where: { idempotencyKey: input.clientRequestId },
			select: { provider: true, channel: true, status: true },
		});
		expect(receipt).toEqual({
			provider: "crm",
			channel: "operating-kernel",
			status: "SUCCEEDED",
		});
		await db.approvalRequest.update({
			where: { id },
			data: { contentSnapshot: { body: "Tampered after approval" } },
		});
		await expect(approvals.approve(input, memberId)).rejects.toThrow(
			"digest is invalid",
		);

		const rejectedId = `today-reject-replay-${suffix}`;
		const rejected = await validApproval({ id: rejectedId });
		const rejectRequestId = crypto.randomUUID();
		approvalRequestKeys.push(rejectRequestId);
		const rejectInput = {
			id: rejectedId,
			expectedVersion: 0,
			contentDigest: rejected.contentDigest,
			invalidationVersion: 0,
			clientRequestId: rejectRequestId,
		};
		await approvals.reject(rejectInput, memberId);
		await db.approvalRequest.update({
			where: { id: rejectedId },
			data: { contentSnapshot: { body: "Tampered after rejection" } },
		});
		await expect(approvals.reject(rejectInput, memberId)).rejects.toThrow(
			"digest is invalid",
		);
	});

	it("persists expiry before conflict", async () => {
		const id = `today-expired-${suffix}`;
		const approval = await validApproval({
			id,
			expiresAt: new Date(Date.now() - 60_000),
		});
		await expect(
			approvals.approve(
				{
					id,
					expectedVersion: 0,
					contentDigest: approval.contentDigest,
					invalidationVersion: 0,
					clientRequestId: crypto.randomUUID(),
				},
				memberId,
			),
		).rejects.toThrow("has expired");
		expect(
			await db.approvalRequest.findUnique({
				where: { id },
				select: { status: true, version: true },
			}),
		).toEqual({
			status: "EXPIRED",
			version: 1,
		});
	});

	it("increments invalidation and replays only the exact post-state", async () => {
		const id = `today-invalidate-${suffix}`;
		const approval = await validApproval({ id });
		const approveRequestId = crypto.randomUUID();
		approvalRequestKeys.push(approveRequestId);
		const approved = await approvals.approve(
			{
				id,
				expectedVersion: 0,
				contentDigest: approval.contentDigest,
				invalidationVersion: 0,
				clientRequestId: approveRequestId,
			},
			memberId,
		);
		expect(approved.approval.status).toBe("APPROVED");
		const invalidateRequestId = crypto.randomUUID();
		approvalRequestKeys.push(invalidateRequestId);
		const input = {
			id,
			expectedVersion: 1,
			contentDigest: approval.contentDigest,
			invalidationVersion: 0,
			clientRequestId: invalidateRequestId,
		};
		const first = await approvals.invalidate(input, adminId);
		expect(first.approval.invalidationVersion).toBe(1);
		expect(first.approval.version).toBe(2);
		expect(first.approval.contentDigest).toBe(approval.contentDigest);
		expect(first.approval.integrityValid).toBe(true);
		expect(await approvals.invalidate(input, adminId)).toEqual(first);
		const listed = await approvals.list(
			approvalListInput.parse({ page: 1, pageSize: 100 }),
			adminId,
		);
		expect(listed.rows.find((row) => row.id === id)?.integrityValid).toBe(true);
		expect((await approvals.detail(id, adminId)).integrityValid).toBe(true);
		await db.approvalRequest.update({
			where: { id },
			data: { contentSnapshot: { body: "Tampered after invalidation" } },
		});
		await expect(approvals.invalidate(input, adminId)).rejects.toThrow(
			"digest is invalid",
		);
		const stored = await db.approvalRequest.findUnique({
			where: { id },
			select: { status: true, version: true, invalidationVersion: true },
		});
		expect(stored).toEqual({
			status: "INVALIDATED",
			version: 2,
			invalidationVersion: 1,
		});

		const receiptId = `today-stale-execution-receipt-${suffix}`;
		approvalRequestKeys.push(receiptId);
		await db.actionReceipt.create({
			data: {
				id: receiptId,
				idempotencyKey: receiptId,
				requestHash: approval.contentDigest,
				provider: "crm",
				channel: "operating-kernel",
				status: "SUCCEEDED",
				approvalRequestId: id,
				completedAt: new Date(),
			},
		});
		await expect(
			execution.consumeApproved({
				approvalRequestId: id,
				contentDigest: approval.contentDigest,
				expectedVersion: 1,
				invalidationVersion: 0,
				actionReceiptId: receiptId,
			}),
		).rejects.toThrow("not executable");
	});
});

describe("Today and Work projections", () => {
	it("enforces work capabilities for admin, assigned, unassigned, and foreign viewers", async () => {
		const unassignedId = `today-cap-unassigned-${suffix}`;
		const assignedId = `today-cap-assigned-${suffix}`;
		const foreignWorkId = `today-cap-foreign-${suffix}`;
		await createWork({ id: unassignedId });
		await createWork({ id: assignedId, ownerId: memberId });
		await createWork({ id: foreignWorkId, ownerId: ownerId });

		const memberRows = (
			await work.list(workListInput.parse({ pageSize: 25 }), memberId)
		).rows;
		const memberUnassigned = memberRows.find((row) => row.id === unassignedId);
		const memberAssigned = memberRows.find((row) => row.id === assignedId);
		expect(memberUnassigned?.capabilities).toEqual({
			canClaim: true,
			canAssign: false,
			canStart: false,
			canWait: false,
			canBlock: false,
			canComplete: false,
			canDismiss: false,
		});
		expect(memberAssigned?.capabilities).toEqual({
			canClaim: false,
			canAssign: false,
			canStart: true,
			canWait: true,
			canBlock: true,
			canComplete: true,
			canDismiss: true,
		});
		const adminRows = (
			await work.list(workListInput.parse({ pageSize: 25 }), adminId)
		).rows;
		expect(
			adminRows.find((row) => row.id === foreignWorkId)?.capabilities,
		).toEqual({
			canClaim: false,
			canAssign: true,
			canStart: true,
			canWait: true,
			canBlock: true,
			canComplete: true,
			canDismiss: true,
		});
		await expect(
			work.list(workListInput.parse({}), foreignId),
		).rejects.toBeInstanceOf(ForbiddenException);
	});

	it("returns role-filtered Today sections with bounded safe rows", async () => {
		const ownOpen = `today-do-next-${suffix}`;
		const ownWaiting = `today-waiting-${suffix}`;
		const ownBlocked = `today-blocked-${suffix}`;
		const foreignBlocked = `today-foreign-blocked-${suffix}`;
		await createWork({ id: ownOpen, ownerId: memberId });
		await createWork({ id: ownWaiting, ownerId: memberId, state: "WAITING" });
		await createWork({ id: ownBlocked, ownerId: memberId, state: "BLOCKED" });
		await createWork({
			id: foreignBlocked,
			ownerId: ownerId,
			state: "BLOCKED",
		});
		const failedTaskId = `today-failed-task-${suffix}`;
		const leasedTaskId = `today-leased-task-${suffix}`;
		taskIds.push(failedTaskId, leasedTaskId);
		await db.agentTask.createMany({
			data: [
				{
					id: failedTaskId,
					kind: "failed-test",
					reason: "Internal failure reason",
					state: "FAILED",
					dueAt: new Date(),
				},
				{
					id: leasedTaskId,
					kind: "leased-test",
					reason: "Internal running reason",
					state: "LEASED",
					dueAt: new Date(),
				},
			],
		});
		const incidentId = `today-incident-${suffix}`;
		await db.incident.create({
			data: {
				id: incidentId,
				instanceId,
				severity: "HIGH",
				status: "OPEN",
				title: "Instance needs attention",
				summary: "Safe incident summary",
			},
		});

		const memberToday = await today.get(
			todayInput.parse({ limit: 10 }),
			memberId,
		);
		expect(memberToday.viewer).toEqual({
			role: "member",
			isAdmin: false,
			mode: "operator",
		});
		expect(
			memberToday.sections.doNext.rows.some((row) => row.id === ownOpen),
		).toBe(true);
		expect(
			memberToday.sections.waiting.rows.some((row) => row.id === ownWaiting),
		).toBe(true);
		expect(
			memberToday.sections.blockedOrFailed.rows.some(
				(row) => row.id === ownBlocked,
			),
		).toBe(true);
		expect(
			memberToday.sections.blockedOrFailed.rows.some(
				(row) => row.id === foreignBlocked,
			),
		).toBe(false);
		expect(
			memberToday.sections.blockedOrFailed.rows.some(
				(row) => row.id === failedTaskId,
			),
		).toBe(false);
		expect(
			memberToday.sections.running.rows.some((row) => row.id === leasedTaskId),
		).toBe(false);
		expect(memberToday.sections.incidents).toEqual({ rows: [], total: 0 });
		const serializedMember = JSON.stringify(memberToday);
		expect(serializedMember).not.toContain("contentSnapshot");
		expect(serializedMember).not.toContain("Private approval body");

		const adminToday = await today.get(todayInput.parse({ limit: 1 }), adminId);
		expect(adminToday.viewer).toEqual({
			role: "admin",
			isAdmin: true,
			mode: "owner",
		});
		expect(adminToday.sections.blockedOrFailed.total).toBeGreaterThanOrEqual(1);
		expect(adminToday.sections.running.total).toBeGreaterThanOrEqual(1);
		expect(
			adminToday.sections.incidents.rows.some((row) => row.id === incidentId),
		).toBe(true);
		for (const section of Object.values(adminToday.sections)) {
			expect(section.rows.length).toBeLessThanOrEqual(1);
		}
	});
});
