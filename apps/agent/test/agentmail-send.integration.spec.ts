import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { db } from "@crm/db";
import { outreachApprovalDigest } from "@crm/db/outreach";
import { sendApprovedAgentMailDraft } from "../agent/lib/agentmail-send";

const suffix = crypto.randomUUID();
const userId = `outreach-user-${suffix}`;
const domain = `outreach-${suffix}.example.test`;
const recipient = `jane@${domain}`;
const inboxId = `outreach-inbox-${suffix}`;
let companyId = "";
let contactId = "";
let prospectId = "";
let draftId = "";

beforeAll(async () => {
	await db.user.create({
		data: {
			id: userId,
			name: "Outreach Test",
			email: `${userId}@example.test`,
		},
	});
	const company = await db.company.create({
		data: { name: "Outreach Test Company", domain },
	});
	companyId = company.id;
	const contact = await db.contact.create({
		data: {
			firstName: "Jane",
			lastName: "Operator",
			email: recipient,
			companyId,
		},
	});
	contactId = contact.id;
	const prospect = await db.prospect.create({
		data: {
			dedupeKey: `outreach:${suffix}`,
			region: "Test",
			country: "Test",
			countryCode: "GB",
			companyName: "Outreach Test Company",
			website: `https://${domain}`,
			status: "PROMOTED",
			routeStatus: "SEND_READY_REVIEW",
			routeEmail: recipient,
			emailAllowed: true,
			emailAllowedAt: new Date(),
			emailAllowedById: userId,
			companyId,
			contactId,
			sourceBatch: `test:${suffix}`,
		},
	});
	prospectId = prospect.id;
	await db.emailInbox.create({
		data: {
			provider: "AGENTMAIL",
			externalInboxId: inboxId,
			email: "outreach@trylodeagent.io",
			isEnabled: true,
		},
	});
	const scheduledFor = new Date();
	const draft = await db.emailDraft.create({
		data: {
			provider: "AGENTMAIL",
			externalInboxId: inboxId,
			companyId,
			contactId,
			prospectId,
			createdById: userId,
			approvedById: userId,
			fromEmail: "outreach@trylodeagent.io",
			recipients: [recipient],
			subject: "A safe test",
			plainTextBody: "A human approved this exact message.",
			status: "APPROVED",
			experimentKey: `outreach-${suffix}`,
			variant: "A",
			sequenceId: `sequence-${suffix}`,
			sequenceStep: 1,
			scheduledFor,
			approvedAt: new Date(),
			approvalDigest: outreachApprovalDigest({
				externalInboxId: inboxId,
				fromEmail: "outreach@trylodeagent.io",
				recipients: [recipient],
				subject: "A safe test",
				plainTextBody: "A human approved this exact message.",
				experimentKey: `outreach-${suffix}`,
				variant: "A",
				sequenceStep: 1,
				scheduledFor,
			}),
		},
	});
	draftId = draft.id;
});

afterAll(async () => {
	const draft = draftId
		? await db.emailDraft.findUnique({
				where: { id: draftId },
				select: { threadId: true },
			})
		: null;
	await db.emailMessage.deleteMany({ where: { draftId } });
	await db.emailDraft.deleteMany({ where: { id: draftId } });
	if (draft?.threadId) {
		await db.emailThread.deleteMany({ where: { id: draft.threadId } });
	}
	await db.emailInbox.deleteMany({
		where: { provider: "AGENTMAIL", externalInboxId: inboxId },
	});
	await db.prospect.deleteMany({ where: { id: prospectId } });
	await db.contact.deleteMany({ where: { id: contactId } });
	await db.company.deleteMany({ where: { id: companyId } });
	await db.user.deleteMany({ where: { id: userId } });
});

describe("approved AgentMail outreach", () => {
	it("sends the approved copy once and records the provider result", async () => {
		const calls: Array<{ url: string; options: RequestInit }> = [];
		const request = async (input: string | URL | Request, options?: RequestInit) => {
			calls.push({ url: String(input), options: options ?? {} });
			if (calls.length === 1) {
				return Response.json({ draft_id: `external-draft-${suffix}` });
			}
			return Response.json({
				message_id: `external-message-${suffix}`,
				thread_id: `external-thread-${suffix}`,
			});
		};

		const first = await sendApprovedAgentMailDraft(draftId, request);
		expect(first.sent).toBe(true);
		expect(calls).toHaveLength(2);
		expect(new Headers(calls[1]?.options.headers).get("idempotency-key")).toBe(
			`lode-${draftId}`,
		);

		const stored = await db.emailDraft.findUnique({
			where: { id: draftId },
			select: {
				status: true,
				externalMessageId: true,
				sentAt: true,
				messages: { select: { direction: true } },
			},
		});
		expect(stored?.status).toBe("SENT");
		expect(stored?.externalMessageId).toBe(`external-message-${suffix}`);
		expect(stored?.sentAt).not.toBeNull();
		expect(stored?.messages).toEqual([{ direction: "OUTBOUND" }]);

		const second = await sendApprovedAgentMailDraft(draftId, request);
		expect(second.sent).toBe(true);
		expect(calls).toHaveLength(2);
	});
});
