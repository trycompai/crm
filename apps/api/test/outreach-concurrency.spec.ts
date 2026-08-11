import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { db } from "@crm/db";
import { AgentTriggerService } from "../src/agent/agent-trigger.service";
import { OutreachService } from "../src/outreach/outreach.service";

const suffix = crypto.randomUUID();
const userId = `outreach-approval-${suffix}`;
const inboxId = `outreach-approval-inbox-${suffix}`;
const sequenceId = `outreach-approval-sequence-${suffix}`;
const pauseSequenceId = `outreach-pause-sequence-${suffix}`;
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
const pauseDraftIds: string[] = [];

async function waitForBlockedApproval(): Promise<void> {
	for (let attempt = 0; attempt < 100; attempt++) {
		const [row] = await db.$queryRaw<Array<{ waiting: boolean }>>`
			SELECT EXISTS (
				SELECT 1
				FROM pg_stat_activity
				WHERE datname = current_database()
					AND wait_event_type = 'Lock'
					AND query LIKE '%FROM "emailInbox"%FOR UPDATE%'
			) AS waiting
		`;
		if (row?.waiting) return;
		await Bun.sleep(10);
	}

	throw new Error("Approval did not reach the inbox lock.");
}

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
				subject: `Pause step ${step}`,
				plainTextBody: `Pause body ${step}`,
				status: "PENDING_APPROVAL",
				experimentKey: `approval-pause-${suffix}`,
				variant: "B",
				sequenceId: pauseSequenceId,
				sequenceStep: step,
				scheduledFor: new Date(),
			},
		});
		pauseDraftIds.push(draft.id);
	}
});

afterAll(async () => {
	const allDraftIds = [...draftIds, ...pauseDraftIds];
	await db.agentTask.deleteMany({
		where: { emailDraftId: { in: allDraftIds } },
	});
	await db.emailDraft.deleteMany({
		where: { sequenceId: { in: [sequenceId, pauseSequenceId] } },
	});
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

	it("cannot approve a sequence after a concurrent pause has locked the inbox", async () => {
		let markLocked: () => void = () => {};
		let releasePause: () => void = () => {};
		const locked = new Promise<void>((resolve) => {
			markLocked = resolve;
		});
		const released = new Promise<void>((resolve) => {
			releasePause = resolve;
		});
		const pause = db.$transaction(async (tx) => {
			await tx.emailInbox.update({
				where: {
					provider_externalInboxId: {
						provider: "AGENTMAIL",
						externalInboxId: inboxId,
					},
				},
				data: { isEnabled: false },
			});
			markLocked();
			await released;
		});

		await locked;
		const approval = outreach.approveSequence(pauseSequenceId, userId);
		try {
			await waitForBlockedApproval();
		} finally {
			releasePause();
			await pause;
		}

		await expect(approval).rejects.toThrow("AgentMail was paused");
		expect(
			await db.agentTask.count({
				where: { emailDraftId: { in: pauseDraftIds } },
			}),
		).toBe(0);
		expect(
			await db.emailDraft.count({
				where: {
					id: { in: pauseDraftIds },
					status: "PENDING_APPROVAL",
				},
			}),
		).toBe(3);

		await db.emailInbox.update({
			where: {
				provider_externalInboxId: {
					provider: "AGENTMAIL",
					externalInboxId: inboxId,
				},
			},
			data: { isEnabled: true },
		});
	});
});
