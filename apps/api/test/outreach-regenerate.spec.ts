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
const userId = `regen-${suffix}`;
const membershipId = `regen-member-${suffix}`;
const domain = `regen-${suffix}.example.test`;
const inboxId = `regen-inbox-${suffix}`;
const recipient = `buyer@${domain}`;
const requestIds: string[] = [];
let companyId = "";
let contactId = "";
let prospectId = "";
const agent = {
	composeOutreach: () => {
		throw new Error("Regeneration must not dispatch model work.");
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
		data: { id: userId, name: "Regenerator", email: `${userId}@example.test` },
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
	const company = await db.company.create({
		data: { name: "Regenerate Company", domain },
	});
	companyId = company.id;
	const contact = await db.contact.create({
		data: { firstName: "Buyer", email: recipient, companyId },
	});
	contactId = contact.id;
	const prospect = await db.prospect.create({
		data: {
			dedupeKey: `regen:${suffix}`,
			region: "Test",
			country: "United Kingdom",
			countryCode: "GB",
			companyName: "Regenerate Company",
			website: `https://${domain}`,
			status: "PROMOTED",
			routeStatus: "SEND_READY_REVIEW",
			routeEmail: recipient,
			emailAllowed: true,
			emailAllowedAt: new Date(),
			emailAllowedById: userId,
			companyId,
			contactId,
			sourceBatch: `regen:${suffix}`,
		},
	});
	prospectId = prospect.id;
	await db.emailInbox.create({
		data: {
			provider: "AGENTMAIL",
			externalInboxId: inboxId,
			email: `outreach@${domain}`,
			isEnabled: true,
		},
	});
	for (const step of [1, 2, 3]) {
		await db.emailDraft.create({
			data: {
				provider: "AGENTMAIL",
				externalInboxId: inboxId,
				companyId,
				contactId,
				prospectId,
				createdById: userId,
				fromEmail: `outreach@${domain}`,
				recipients: [recipient],
				subject: `Draft ${step}`,
				plainTextBody: `Body ${step}`,
				status: "PENDING_APPROVAL",
				experimentKey: `regen-experiment-${suffix}`,
				variant: "A",
				sequenceId: `regen-sequence-${suffix}`,
				sequenceStep: step,
				scheduledFor: new Date(Date.now() + step * 24 * 60 * 60 * 1_000),
			},
		});
	}
});

afterAll(async () => {
	await db.actionReceipt.deleteMany({
		where: { idempotencyKey: { in: requestIds } },
	});
	await db.agentTask.deleteMany({ where: { prospectId } });
	await db.approvalRequest.deleteMany({
		where: { targetType: "PROSPECT", targetId: prospectId },
	});
	await db.workItem.deleteMany({
		where: { subjectType: "PROSPECT", subjectId: prospectId },
	});
	await db.emailDraft.deleteMany({ where: { prospectId } });
	await db.emailInbox.deleteMany({
		where: { provider: "AGENTMAIL", externalInboxId: inboxId },
	});
	await db.prospect.deleteMany({ where: { id: prospectId } });
	await db.contact.deleteMany({ where: { id: contactId } });
	await db.company.deleteMany({ where: { id: companyId } });
	await db.member.deleteMany({ where: { id: membershipId } });
	await db.user.deleteMany({ where: { id: userId } });
});

describe("outreach regeneration", () => {
	it("requires the current draft digest and creates a paused compose proposal", async () => {
		const before = await outreach.byProspect(prospectId);
		const staleDigest = before.draftSetDigest;
		const [firstDraft] = before.drafts;
		if (!firstDraft) throw new Error("Missing draft fixture.");
		await db.emailDraft.update({
			where: { id: firstDraft.id },
			data: { subject: "Changed draft" },
		});

		await expect(
			outreach.regenerate(prospectId, staleDigest, userId, clientRequestId()),
		).rejects.toThrow("changed");

		const current = await outreach.byProspect(prospectId);
		const result = await outreach.regenerate(
			prospectId,
			current.draftSetDigest,
			userId,
			clientRequestId(),
		);
		expect(result.modelExecutionPaused).toBe(true);
		expect(result.providerExecutionDisabled).toBe(true);
		expect(result.state).toBe("WAITING_FOR_APPROVAL");

		const task = await db.agentTask.findUnique({
			where: { id: result.taskId as string },
			select: {
				kind: true,
				state: true,
				startedAt: true,
				operationKey: true,
				approvalRequestId: true,
				budgetUsd: true,
				costUsd: true,
				scopes: true,
			},
		});
		expect(task?.kind).toBe("outreach-compose");
		expect(task?.state).toBe("WAITING_FOR_APPROVAL");
		expect(task?.startedAt).toBeNull();
		expect(task?.operationKey).toBe("outreach.sequence.regenerate");
		expect(task?.approvalRequestId).toBe(result.approvalRequestId as string);
		expect(task?.budgetUsd?.toFixed(6)).toBe("0.000000");
		expect(task?.costUsd?.toFixed(6)).toBe("0.000000");

		const approval = await db.approvalRequest.findUnique({
			where: { id: result.approvalRequestId as string },
			select: { action: true, status: true, contentDigest: true },
		});
		expect(approval).toEqual({
			action: "outreach.sequence.regenerate.execute",
			status: "PENDING",
			contentDigest: result.approvalContentDigest as string,
		});

		const drafts = await db.emailDraft.findMany({
			where: { prospectId },
			orderBy: { subject: "asc" },
			select: {
				status: true,
				sequenceStep: true,
				experimentKey: true,
				approvalDigest: true,
				sendError: true,
			},
		});
		expect(drafts).toHaveLength(3);
		expect(drafts.every((draft) => draft.status === "REJECTED")).toBe(true);
		expect(drafts.every((draft) => draft.sequenceStep === null)).toBe(true);
		expect(
			drafts.every((draft) => draft.experimentKey?.startsWith("superseded:")),
		).toBe(true);
		expect(drafts.every((draft) => draft.approvalDigest === null)).toBe(true);
		expect(
			drafts.every((draft) => draft.sendError?.includes("Superseded")),
		).toBe(true);

		const after = await outreach.byProspect(prospectId);
		expect(after.queued).toBe(true);
		expect(after.draftSetDigest).not.toBe(current.draftSetDigest);
		expect(after.approvals[0]?.action).toBe(
			"outreach.sequence.regenerate.execute",
		);
		expect(after.work?.primaryAction).toBe(
			"Review regenerated A/B/C outreach sequence",
		);
	});
});
