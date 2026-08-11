import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { WORKSPACE_ID } from "@crm/auth";
import { db } from "@crm/db";
import { AgentTriggerService } from "../src/agent/agent-trigger.service";
import { InboundService } from "../src/inbound/inbound.service";

const suffix = crypto.randomUUID();
const ownerId = `agentmail-owner-${suffix}`;
const memberId = `agentmail-member-${suffix}`;
const inboxId = `agentmail-control-${suffix}`;
const draftId = `agentmail-draft-${suffix}`;
const agent = {
	syncInbound: async () => ({ configured: 0, queued: 0 }),
} as unknown as AgentTriggerService;
const inbound = new InboundService(db, agent);

beforeAll(async () => {
	await db.organization.upsert({
		where: { id: WORKSPACE_ID },
		create: {
			id: WORKSPACE_ID,
			name: "CRM",
			slug: "crm",
			createdAt: new Date(),
		},
		update: {},
	});
	await db.user.createMany({
		data: [
			{ id: ownerId, name: "Owner", email: `${ownerId}@example.test` },
			{ id: memberId, name: "Member", email: `${memberId}@example.test` },
		],
	});
	await db.member.createMany({
		data: [
			{
				id: crypto.randomUUID(),
				organizationId: WORKSPACE_ID,
				userId: ownerId,
				role: "owner",
				createdAt: new Date(),
			},
			{
				id: crypto.randomUUID(),
				organizationId: WORKSPACE_ID,
				userId: memberId,
				role: "member",
				createdAt: new Date(),
			},
		],
	});
	await db.emailInbox.create({
		data: {
			provider: "AGENTMAIL",
			externalInboxId: inboxId,
			email: `outreach-${suffix}@example.test`,
			isEnabled: true,
		},
	});
	await db.emailDraft.create({
		data: {
			id: draftId,
			provider: "AGENTMAIL",
			externalInboxId: inboxId,
			createdById: ownerId,
			fromEmail: `outreach-${suffix}@example.test`,
			recipients: [`person-${suffix}@example.test`],
			subject: "Approved message",
			plainTextBody: "Approved body",
			status: "APPROVED",
		},
	});
});

afterAll(async () => {
	await db.emailDraft.deleteMany({ where: { id: draftId } });
	await db.emailInbox.deleteMany({
		where: { provider: "AGENTMAIL", externalInboxId: inboxId },
	});
	await db.member.deleteMany({
		where: { userId: { in: [ownerId, memberId] } },
	});
	await db.user.deleteMany({ where: { id: { in: [ownerId, memberId] } } });
});

describe("AgentMail outbound control", () => {
	it("lets any operator pause and rejects queued sends", async () => {
		await inbound.setAgentMailEnabled(false, memberId);

		expect(
			await db.emailInbox.findUnique({
				where: {
					provider_externalInboxId: {
						provider: "AGENTMAIL",
						externalInboxId: inboxId,
					},
				},
				select: { isEnabled: true },
			}),
		).toEqual({ isEnabled: false });
		expect(
			await db.emailDraft.findUnique({
				where: { id: draftId },
				select: { status: true },
			}),
		).toEqual({ status: "REJECTED" });
	});

	it("requires an owner or admin to resume", async () => {
		await expect(inbound.setAgentMailEnabled(true, memberId)).rejects.toThrow(
			"Only the CRM owner",
		);
		await expect(inbound.setAgentMailEnabled(true, ownerId)).resolves.toEqual({
			enabled: true,
		});
	});
});
