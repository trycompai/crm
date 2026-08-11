import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { DEFAULT_WORKSPACE_NAME, WORKSPACE_ID } from "@crm/auth";
import { db } from "@crm/db";
import { workspaceSlug } from "@crm/db/workspace";
import { ConflictException } from "@nestjs/common";
import { ApprovalExecutionService } from "../src/operating-kernel/approval-execution.service";
import { KernelIdempotencyService } from "../src/operating-kernel/kernel-idempotency.service";
import {
	subjectTypeInput,
	subjectTypeValues,
} from "../src/operating-kernel/operating-kernel.contracts";
import { OperatingKernelAccessService } from "../src/operating-kernel/operating-kernel-access.service";
import { OperatingKernelCleanupService } from "../src/operating-kernel/operating-kernel-cleanup.service";
import { SubjectResolverService } from "../src/operating-kernel/subject-resolver.service";
import { OutreachService } from "../src/outreach/outreach.service";

const suffix = crypto.randomUUID();
const ownerId = `kernel-repair-owner-${suffix}`;
const outsiderId = `kernel-repair-outsider-${suffix}`;
const membershipId = `kernel-repair-membership-${suffix}`;
const companyId = `kernel-repair-company-${suffix}`;
const contactId = `kernel-repair-contact-${suffix}`;
const candidateId = `kernel-repair-candidate-${suffix}`;
const prospectId = `kernel-repair-prospect-${suffix}`;
const dealId = `kernel-repair-deal-${suffix}`;
const inboxId = `kernel-repair-inbox-${suffix}`;
const draftId = `kernel-repair-draft-${suffix}`;
const workId = `kernel-repair-work-${suffix}`;
const emailDraftWorkId = `kernel-repair-email-work-${suffix}`;
const emailDraftTaskId = `kernel-repair-email-task-${suffix}`;
const accountId = `kernel-repair-account-${suffix}`;
const instanceId = `kernel-repair-instance-${suffix}`;
const providerAccountId = `kernel-repair-provider-account-${suffix}`;
const providerResourceId = `kernel-repair-provider-resource-${suffix}`;
const observedStateId = `kernel-repair-observed-${suffix}`;
const planId = `kernel-repair-plan-${suffix}`;
const commandId = `kernel-repair-command-${suffix}`;
const operationId = `kernel-repair-operation-${suffix}`;
const campaignId = `kernel-repair-campaign-${suffix}`;
const contentItemId = `kernel-repair-content-${suffix}`;
const contentVariantId = `kernel-repair-variant-${suffix}`;
const experimentId = `kernel-repair-experiment-${suffix}`;
const mentionId = `kernel-repair-mention-${suffix}`;
const supportCaseId = `kernel-repair-support-${suffix}`;
const approvalId = `kernel-repair-approval-${suffix}`;
const expiredApprovalId = `kernel-repair-expired-${suffix}`;
const receiptId = `kernel-repair-receipt-${suffix}`;
const wrongReceiptId = `kernel-repair-wrong-receipt-${suffix}`;
const wrongApprovalId = `kernel-repair-wrong-approval-${suffix}`;
const digest = `kernel-repair-digest-${suffix}`;

const resolver = new SubjectResolverService(db);
const execution = new ApprovalExecutionService(db);
const outreach = new OutreachService(
	db,
	{} as never,
	new OperatingKernelCleanupService(),
	new OperatingKernelAccessService(db),
	new KernelIdempotencyService(),
);

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
			{ id: ownerId, name: "Repair Owner", email: `${ownerId}@example.test` },
			{
				id: outsiderId,
				name: "Repair Outsider",
				email: `${outsiderId}@example.test`,
			},
		],
	});
	await db.member.create({
		data: {
			id: membershipId,
			organizationId: WORKSPACE_ID,
			userId: ownerId,
			role: "owner",
			createdAt: new Date(),
		},
	});
	await db.company.create({
		data: { id: companyId, name: "Repair Company", domain: `${suffix}.test` },
	});
	await db.contact.create({
		data: {
			id: contactId,
			firstName: "Repair",
			lastName: "Contact",
			companyId,
		},
	});
	await db.contactCandidate.create({
		data: {
			id: candidateId,
			identityKey: "a".repeat(64),
			canonicalEmail: `candidate-${suffix}@example.test`,
			canonicalName: "Repair Candidate",
			canonicalDomain: "example.test",
		},
	});
	await db.prospect.create({
		data: {
			id: prospectId,
			dedupeKey: `repair-${suffix}`,
			region: "GB",
			country: "United Kingdom",
			countryCode: "GB",
			companyName: "Repair Prospect",
			sourceBatch: `repair-${suffix}`,
		},
	});
	await db.deal.create({
		data: { id: dealId, name: "Repair Deal", companyId, ownerId },
	});
	await db.emailInbox.create({
		data: {
			id: inboxId,
			provider: "AGENTMAIL",
			externalInboxId: `repair-${suffix}`,
			email: `inbox-${suffix}@example.test`,
		},
	});
	await db.emailDraft.create({
		data: {
			id: draftId,
			provider: "AGENTMAIL",
			externalInboxId: `repair-${suffix}`,
			createdById: ownerId,
			fromEmail: `inbox-${suffix}@example.test`,
			recipients: ["customer@example.test"],
			subject: "Repair Draft",
			plainTextBody: "Repair body",
		},
	});
	await db.workItem.create({
		data: {
			id: workId,
			subjectType: "COMPANY",
			subjectId: companyId,
			queue: "repair",
			reason: "Repair work",
			primaryAction: "Review repair",
		},
	});
	await db.agentTask.create({
		data: {
			id: emailDraftTaskId,
			emailDraftId: draftId,
			kind: "email-draft-send",
			reason: "Repair draft task",
			dueAt: new Date(),
		},
	});
	await db.workItem.create({
		data: {
			id: emailDraftWorkId,
			subjectType: "EMAIL_DRAFT",
			subjectId: draftId,
			queue: "repair",
			reason: "Repair draft work",
			primaryAction: "Review draft",
		},
	});
	await db.customerAccount.create({
		data: { id: accountId, name: "Repair Account" },
	});
	await db.customerInstance.create({
		data: {
			id: instanceId,
			accountId,
			key: `repair-${suffix}`,
			name: "Repair Instance",
			environment: "test",
			region: "test",
		},
	});
	await db.providerAccount.create({
		data: {
			id: providerAccountId,
			customerAccountId: accountId,
			provider: "repair",
			externalAccountId: `account-${suffix}`,
			displayName: "Repair Provider Account",
		},
	});
	await db.providerResource.create({
		data: {
			id: providerResourceId,
			customerAccountId: accountId,
			providerAccountId,
			provider: "repair",
			resourceType: "server",
			externalId: `resource-${suffix}`,
			name: "Repair Resource",
		},
	});
	await db.observedState.create({
		data: {
			id: observedStateId,
			instanceId,
			observed: { healthy: true },
			observedAt: new Date(),
		},
	});
	await db.plan.create({
		data: {
			id: planId,
			instanceId,
			observedStateId,
			preconditionDigest: "repair-precondition",
			contentDigest: "repair-plan-digest",
			idempotencyKey: `repair-plan-${suffix}`,
		},
	});
	await db.controlCommand.create({
		data: {
			id: commandId,
			instanceId,
			command: "repair.restart",
			contentDigest: "repair-command-digest",
			idempotencyKey: `repair-command-${suffix}`,
		},
	});
	await db.providerOperation.create({
		data: {
			id: operationId,
			customerAccountId: accountId,
			instanceId,
			providerAccountId,
			provider: "repair",
			operation: "repair.observe",
			idempotencyKey: `repair-operation-${suffix}`,
		},
	});
	await db.campaign.create({
		data: { id: campaignId, name: "Repair Campaign" },
	});
	await db.contentItem.create({
		data: { id: contentItemId, kind: "article", title: "Repair Content" },
	});
	await db.contentVariant.create({
		data: {
			id: contentVariantId,
			contentItemId,
			key: "control",
			channel: "email",
			content: "Repair variant",
		},
	});
	await db.experiment.create({
		data: {
			id: experimentId,
			key: `repair-${suffix}`,
			name: "Repair Experiment",
		},
	});
	await db.socialMention.create({
		data: {
			id: mentionId,
			source: "repair",
			externalId: suffix,
			platform: "test",
			body: "Repair mention",
		},
	});
	await db.supportCase.create({
		data: {
			id: supportCaseId,
			dedupeKey: `repair-${suffix}`,
			channel: "test",
			title: "Repair Support Case",
		},
	});
	await db.approvalRequest.createMany({
		data: [
			{
				id: approvalId,
				action: "outreach.send",
				contentDigest: digest,
				contentSnapshot: { message: "Repair" },
				targetType: "COMPANY",
				targetId: companyId,
				risk: "LOW",
				policyVersion: "repair-v1",
				expiresAt: new Date(Date.now() + 60_000),
				status: "APPROVED",
				approverId: ownerId,
				decidedAt: new Date(),
				idempotencyKey: `repair-approval-${suffix}`,
			},
			{
				id: expiredApprovalId,
				action: "outreach.send",
				contentDigest: `expired-${digest}`,
				contentSnapshot: { message: "Expired" },
				targetType: "COMPANY",
				targetId: companyId,
				risk: "LOW",
				policyVersion: "repair-v1",
				expiresAt: new Date(Date.now() - 60_000),
				status: "APPROVED",
				approverId: ownerId,
				decidedAt: new Date(),
				idempotencyKey: `repair-expired-approval-${suffix}`,
			},
			{
				id: wrongApprovalId,
				action: "outreach.send",
				contentDigest: `wrong-${digest}`,
				contentSnapshot: { message: "Wrong" },
				targetType: "COMPANY",
				targetId: companyId,
				risk: "LOW",
				policyVersion: "repair-v1",
				expiresAt: new Date(Date.now() + 60_000),
				status: "APPROVED",
				approverId: ownerId,
				decidedAt: new Date(),
				idempotencyKey: `repair-wrong-approval-${suffix}`,
			},
		],
	});
	await db.actionReceipt.createMany({
		data: [
			{
				id: receiptId,
				idempotencyKey: `repair-receipt-${suffix}`,
				requestHash: digest,
				provider: "repair",
				channel: "test",
				approvalRequestId: approvalId,
				status: "SUCCEEDED",
				completedAt: new Date(),
			},
			{
				id: wrongReceiptId,
				idempotencyKey: `repair-wrong-receipt-${suffix}`,
				requestHash: `wrong-${digest}`,
				provider: "repair",
				channel: "test",
				approvalRequestId: wrongApprovalId,
				status: "SUCCEEDED",
				completedAt: new Date(),
			},
		],
	});
});

afterAll(async () => {
	await db.actionReceipt.deleteMany({
		where: { id: { in: [receiptId, wrongReceiptId] } },
	});
	await db.approvalRequest.deleteMany({
		where: { id: { in: [approvalId, expiredApprovalId, wrongApprovalId] } },
	});
	await db.providerOperation.deleteMany({ where: { id: operationId } });
	await db.controlCommand.deleteMany({ where: { id: commandId } });
	await db.plan.deleteMany({ where: { id: planId } });
	await db.observedState.deleteMany({ where: { id: observedStateId } });
	await db.providerResource.deleteMany({ where: { id: providerResourceId } });
	await db.providerAccount.deleteMany({ where: { id: providerAccountId } });
	await db.customerInstance.deleteMany({ where: { id: instanceId } });
	await db.customerAccount.deleteMany({ where: { id: accountId } });
	await db.supportCase.deleteMany({ where: { id: supportCaseId } });
	await db.socialMention.deleteMany({ where: { id: mentionId } });
	await db.experiment.deleteMany({ where: { id: experimentId } });
	await db.contentVariant.deleteMany({ where: { id: contentVariantId } });
	await db.contentItem.deleteMany({ where: { id: contentItemId } });
	await db.campaign.deleteMany({ where: { id: campaignId } });
	await db.emailDraft.deleteMany({ where: { id: draftId } });
	await db.emailInbox.deleteMany({ where: { id: inboxId } });
	await db.workItem.deleteMany({ where: { id: workId } });
	await db.workItem.deleteMany({ where: { id: emailDraftWorkId } });
	await db.agentTask.deleteMany({ where: { id: emailDraftTaskId } });
	await db.deal.deleteMany({ where: { id: dealId } });
	await db.prospect.deleteMany({ where: { id: prospectId } });
	await db.contactCandidate.deleteMany({ where: { id: candidateId } });
	await db.contact.deleteMany({ where: { id: contactId } });
	await db.company.deleteMany({ where: { id: companyId } });
	await db.member.deleteMany({ where: { id: membershipId } });
	await db.user.deleteMany({ where: { id: { in: [ownerId, outsiderId] } } });
});

describe("operating kernel repair", () => {
	it("resolves every persisted subject type and hides nonmember users", async () => {
		const refs = [
			{ type: "WORKSPACE", id: WORKSPACE_ID },
			{ type: "USER", id: ownerId },
			{ type: "COMPANY", id: companyId },
			{ type: "CONTACT", id: contactId },
			{ type: "PROSPECT", id: prospectId },
			{ type: "DEAL", id: dealId },
			{ type: "EMAIL_DRAFT", id: draftId },
			{ type: "WORK_ITEM", id: workId },
			{ type: "CAMPAIGN", id: campaignId },
			{ type: "CONTENT_ITEM", id: contentItemId },
			{ type: "CONTENT_VARIANT", id: contentVariantId },
			{ type: "EXPERIMENT", id: experimentId },
			{ type: "SOCIAL_MENTION", id: mentionId },
			{ type: "SUPPORT_CASE", id: supportCaseId },
			{ type: "CUSTOMER_ACCOUNT", id: accountId },
			{ type: "CUSTOMER_INSTANCE", id: instanceId },
			{ type: "PROVIDER_ACCOUNT", id: providerAccountId },
			{ type: "PROVIDER_RESOURCE", id: providerResourceId },
			{ type: "PLAN", id: planId },
			{ type: "CONTROL_COMMAND", id: commandId },
			{ type: "PROVIDER_OPERATION", id: operationId },
			{ type: "CONTACT_CANDIDATE", id: candidateId },
		] as const;
		const resolved = await resolver.resolveMany(refs);
		expect(resolved).toHaveLength(subjectTypeValues.length);
		expect(resolved.every((subject) => !subject.missing && subject.label)).toBe(
			true,
		);
		expect(subjectTypeInput.options).toEqual([...subjectTypeValues]);
		expect(
			await resolver.resolveOne({ type: "USER", id: outsiderId }),
		).toMatchObject({
			type: "USER",
			id: outsiderId,
			label: null,
			missing: true,
		});
	});

	it("consumes an approval and validates exact replay inputs and receipts", async () => {
		const input = {
			approvalRequestId: approvalId,
			contentDigest: digest,
			expectedVersion: 0,
			invalidationVersion: 0,
			actionReceiptId: receiptId,
		};
		await expect(execution.consumeApproved(input)).resolves.toMatchObject({
			id: approvalId,
			status: "EXECUTED",
			version: 1,
		});
		await expect(execution.consumeApproved(input)).resolves.toMatchObject({
			id: approvalId,
			status: "EXECUTED",
			version: 1,
		});
		await expect(
			execution.consumeApproved({ ...input, actionReceiptId: wrongReceiptId }),
		).rejects.toBeInstanceOf(ConflictException);
		await expect(
			execution.consumeApproved({ ...input, contentDigest: `bad-${digest}` }),
		).rejects.toBeInstanceOf(ConflictException);
		await expect(
			execution.consumeApproved({ ...input, expectedVersion: 1 }),
		).rejects.toBeInstanceOf(ConflictException);
		await expect(
			execution.consumeApproved({ ...input, invalidationVersion: 1 }),
		).rejects.toBeInstanceOf(ConflictException);
	});

	it("expires an approved request before receipt consumption", async () => {
		await expect(
			execution.consumeApproved({
				approvalRequestId: expiredApprovalId,
				contentDigest: `expired-${digest}`,
				expectedVersion: 0,
				invalidationVersion: 0,
				actionReceiptId: receiptId,
			}),
		).rejects.toBeInstanceOf(ConflictException);
		expect(
			await db.approvalRequest.findUnique({
				where: { id: expiredApprovalId },
				select: { status: true },
			}),
		).toEqual({ status: "EXPIRED" });
	});

	it("cleans email-draft tasks and work before deleting an unsent draft", async () => {
		await outreach.deleteDraft(draftId, ownerId, crypto.randomUUID());
		expect(
			await db.agentTask.findUnique({
				where: { id: emailDraftTaskId },
				select: { state: true, outcome: true },
			}),
		).toEqual({ state: "CANCELLED", outcome: "SUBJECT_DELETED" });
		expect(
			await db.workItem.findUnique({
				where: { id: emailDraftWorkId },
				select: { state: true },
			}),
		).toEqual({ state: "DISMISSED" });
	});
});
