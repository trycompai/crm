import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { DEFAULT_WORKSPACE_NAME, WORKSPACE_ID } from "@crm/auth";
import { db } from "@crm/db";
import { workspaceSlug } from "@crm/db/workspace";
import { OperatingKernelAccessService } from "../src/operating-kernel/operating-kernel-access.service";
import { ServiceService } from "../src/service/service.service";

const suffix = crypto.randomUUID();
const userId = `service-user-${suffix}`;
const memberId = `service-member-${suffix}`;
const companyId = `service-company-${suffix}`;
const accountId = `service-account-${suffix}`;
const threadId = `service-thread-${suffix}`;
const firstMessageId = `service-message-1-${suffix}`;
const secondMessageId = `service-message-2-${suffix}`;
const policyId = `service-policy-${suffix}`;
const policyKey = `service-policy-${suffix}`;
const fromEmail = `operator-${suffix}@example.test`;
const subject = `Service recovery ${suffix}`;
const requestId = crypto.randomUUID();
const reopenRequestId = crypto.randomUUID();
const replayRequestId = crypto.randomUUID();

const service = new ServiceService(db, new OperatingKernelAccessService(db));

async function clean() {
	const cases = await db.supportCase.findMany({
		where: {
			OR: [
				{ customerAccountId: accountId },
				{ dedupeKey: { contains: suffix } },
				{ title: subject },
			],
		},
		select: { id: true },
	});
	const caseIds = cases.map((row) => row.id);
	await db.actionReceipt.deleteMany({
		where: {
			idempotencyKey: { in: [requestId, reopenRequestId, replayRequestId] },
		},
	});
	await db.supportReplyDraft.deleteMany({
		where: { caseId: { in: caseIds } },
	});
	await db.approvalRequest.deleteMany({
		where: { targetType: "SUPPORT_CASE", targetId: { in: caseIds } },
	});
	await db.workItem.deleteMany({
		where: { subjectType: "SUPPORT_CASE", subjectId: { in: caseIds } },
	});
	await db.supportTriageProposal.deleteMany({
		where: { caseId: { in: caseIds } },
	});
	await db.supportCaseEvent.deleteMany({
		where: { caseId: { in: caseIds } },
	});
	await db.supportCaseSource.deleteMany({
		where: { caseId: { in: caseIds } },
	});
	await db.supportCase.deleteMany({ where: { id: { in: caseIds } } });
	await db.supportSlaPolicy.deleteMany({ where: { id: policyId } });
	await db.emailMessage.deleteMany({
		where: { id: { in: [firstMessageId, secondMessageId] } },
	});
	await db.emailThread.deleteMany({ where: { id: threadId } });
	await db.customerAccount.deleteMany({ where: { id: accountId } });
	await db.company.deleteMany({ where: { id: companyId } });
	await db.member.deleteMany({ where: { id: memberId } });
	await db.user.deleteMany({ where: { id: userId } });
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
		data: { id: userId, name: "Service User", email: `${userId}@test.dev` },
	});
	await db.member.create({
		data: {
			id: memberId,
			organizationId: WORKSPACE_ID,
			userId,
			role: "owner",
			createdAt: new Date(),
		},
	});
	await db.company.create({
		data: {
			id: companyId,
			name: `Service Company ${suffix}`,
			domain: `service-${suffix}.example.test`,
		},
	});
	await db.customerAccount.create({
		data: { id: accountId, companyId, name: `Service Customer ${suffix}` },
	});
	await db.supportSlaPolicy.create({
		data: {
			id: policyId,
			customerAccountId: accountId,
			policyKey,
			name: "Service email normal",
			channel: "email",
			priority: "NORMAL",
			firstResponseMinutes: 60,
			resolutionMinutes: 1440,
		},
	});
	await db.emailThread.create({
		data: {
			id: threadId,
			rootMessageId: `root-${suffix}`,
			subject,
			provider: "AGENTMAIL",
			externalThreadId: `thread-${suffix}`,
			companyId,
			firstMessageAt: new Date("2026-08-11T10:00:00.000Z"),
			lastMessageAt: new Date("2026-08-11T10:00:00.000Z"),
			messageCount: 2,
		},
	});
	await db.emailMessage.createMany({
		data: [
			{
				id: firstMessageId,
				threadId,
				rfcMessageId: `<first-${suffix}@example.test>`,
				provider: "AGENTMAIL",
				externalMessageId: `first-${suffix}`,
				externalThreadId: `thread-${suffix}`,
				direction: "INBOUND",
				fromEmail,
				fromName: "Service Sender",
				recipients: ["support@example.test"],
				subject,
				snippet: "A customer needs help with onboarding data access.",
				body: "A customer needs help with onboarding data access.",
				sentAt: new Date("2026-08-11T10:00:00.000Z"),
			},
			{
				id: secondMessageId,
				threadId,
				rfcMessageId: `<second-${suffix}@example.test>`,
				provider: "AGENTMAIL",
				externalMessageId: `second-${suffix}`,
				externalThreadId: `thread-${suffix}`,
				direction: "INBOUND",
				fromEmail,
				fromName: "Service Sender",
				recipients: ["support@example.test"],
				subject,
				snippet: "Following up on the onboarding data access issue.",
				body: "Following up on the onboarding data access issue.",
				sentAt: new Date("2026-08-11T11:00:00.000Z"),
			},
		],
	});
});

afterAll(clean);

describe("service inbound foundation", () => {
	it("recovers stored inbound mail into a governed support case once", async () => {
		const result = await service.recoverInbound(
			{
				sourceType: "emailMessage",
				sourceId: firstMessageId,
				clientRequestId: requestId,
			},
			userId,
		);
		const replay = await service.recoverInbound(
			{
				sourceType: "emailMessage",
				sourceId: firstMessageId,
				clientRequestId: requestId,
			},
			userId,
		);
		expect(replay).toEqual(result);

		const supportCase = await db.supportCase.findUnique({
			where: { id: result.supportCaseId as string },
			select: {
				customerAccountId: true,
				status: true,
				matchState: true,
				dueAt: true,
				slaPolicyId: true,
				_count: {
					select: {
						sources: true,
						events: true,
						replyDrafts: true,
						triageProposals: true,
					},
				},
			},
		});
		expect(supportCase).toMatchObject({
			customerAccountId: accountId,
			status: "NEW",
			matchState: "MATCHED",
			slaPolicyId: policyId,
		});
		expect(supportCase?.dueAt?.toISOString()).toBe("2026-08-11T11:00:00.000Z");
		expect(supportCase?._count.sources).toBe(1);
		expect(supportCase?._count.replyDrafts).toBe(1);
		expect(supportCase?._count.triageProposals).toBe(1);

		const work = await db.workItem.findUnique({
			where: { id: result.workItemId as string },
			select: {
				subjectType: true,
				queue: true,
				state: true,
				evidence: true,
				primaryAction: true,
			},
		});
		expect(work).toMatchObject({
			subjectType: "SUPPORT_CASE",
			queue: "service",
			state: "OPEN",
			primaryAction: "Triage service case",
		});
		if (!work) throw new Error("Missing service work.");
		const workEvidence = work.evidence as {
			customerReplySendDisabled?: boolean;
		};
		expect(workEvidence.customerReplySendDisabled).toBe(true);

		const approval = await db.approvalRequest.findUnique({
			where: { id: result.approvalRequestId as string },
			select: {
				action: true,
				targetType: true,
				targetId: true,
				risk: true,
				status: true,
				contentDigest: true,
				contentSnapshot: true,
			},
		});
		expect(approval).toMatchObject({
			action: "service.reply.approve",
			targetType: "SUPPORT_CASE",
			targetId: result.supportCaseId,
			risk: "HIGH",
			status: "PENDING",
		});
		if (!approval) throw new Error("Missing service approval.");
		const approvalSnapshot = approval.contentSnapshot as {
			customerReplySendDisabled?: boolean;
		};
		expect(approvalSnapshot.customerReplySendDisabled).toBe(true);

		const draft = await db.supportReplyDraft.findUnique({
			where: { id: result.replyDraftId as string },
			select: {
				status: true,
				contentDigest: true,
				approvalRequestId: true,
				recipients: true,
				sentAt: true,
			},
		});
		expect(draft).toMatchObject({
			status: "PENDING_APPROVAL",
			contentDigest: approval?.contentDigest,
			approvalRequestId: result.approvalRequestId,
			sentAt: null,
		});
		if (!draft) throw new Error("Missing service reply draft.");
		const recipients = draft.recipients as { verifiedRoute?: boolean };
		expect(recipients.verifiedRoute).toBe(true);

		expect(
			await db.actionReceipt.count({ where: { idempotencyKey: requestId } }),
		).toBe(1);

		const listed = await service.list({
			q: subject,
			sort: "updatedAt",
			dir: "desc",
			page: 1,
			pageSize: 25,
			status: "all",
			priority: "all",
			matchState: "MATCHED",
			queue: "service",
			customer: "all",
		});
		expect(listed.rows).toHaveLength(1);
		expect(listed.rows[0]?.counts.openWork).toBe(1);
		expect(listed.rows[0]?.counts.pendingApprovals).toBe(1);
		expect(listed.rows[0]?.disabledReasons.join(" ")).toContain("disabled");
	});

	it("reopens a matched case on a new inbound source without duplicating work", async () => {
		const existing = await db.supportCase.findFirstOrThrow({
			where: { customerAccountId: accountId, title: subject },
			select: { id: true },
		});
		await db.supportCase.update({
			where: { id: existing.id },
			data: { status: "RESOLVED", resolvedAt: new Date() },
		});

		const reopened = await service.recoverInbound(
			{
				sourceType: "emailMessage",
				sourceId: secondMessageId,
				clientRequestId: reopenRequestId,
			},
			userId,
		);
		expect(reopened.supportCaseId).toBe(existing.id);

		const replayDifferentRequest = await service.recoverInbound(
			{
				sourceType: "emailMessage",
				sourceId: secondMessageId,
				clientRequestId: replayRequestId,
			},
			userId,
		);
		expect(replayDifferentRequest.supportCaseId).toBe(existing.id);

		const supportCase = await db.supportCase.findUniqueOrThrow({
			where: { id: existing.id },
			select: {
				status: true,
				resolvedAt: true,
				_count: { select: { sources: true } },
			},
		});
		expect(supportCase.status).toBe("OPEN");
		expect(supportCase.resolvedAt).toBeNull();
		expect(supportCase._count.sources).toBe(2);
		expect(
			await db.workItem.count({
				where: { subjectType: "SUPPORT_CASE", subjectId: existing.id },
			}),
		).toBe(1);
		expect(
			await db.supportCaseEvent.count({
				where: { caseId: existing.id, eventType: "STATUS_CHANGE" },
			}),
		).toBe(1);
	});
});
