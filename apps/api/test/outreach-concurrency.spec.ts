import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { db } from "@crm/db";
import { AgentTriggerService } from "../src/agent/agent-trigger.service";
import { OutreachService } from "../src/outreach/outreach.service";

const suffix = crypto.randomUUID();
const userId = `outreach-approval-${suffix}`;
const inboxId = `outreach-approval-inbox-${suffix}`;
const sequenceId = `outreach-approval-sequence-${suffix}`;
const domain = `outreach-approval-${suffix}.example.test`;
const recipient = `person@${domain}`;
const agent = {
	workQueued: () => {},
} as unknown as AgentTriggerService;
const outreach = new OutreachService(db, agent);
let companyId = "";
let contactId = "";
let prospectId = "";
const draftIds: string[] = [];

beforeAll(async () => {
	await db.user.create({
		data: { id: userId, name: "Approver", email: `${userId}@example.test` },
	});
	companyId = (
		await db.company.create({ data: { name: "Approval Company", domain } })
	).id;
	contactId = (
		await db.contact.create({
			data: { firstName: "Person", email: recipient, companyId },
		})
	).id;
	prospectId = (
		await db.prospect.create({
			data: {
				dedupeKey: `approval:${suffix}`,
				region: "Test",
				country: "Test",
				countryCode: "GB",
				companyName: "Approval Company",
				status: "PROMOTED",
				routeStatus: "SEND_READY_REVIEW",
				routeEmail: recipient,
				emailAllowed: true,
				emailAllowedAt: new Date(),
				emailAllowedById: userId,
				companyId,
				contactId,
				sourceBatch: `approval:${suffix}`,
			},
		})
	).id;
	await db.emailInbox.create({
		data: {
			provider: "AGENTMAIL",
			externalInboxId: inboxId,
			email: `outreach@${domain}`,
			isEnabled: true,
		},
	});
	for (const step of [1, 2, 3]) {
		const draft = await db.emailDraft.create({
			data: {
				provider: "AGENTMAIL",
				externalInboxId: inboxId,
				companyId,
				contactId,
				prospectId,
				createdById: userId,
				fromEmail: `outreach@${domain}`,
				recipients: [recipient],
				subject: `Step ${step}`,
				plainTextBody: `Body ${step}`,
				status: "PENDING_APPROVAL",
				experimentKey: `approval-${suffix}`,
				variant: "A",
				sequenceId,
				sequenceStep: step,
				scheduledFor: new Date(),
			},
		});
		draftIds.push(draft.id);
	}
});

afterAll(async () => {
	await db.agentTask.deleteMany({ where: { emailDraftId: { in: draftIds } } });
	await db.emailDraft.deleteMany({ where: { sequenceId } });
	await db.emailInbox.deleteMany({
		where: { provider: "AGENTMAIL", externalInboxId: inboxId },
	});
	await db.prospect.deleteMany({ where: { id: prospectId } });
	await db.contact.deleteMany({ where: { id: contactId } });
	await db.company.deleteMany({ where: { id: companyId } });
	await db.user.deleteMany({ where: { id: userId } });
});

describe("sequence approval concurrency", () => {
	it("creates one task per step when two approvals race", async () => {
		const results = await Promise.allSettled([
			outreach.approveSequence(sequenceId, userId),
			outreach.approveSequence(sequenceId, userId),
		]);

		expect(
			results.filter((result) => result.status === "fulfilled"),
		).toHaveLength(1);
		expect(
			results.filter((result) => result.status === "rejected"),
		).toHaveLength(1);
		expect(
			await db.agentTask.count({
				where: {
					kind: "email-draft-send",
					emailDraftId: { in: draftIds },
				},
			}),
		).toBe(3);
	});
});
