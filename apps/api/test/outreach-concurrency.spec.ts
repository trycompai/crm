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
const userId = `outreach-approval-${suffix}`;
const membershipId = `outreach-approval-member-${suffix}`;
const inboxId = `outreach-approval-inbox-${suffix}`;
const sequenceId = `outreach-approval-sequence-${suffix}`;
const pauseSequenceId = `outreach-pause-sequence-${suffix}`;
const domain = `outreach-approval-${suffix}.example.test`;
const recipient = `person@${domain}`;
const originalProviderPaused = process.env.PROVIDER_MUTATIONS_PAUSED;
const originalOutreachPaused = process.env.OUTREACH_SENDS_PAUSED;
const agent = {
	workQueued: () => {},
} as unknown as AgentTriggerService;
const outreach = new OutreachService(
	db,
	agent,
	new OperatingKernelCleanupService(),
	new OperatingKernelAccessService(db),
	new KernelIdempotencyService(),
);
let companyId = "";
let contactId = "";
let prospectId = "";
const draftIds: string[] = [];
const pauseDraftIds: string[] = [];
const receiptIds: string[] = [];
const requestIds: string[] = [];

function restoreEnv(key: string, value: string | undefined) {
	if (value === undefined) {
		delete process.env[key];
		return;
	}
	process.env[key] = value;
}

function clientRequestId() {
	const id = crypto.randomUUID();
	requestIds.push(id);
	return id;
}

function proposedSendTime(step: number) {
	return new Date(Date.now() + step * 24 * 60 * 60 * 1_000);
}

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
	process.env.PROVIDER_MUTATIONS_PAUSED = "false";
	process.env.OUTREACH_SENDS_PAUSED = "false";
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
		data: { id: userId, name: "Approver", email: `${userId}@example.test` },
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
				website: `https://${domain}`,
				status: "PROMOTED",
				routeStatus: "SEND_READY_REVIEW",
				routeEmail: recipient,
				namedPerson: "Person Operator",
				role: "Operations Director",
				personSourceUrl: `https://${domain}/team/person-operator`,
				enrichmentStatus: "COMPLETE",
				lastResearchedAt: new Date(),
				nextResearchAt: new Date(Date.now() + 24 * 60 * 60 * 1_000),
				emailAllowed: true,
				emailAllowedAt: new Date(),
				emailAllowedById: userId,
				companyId,
				contactId,
				sourceBatch: `approval:${suffix}`,
			},
		})
	).id;
	for (const source of [
		{
			url: `https://${domain}/jobs/operations-director`,
			sourceType: "OFFICIAL_JOB_POSTING",
			observed:
				"Operations Director role coordinates crews, schedules and client updates.",
			signalDate: new Date(),
		},
		{
			url: `https://${domain}/team/person-operator`,
			sourceType: "OFFICIAL_TEAM",
			observed: `Person Operator is Operations Director. Public work email ${recipient}.`,
			signalDate: null,
		},
	]) {
		const receipt = await db.prospectSourceReceipt.create({
			data: {
				prospectId,
				requestedUrl: source.url,
				finalUrl: source.url,
				statusCode: 200,
				contentHash: crypto.randomUUID().replaceAll("-", "").padEnd(64, "0"),
				contentText: source.observed,
			},
		});
		receiptIds.push(receipt.id);
		await db.prospectEvidence.create({
			data: {
				prospectId,
				receiptId: receipt.id,
				sourceType: source.sourceType,
				title: source.sourceType,
				url: source.url,
				signalDate: source.signalDate,
				summary: source.observed,
				observed: source.observed,
			},
		});
	}
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
				scheduledFor: proposedSendTime(step),
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
				scheduledFor: proposedSendTime(step),
			},
		});
		pauseDraftIds.push(draft.id);
	}
});

afterAll(async () => {
	restoreEnv("PROVIDER_MUTATIONS_PAUSED", originalProviderPaused);
	restoreEnv("OUTREACH_SENDS_PAUSED", originalOutreachPaused);
	const allDraftIds = [...draftIds, ...pauseDraftIds];
	await db.agentTask.deleteMany({
		where: { emailDraftId: { in: allDraftIds } },
	});
	await db.actionReceipt.deleteMany({
		where: {
			idempotencyKey: {
				in: [
					...requestIds,
					...requestIds.map((id) => `outreach-approval-receipt:${id}`),
				],
			},
		},
	});
	await db.approvalRequest.deleteMany({
		where: {
			targetType: "PROSPECT",
			targetId: prospectId,
			action: { startsWith: "outreach." },
		},
	});
	await db.workItem.deleteMany({
		where: { subjectType: "PROSPECT", subjectId: prospectId },
	});
	await db.emailDraft.deleteMany({
		where: { sequenceId: { in: [sequenceId, pauseSequenceId] } },
	});
	await db.prospectEvidence.deleteMany({ where: { prospectId } });
	await db.prospectSourceReceipt.deleteMany({
		where: { id: { in: receiptIds } },
	});
	await db.emailInbox.deleteMany({
		where: { provider: "AGENTMAIL", externalInboxId: inboxId },
	});
	await db.prospect.deleteMany({ where: { id: prospectId } });
	await db.contact.deleteMany({ where: { id: contactId } });
	await db.company.deleteMany({ where: { id: companyId } });
	await db.member.deleteMany({ where: { id: membershipId } });
	await db.user.deleteMany({ where: { id: userId } });
});

describe("sequence approval concurrency", () => {
	it("records one approved proposal and no send tasks when two approvals race", async () => {
		const results = await Promise.allSettled([
			outreach.approveSequence(sequenceId, userId, clientRequestId()),
			outreach.approveSequence(sequenceId, userId, clientRequestId()),
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
		).toBe(0);
		expect(
			await db.emailDraft.count({
				where: { id: { in: draftIds }, status: "APPROVED" },
			}),
		).toBe(3);
		expect(
			await db.approvalRequest.count({
				where: {
					targetType: "PROSPECT",
					targetId: prospectId,
					action: "outreach.sequence.approve",
					status: "APPROVED",
				},
			}),
		).toBe(1);
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
		const approval = outreach.approveSequence(
			pauseSequenceId,
			userId,
			clientRequestId(),
		);
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
