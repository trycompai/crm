import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import {
	ContactCandidatePermissionState,
	ContactCandidateStatus,
	db,
	EmailDirection,
	EmailProvider,
} from "@crm/db";
import { retainedContactCandidateHash } from "@crm/db/inbound/provenance";
import { WORKSPACE_ID } from "@crm/db/workspace";
import {
	canonicalInboundJson,
	emailSourceDigest,
	inboundReplayOutcomeText,
	inboundReplayPageWindow,
	runInboundCandidateReplay,
	websiteSourceDigest,
} from "../agent/lib/inbound-replay";
import { ensureInboundSyncTasks } from "../agent/lib/inbound-sync";
import { scheduleTask } from "../agent/lib/tasks";

const suffix = `${process.env.TEST_RUN_ID ?? "replay"}-${crypto.randomUUID()}`;
const websiteExternalId = `000000-replay-website-${suffix}`;
const internalWebsiteExternalIds = [
	`000000-replay-website-internal-member-${suffix}`,
	`000000-replay-website-internal-richard-${suffix}`,
	`000000-replay-website-internal-admin-${suffix}`,
] as const;
const emailMessageId = `000000-replay-message-${suffix}`;
const emailThreadId = `000000-replay-thread-${suffix}`;
const externalEmail = `replay-${suffix}@external.example.test`;
const exactEmail = `exact-${suffix}@external.example.test`;
const terminalEmail = `terminal-${suffix}@external.example.test`;
const terminalExternalId = `000000-replay-terminal-${suffix}`;
const suppressedDomain = `suppressed-${suffix}.example.test`;
const suppressedEmail = `blocked@${suppressedDomain}`;
const workspaceUserId = `replay-workspace-user-${suffix}`;
const workspaceMemberEmail = `member-${suffix}@trylodeagent.io`;
const removedMemberEmail = `removed-${suffix}@removed.example.test`;
const removedMemberUserId = `replay-removed-user-${suffix}`;
const memberId = `replay-member-${suffix}`;
const taskKey = `inbound-candidate-replay:test:${suffix}`;
const previousAllowedSignIn = {
	present: Object.hasOwn(process.env, "ALLOWED_SIGN_IN"),
	value: process.env.ALLOWED_SIGN_IN,
};
const previousSignInEmailAliases = {
	present: Object.hasOwn(process.env, "SIGN_IN_EMAIL_ALIASES"),
	value: process.env.SIGN_IN_EMAIL_ALIASES,
};
let createdOrganization = false;

beforeAll(async () => {
	process.env.ALLOWED_SIGN_IN = "trylodeagent.io";
	process.env.SIGN_IN_EMAIL_ALIASES =
		"richard@trylodeagent.io=admin@trylodeagent.io";
	const organization = await db.organization.findUnique({
		where: { id: WORKSPACE_ID },
		select: { id: true },
	});
	if (!organization) {
		await db.organization.create({
			data: {
				id: WORKSPACE_ID,
				name: "Replay Test Workspace",
				slug: `replay-${suffix}`,
				createdAt: new Date(),
			},
		});
		createdOrganization = true;
	}
	await db.user.create({
		data: {
			id: workspaceUserId,
			name: "Workspace Replay User",
			email: workspaceMemberEmail,
		},
	});
	await db.user.create({
		data: {
			id: removedMemberUserId,
			name: "Removed Workspace User",
			email: removedMemberEmail,
		},
	});
	await db.member.create({
		data: {
			id: memberId,
			organizationId: WORKSPACE_ID,
			userId: workspaceUserId,
			createdAt: new Date(),
		},
	});
	await db.suppressedDomain.create({ data: { domain: suppressedDomain } });
	await db.websiteEnquiry.create({
		data: {
			externalId: websiteExternalId,
			createdAtSource: new Date("2026-08-01T12:00:00.000Z"),
			name: null,
			email: externalEmail,
			company: "Replay Landscapes",
			source: "request_access",
			sourcePath: "/request-access",
			utm: { campaign: "ignored" },
			test: false,
		},
	});
	for (const [index, externalId] of internalWebsiteExternalIds.entries()) {
		await db.websiteEnquiry.create({
			data: {
				externalId,
				createdAtSource: new Date(`2026-08-01T12:0${index + 1}:00.000Z`),
				name: "Internal Website Sender",
				email: [
					workspaceMemberEmail,
					"richard@trylodeagent.io",
					"admin@trylodeagent.io",
				][index],
				company: "Internal Sender Company",
				source: "request_access",
				sourcePath: "/request-access",
				utm: { campaign: "internal" },
				test: false,
			},
		});
	}
	await db.emailThread.create({
		data: {
			id: emailThreadId,
			rootMessageId: `root-${emailMessageId}`,
			provider: EmailProvider.GMAIL,
			externalThreadId: `external-thread-${suffix}`,
			firstMessageAt: new Date("2026-08-02T12:00:00.000Z"),
			lastMessageAt: new Date("2026-08-02T12:00:00.000Z"),
			messageCount: 1,
		},
	});
	await db.emailMessage.create({
		data: {
			id: emailMessageId,
			threadId: emailThreadId,
			rfcMessageId: `<${emailMessageId}@example.test>`,
			provider: EmailProvider.GMAIL,
			externalInboxId: `replay-inbox-${suffix}`,
			externalThreadId: `external-thread-${suffix}`,
			externalMessageId: emailMessageId,
			direction: EmailDirection.INBOUND,
			fromEmail: "richard@trylodeagent.io",
			fromName: null,
			recipients: [
				{ email: "admin@trylodeagent.io", name: "Admin Alias" },
				{ email: externalEmail, name: null },
				{ email: removedMemberEmail, name: null },
				{ email: suppressedEmail, name: "Suppressed Person" },
			],
			subject: `secret-subject-${suffix}`,
			body: `secret-body-${suffix}`,
			sentAt: new Date("2026-08-02T12:00:00.000Z"),
		},
	});
});

afterAll(async () => {
	const receipts = await db.inboundSourceReceipt.findMany({
		where: {
			OR: [
				{ sourceObjectId: websiteExternalId },
				{ sourceObjectId: { in: [...internalWebsiteExternalIds] } },
				{ sourceObjectId: emailMessageId },
			],
		},
		select: { id: true },
	});
	const receiptIds = receipts.map((receipt) => receipt.id);
	await db.websiteEnquiry.deleteMany({
		where: {
			externalId: {
				in: [websiteExternalId, ...internalWebsiteExternalIds],
			},
		},
	});
	await db.contactCandidateObservation.deleteMany({
		where: { receiptId: { in: receiptIds } },
	});
	await db.contactCandidate.deleteMany({
		where: {
			canonicalEmail: { in: [externalEmail, suppressedEmail, exactEmail] },
		},
	});
	await db.agentTask.deleteMany({
		where: { idempotencyKey: { in: [taskKey, `${taskKey}:later`] } },
	});
	await db.emailMessage.deleteMany({ where: { id: emailMessageId } });
	await db.emailThread.deleteMany({ where: { id: emailThreadId } });
	await db.suppressedDomain.deleteMany({ where: { domain: suppressedDomain } });
	await db.member.deleteMany({ where: { id: memberId } });
	await db.user.deleteMany({ where: { id: workspaceUserId } });
	await db.user.deleteMany({ where: { id: removedMemberUserId } });
	if (createdOrganization) {
		await db.organization.deleteMany({ where: { id: WORKSPACE_ID } });
	}
	if (previousAllowedSignIn.present) {
		if (previousAllowedSignIn.value === undefined) {
			delete process.env.ALLOWED_SIGN_IN;
		} else {
			process.env.ALLOWED_SIGN_IN = previousAllowedSignIn.value;
		}
	} else {
		delete process.env.ALLOWED_SIGN_IN;
	}
	if (previousSignInEmailAliases.present) {
		if (previousSignInEmailAliases.value === undefined) {
			delete process.env.SIGN_IN_EMAIL_ALIASES;
		} else {
			process.env.SIGN_IN_EMAIL_ALIASES = previousSignInEmailAliases.value;
		}
	} else {
		delete process.env.SIGN_IN_EMAIL_ALIASES;
	}
});

describe("inbound replay pure contracts", () => {
	it("canonicalizes JSON object order deterministically", () => {
		expect(canonicalInboundJson({ b: 2, a: { d: 4, c: 3 } })).toBe(
			'{"a":{"c":3,"d":4},"b":2}',
		);
		expect(
			websiteSourceDigest({
				externalId: "source",
				createdAtSource: new Date("2026-01-01T00:00:00.000Z"),
				name: null,
				email: "person@example.test",
				company: "Company",
				country: "GB",
				biggestPain: "Pain",
				notes: "Note",
				utm: { campaign: "campaign" },
				source: "website",
				sourcePath: "/request",
			}),
		).toMatch(/^[0-9a-f]{64}$/);
		const baseWebsiteDigest = websiteSourceDigest({
			externalId: "source",
			createdAtSource: new Date("2026-01-01T00:00:00.000Z"),
			name: null,
			email: "person@example.test",
			company: "Company",
			country: "GB",
			biggestPain: "Pain",
			notes: "Note",
			utm: { campaign: "campaign" },
			source: "website",
			sourcePath: "/request",
		});
		expect(
			websiteSourceDigest({
				externalId: "source",
				createdAtSource: new Date("2026-01-01T00:00:00.000Z"),
				name: null,
				email: "person@example.test",
				company: "Company",
				country: "US",
				biggestPain: "Pain",
				notes: "Note",
				utm: { campaign: "campaign" },
				source: "website",
				sourcePath: "/request",
			}),
		).not.toBe(baseWebsiteDigest);
		expect(
			emailSourceDigest({
				provider: "gmail",
				accountId: "account",
				objectId: "message",
				threadId: "thread",
				rfcMessageId: "rfc",
				direction: "INBOUND",
				sentAt: new Date("2026-01-01T00:00:00.000Z"),
				fromEmail: "person@example.test",
				fromName: null,
				recipients: [{ email: "other@example.test", name: null }],
			}),
		).toMatch(/^[0-9a-f]{64}$/);
		expect(inboundReplayPageWindow(100)).toEqual({
			request: 101,
			process: 100,
		});
		expect(inboundReplayPageWindow(500)).toEqual({
			request: 101,
			process: 100,
		});
		expect(
			inboundReplayOutcomeText({
				scanned: 500,
				receipts: 1,
				candidates: 1,
				observations: 1,
				duplicates: 0,
				duplicateReceipts: 0,
				duplicateCandidates: 0,
				duplicateObservations: 0,
				excluded: 0,
				hasMore: true,
				nextFormCursor: null,
				nextWebsiteCursor: "website-cursor",
				nextEmailCursor: null,
				formsDone: true,
				websiteDone: false,
				emailDone: true,
			}),
		).toContain("hasMore true");
	});
});

describe("persisted inbound replay", () => {
	it("is idempotent, versioned, proposal-only, and metadata-safe", async () => {
		const first = await runInboundCandidateReplay();
		const second = await runInboundCandidateReplay();
		const concurrent = await Promise.all([
			runInboundCandidateReplay(),
			runInboundCandidateReplay(),
		]);
		const receipts = await db.inboundSourceReceipt.findMany({
			where: { sourceObjectId: { in: [websiteExternalId, emailMessageId] } },
			select: {
				id: true,
				sourceObjectId: true,
				sourceDigest: true,
				redactedMetadata: true,
			},
		});
		const candidate = await db.contactCandidate.findFirst({
			where: { canonicalEmail: externalEmail },
			include: { observations: true },
		});
		const internalWebsiteCandidates = await db.contactCandidate.findMany({
			where: {
				canonicalEmail: {
					in: [
						workspaceMemberEmail,
						"richard@trylodeagent.io",
						"admin@trylodeagent.io",
					],
				},
			},
		});
		const suppressedCandidate = await db.contactCandidate.findFirst({
			where: { canonicalEmail: suppressedEmail },
		});
		const removedCandidate = await db.contactCandidate.findFirst({
			where: { canonicalEmail: removedMemberEmail },
		});
		expect(first.receipts).toBeGreaterThanOrEqual(2);
		expect(second.receipts).toBe(0);
		expect(second.duplicateReceipts).toBeGreaterThanOrEqual(2);
		expect(
			concurrent.every((result) => typeof result.hasMore === "boolean"),
		).toBe(true);
		expect(receipts.length).toBe(2);
		expect(candidate?.status).toBe(ContactCandidateStatus.PENDING);
		expect(suppressedCandidate?.status).toBe(
			ContactCandidateStatus.QUARANTINED,
		);
		expect(suppressedCandidate?.permissionState).toBe(
			ContactCandidatePermissionState.PROHIBITED,
		);
		expect(removedCandidate?.status).toBe(ContactCandidateStatus.PENDING);
		expect(internalWebsiteCandidates).toHaveLength(0);
		expect(
			candidate?.observations.some(
				(observation) => observation.observedName === null,
			),
		).toBe(true);
		expect(
			candidate?.observations.every(
				(observation) => observation.observedTitle === null,
			),
		).toBe(true);
		const emailReceiptIds = receipts
			.filter((receipt) => receipt.id)
			.map((receipt) => receipt.id);
		const internalObservations = await db.contactCandidateObservation.count({
			where: {
				receiptId: { in: emailReceiptIds },
				observedEmail: {
					in: ["richard@trylodeagent.io", "admin@trylodeagent.io"],
				},
			},
		});
		expect(internalObservations).toBe(0);
		const metadataText = JSON.stringify(
			receipts.map((receipt) => receipt.redactedMetadata),
		);
		expect(metadataText).not.toContain(`secret-subject-${suffix}`);
		expect(metadataText).not.toContain(`secret-body-${suffix}`);
		expect(metadataText).not.toContain("subject");
		expect(metadataText).not.toContain("body");
		expect(metadataText).not.toContain("ignored");
		const websiteReceipt = receipts.find(
			(receipt) => receipt.sourceObjectId === websiteExternalId,
		);
		expect(websiteReceipt?.sourceDigest).toBe(
			websiteSourceDigest({
				externalId: websiteExternalId,
				createdAtSource: new Date("2026-08-01T12:00:00.000Z"),
				name: null,
				email: externalEmail,
				company: "Replay Landscapes",
				country: null,
				biggestPain: null,
				notes: null,
				utm: { campaign: "ignored" },
				source: "request_access",
				sourcePath: "/request-access",
			}),
		);
		const observationDigests = await db.contactCandidateObservation.findMany({
			where: { receiptId: { in: receipts.map((receipt) => receipt.id) } },
			select: { receiptId: true, sourceDigest: true },
		});
		const digestByReceipt = new Map(
			receipts.map((receipt) => [receipt.id, receipt.sourceDigest]),
		);
		expect(
			observationDigests.every(
				(observation) =>
					observation.sourceDigest ===
					digestByReceipt.get(observation.receiptId),
			),
		).toBe(true);
		const emailReceipt = receipts.find(
			(receipt) => receipt.sourceObjectId === emailMessageId,
		);
		await db.emailMessage.update({
			where: { id: emailMessageId },
			data: {
				subject: `changed-subject-${suffix}`,
				body: `changed-body-${suffix}`,
			},
		});
		await runInboundCandidateReplay();
		const emailVersions = await db.inboundSourceReceipt.findMany({
			where: { sourceObjectId: emailMessageId },
			select: { sourceDigest: true },
		});
		expect(emailVersions).toHaveLength(1);
		expect(emailVersions[0]?.sourceDigest).toBe(emailReceipt?.sourceDigest);

		await db.websiteEnquiry.update({
			where: { externalId: websiteExternalId },
			data: { company: "Replay Landscapes Updated" },
		});
		await runInboundCandidateReplay();
		const versionedReceipts = await db.inboundSourceReceipt.count({
			where: { sourceObjectId: websiteExternalId },
		});
		expect(versionedReceipts).toBe(2);
	});

	it("proposes exact contacts without accepting or writing CRM records", async () => {
		const company = await db.company.create({
			data: {
				name: `Exact Replay Company ${suffix}`,
				domain: `exact-${suffix}.example.test`,
			},
		});
		const contact = await db.contact.create({
			data: {
				firstName: "Exact",
				lastName: "Replay",
				email: exactEmail,
				companyId: company.id,
			},
		});
		const beforeContacts = await db.contact.count();
		await db.websiteEnquiry.create({
			data: {
				externalId: `000000-replay-exact-${suffix}`,
				createdAtSource: new Date(),
				name: "Exact Replay",
				email: exactEmail,
				company: "Exact Replay Company",
				source: "request_access",
				utm: {},
				test: false,
			},
		});
		await db.contactCandidate.create({
			data: {
				identityKey: retainedContactCandidateHash({
					canonicalEmail: terminalEmail,
				}),
				rawEmail: terminalEmail,
				canonicalEmail: terminalEmail,
				status: ContactCandidateStatus.REJECTED,
				permissionState: ContactCandidatePermissionState.PROHIBITED,
				decisionById: workspaceUserId,
				decisionReason: "Human rejected for replay test",
				decidedAt: new Date("2026-08-03T12:00:00.000Z"),
			},
		});
		await db.websiteEnquiry.create({
			data: {
				externalId: terminalExternalId,
				createdAtSource: new Date(),
				name: "Terminal Replay",
				email: terminalEmail,
				company: "Terminal Replay Company",
				source: "request_access",
				utm: {},
				test: false,
			},
		});
		await runInboundCandidateReplay();
		const candidate = await db.contactCandidate.findFirst({
			where: { canonicalEmail: exactEmail },
		});
		expect(candidate).toMatchObject({
			status: ContactCandidateStatus.MATCH_PROPOSED,
			proposedContactId: contact.id,
			proposedCompanyId: company.id,
		});
		expect(candidate?.status).not.toBe(ContactCandidateStatus.ACCEPTED);
		const terminalCandidate = await db.contactCandidate.findFirst({
			where: { canonicalEmail: terminalEmail },
		});
		expect(terminalCandidate).toMatchObject({
			status: ContactCandidateStatus.REJECTED,
			decisionReason: "Human rejected for replay test",
		});
		expect(await db.contact.count()).toBe(beforeContacts);
		await db.contact.delete({ where: { id: contact.id } });
		await db.company.delete({ where: { id: company.id } });
		await runInboundCandidateReplay();
		const clearedCandidate = await db.contactCandidate.findFirst({
			where: { canonicalEmail: exactEmail },
		});
		expect(clearedCandidate).toMatchObject({
			status: ContactCandidateStatus.PENDING,
			proposedContactId: null,
			proposedCompanyId: null,
		});
		if (candidate?.id) {
			await db.contactCandidateObservation.deleteMany({
				where: { candidateId: candidate.id },
			});
		}
		await db.websiteEnquiry.deleteMany({
			where: { externalId: `000000-replay-exact-${suffix}` },
		});
		await db.contactCandidate.deleteMany({ where: { id: candidate?.id } });
		if (terminalCandidate?.id) {
			await db.contactCandidateObservation.deleteMany({
				where: { candidateId: terminalCandidate.id },
			});
		}
		await db.websiteEnquiry.deleteMany({
			where: { externalId: terminalExternalId },
		});
		if (terminalCandidate?.id) {
			await db.contactCandidate.delete({ where: { id: terminalCandidate.id } });
		}
	});

	it("does not create a task storm for a completed bucket", async () => {
		const first = await scheduleTask({
			kind: "inbound-candidate-replay",
			reason: "test",
			dueAt: new Date(),
			budget: 0,
			idempotencyKey: taskKey,
		});
		await db.agentTask.update({
			where: { id: first.id },
			data: { state: "SUCCEEDED", finishedAt: new Date(), leasedUntil: null },
		});
		const same = await scheduleTask({
			kind: "inbound-candidate-replay",
			reason: "test-again",
			dueAt: new Date(),
			budget: 0,
			idempotencyKey: taskKey,
		});
		const later = await scheduleTask({
			kind: "inbound-candidate-replay",
			reason: "later",
			dueAt: new Date(),
			budget: 0,
			idempotencyKey: `${taskKey}:later`,
		});
		expect(same.id).toBe(first.id);
		expect(later.id).not.toBe(first.id);
		await db.agentTask.delete({ where: { id: later.id } });
	});

	it("reuses one unfinished replay across concurrent new buckets", async () => {
		await db.agentTask.deleteMany({
			where: { kind: "inbound-candidate-replay", finishedAt: null },
		});
		const unfinished = await db.agentTask.create({
			data: {
				kind: "inbound-candidate-replay",
				reason: "replay-concurrency-test",
				dueAt: new Date(),
				budget: 0,
				idempotencyKey: `${taskKey}:old-bucket`,
			},
			select: { id: true },
		});
		await Promise.all([ensureInboundSyncTasks(), ensureInboundSyncTasks()]);
		const open = await db.agentTask.findMany({
			where: { kind: "inbound-candidate-replay", finishedAt: null },
			select: { id: true },
		});
		expect(open).toEqual([unfinished]);
		await db.agentTask.delete({ where: { id: unfinished.id } });
	});

	it("reuses the completed same-bucket task through the scheduler", async () => {
		await db.agentTask.deleteMany({
			where: { kind: "inbound-candidate-replay" },
		});
		await ensureInboundSyncTasks();
		const first = await db.agentTask.findFirst({
			where: { kind: "inbound-candidate-replay" },
			orderBy: { createdAt: "desc" },
			select: { id: true },
		});
		expect(first).not.toBeNull();
		if (!first) return;
		await db.agentTask.update({
			where: { id: first.id },
			data: { state: "SUCCEEDED", finishedAt: new Date(), leasedUntil: null },
		});
		await ensureInboundSyncTasks();
		const sameBucket = await db.agentTask.findMany({
			where: { kind: "inbound-candidate-replay" },
			select: { id: true },
		});
		expect(sameBucket).toEqual([first]);
		await db.agentTask.delete({ where: { id: first.id } });
	});
});
