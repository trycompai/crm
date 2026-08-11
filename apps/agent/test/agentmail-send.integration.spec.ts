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
let raceDraftId = "";
let previousApiKey: string | undefined;
let previousProviderPause: string | undefined;
let previousOutreachPause: string | undefined;

function restoreEnv(key: string, value: string | undefined): void {
	if (value === undefined) {
		delete process.env[key];
		return;
	}
	process.env[key] = value;
}

beforeAll(async () => {
	previousApiKey = process.env.AGENTMAIL_API_KEY;
	previousProviderPause = process.env.PROVIDER_MUTATIONS_PAUSED;
	previousOutreachPause = process.env.OUTREACH_SENDS_PAUSED;
	process.env.AGENTMAIL_API_KEY = "agentmail-test-key";
	process.env.PROVIDER_MUTATIONS_PAUSED = "false";
	process.env.OUTREACH_SENDS_PAUSED = "false";
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
	const draftIds = [draftId, raceDraftId].filter(Boolean);
	const drafts = await db.emailDraft.findMany({
		where: { id: { in: draftIds } },
		select: { threadId: true },
	});
	await db.emailMessage.deleteMany({ where: { draftId: { in: draftIds } } });
	await db.emailDraft.deleteMany({ where: { id: { in: draftIds } } });
	await db.emailThread.deleteMany({
		where: {
			id: {
				in: drafts.flatMap((draft) => (draft.threadId ? [draft.threadId] : [])),
			},
		},
	});
	await db.emailInbox.deleteMany({
		where: { provider: "AGENTMAIL", externalInboxId: inboxId },
	});
	await db.prospect.deleteMany({ where: { id: prospectId } });
	await db.contact.deleteMany({ where: { id: contactId } });
	await db.company.deleteMany({ where: { id: companyId } });
	await db.user.deleteMany({ where: { id: userId } });
	restoreEnv("AGENTMAIL_API_KEY", previousApiKey);
	restoreEnv("PROVIDER_MUTATIONS_PAUSED", previousProviderPause);
	restoreEnv("OUTREACH_SENDS_PAUSED", previousOutreachPause);
});

describe("approved AgentMail outreach", () => {
	it("refuses to send while the inbox is paused", async () => {
		await db.emailInbox.update({
			where: {
				provider_externalInboxId: {
					provider: "AGENTMAIL",
					externalInboxId: inboxId,
				},
			},
			data: { isEnabled: false },
		});
		let calls = 0;
		const result = await sendApprovedAgentMailDraft(draftId, async () => {
			calls += 1;
			return Response.json({});
		});

		expect(result.sent).toBe(false);
		expect(calls).toBe(0);
		expect(
			await db.emailDraft.findUnique({
				where: { id: draftId },
				select: { status: true },
			}),
		).toEqual({ status: "REJECTED" });

		await db.emailInbox.update({
			where: {
				provider_externalInboxId: {
					provider: "AGENTMAIL",
					externalInboxId: inboxId,
				},
			},
			data: { isEnabled: true },
		});
		await db.emailDraft.update({
			where: { id: draftId },
			data: { status: "APPROVED", sendError: null },
		});
	});

	it("does not overwrite a revocation that lands during the provider call", async () => {
		const scheduledFor = new Date();
		const raceDraft = await db.emailDraft.create({
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
				subject: "A revocation race",
				plainTextBody: "The provider call is already in flight.",
				status: "APPROVED",
				experimentKey: `outreach-race-${suffix}`,
				variant: "B",
				sequenceId: `sequence-race-${suffix}`,
				sequenceStep: 1,
				scheduledFor,
				approvedAt: new Date(),
				approvalDigest: outreachApprovalDigest({
					externalInboxId: inboxId,
					fromEmail: "outreach@trylodeagent.io",
					recipients: [recipient],
					subject: "A revocation race",
					plainTextBody: "The provider call is already in flight.",
					experimentKey: `outreach-race-${suffix}`,
					variant: "B",
					sequenceStep: 1,
					scheduledFor,
				}),
			},
		});
		raceDraftId = raceDraft.id;
		let calls = 0;
		const result = await sendApprovedAgentMailDraft(raceDraft.id, async () => {
			calls += 1;
			if (calls === 1) {
				return Response.json({ draft_id: `race-draft-${suffix}` });
			}
			await db.$transaction([
				db.prospect.update({
					where: { id: prospectId },
					data: {
						emailAllowed: false,
						routeStatus: "DIRECT_ROUTE_REVIEW",
					},
				}),
				db.emailDraft.update({
					where: { id: raceDraft.id },
					data: {
						status: "REJECTED",
						sendError: "Permission revoked during send.",
					},
				}),
			]);
			return Response.json({
				message_id: `race-message-${suffix}`,
				thread_id: `race-thread-${suffix}`,
			});
		});

		expect(result.sent).toBe(true);
		expect(calls).toBe(2);
		expect(
			await db.emailDraft.findUnique({
				where: { id: raceDraft.id },
				select: { status: true, sentAt: true, sendError: true },
			}),
		).toEqual({
			status: "REJECTED",
			sentAt: expect.any(Date),
			sendError:
				"Provider confirmed delivery after the local send authority was revoked.",
		});
		expect(
			await db.emailMessage.count({
				where: { draftId: raceDraft.id, direction: "OUTBOUND" },
			}),
		).toBe(1);

		await db.prospect.update({
			where: { id: prospectId },
			data: { emailAllowed: true, routeStatus: "SEND_READY_REVIEW" },
		});
	});

	it("sends the approved copy once and records the provider result", async () => {
		const calls: Array<{ url: string; options: RequestInit }> = [];
		const request = async (
			input: string | URL | Request,
			options?: RequestInit,
		) => {
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
