import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { db } from "@crm/db";
import { AgentQueueService } from "../src/agent/agent-queue.service";
import { AgentTriggerService } from "../src/agent/agent-trigger.service";
import { ProspectsService } from "../src/prospects/prospects.service";

const suffix = crypto.randomUUID();
const userId = `readiness-user-${suffix}`;
const inboxId = `readiness-inbox-${suffix}`;
const domain = `readiness-${suffix}.example.test`;
const routeEmail = `alex@${domain}`;
const companyIds: string[] = [];
const contactIds: string[] = [];
const prospectIds: string[] = [];
const receiptIds: string[] = [];
const draftIds: string[] = [];
const originalProviderPaused = process.env.PROVIDER_MUTATIONS_PAUSED;
const originalOutreachPaused = process.env.OUTREACH_SENDS_PAUSED;
const queue = {
	queuedProspects: async () => new Set<string>(),
	isQueued: async () => false,
} as unknown as AgentQueueService;
const prospects = new ProspectsService(db, {} as AgentTriggerService, queue);

let readyProspectId = "";
let gapProspectId = "";

function restoreEnv(key: string, value: string | undefined) {
	if (value === undefined) {
		delete process.env[key];
		return;
	}
	process.env[key] = value;
}

beforeAll(async () => {
	process.env.PROVIDER_MUTATIONS_PAUSED = "false";
	process.env.OUTREACH_SENDS_PAUSED = "false";
	await db.user.create({
		data: { id: userId, name: "Readiness User", email: `${userId}@test.dev` },
	});
	await db.emailInbox.create({
		data: {
			provider: "AGENTMAIL",
			externalInboxId: inboxId,
			email: `outreach@${domain}`,
			isEnabled: true,
		},
	});
	const company = await db.company.create({
		data: { name: "Readiness Landscapes", domain },
	});
	companyIds.push(company.id);
	const contact = await db.contact.create({
		data: {
			firstName: "Alex",
			lastName: "Ready",
			email: routeEmail,
			title: "Operations Director",
			companyId: company.id,
		},
	});
	contactIds.push(contact.id);
	const now = new Date();
	readyProspectId = (
		await db.prospect.create({
			data: {
				dedupeKey: `readiness:ready:${suffix}`,
				region: "Test",
				country: "United Kingdom",
				countryCode: "GB",
				companyName: "Readiness Landscapes",
				website: `https://${domain}`,
				status: "PROMOTED",
				routeStatus: "SEND_READY_REVIEW",
				enrichmentStatus: "COMPLETE",
				fitScore: 100,
				namedPerson: "Alex Ready",
				role: "Operations Director",
				routeEmail,
				emailAllowed: true,
				emailAllowedAt: now,
				emailAllowedById: userId,
				personSourceUrl: `https://${domain}/team/alex-ready`,
				draftSubject: "Crew scheduling at Readiness Landscapes",
				draftBody: "A retained proposal grounded in public evidence.",
				lastResearchedAt: now,
				nextResearchAt: new Date(now.getTime() + 24 * 60 * 60 * 1_000),
				sourceBatch: `readiness:${suffix}`,
				companyId: company.id,
				contactId: contact.id,
			},
		})
	).id;
	prospectIds.push(readyProspectId);
	for (const source of [
		{
			url: `https://${domain}/jobs/operations-manager`,
			sourceType: "OFFICIAL_JOB_POSTING",
			observed:
				"Operations Manager role coordinates crews, schedules and client updates.",
			signalDate: now,
		},
		{
			url: `https://${domain}/team/alex-ready`,
			sourceType: "OFFICIAL_TEAM",
			observed:
				"Alex Ready is Operations Director. Public work email alex@readiness.test is retired; current email " +
				routeEmail,
			signalDate: null,
		},
	]) {
		const receipt = await db.prospectSourceReceipt.create({
			data: {
				prospectId: readyProspectId,
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
				prospectId: readyProspectId,
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
	const sequenceId = crypto.randomUUID();
	for (const step of [1, 2, 3]) {
		const draft = await db.emailDraft.create({
			data: {
				provider: "AGENTMAIL",
				externalInboxId: inboxId,
				prospectId: readyProspectId,
				companyId: company.id,
				contactId: contact.id,
				createdById: userId,
				fromEmail: `outreach@${domain}`,
				recipients: [routeEmail],
				subject: `Step ${step}`,
				plainTextBody: `Body ${step}`,
				status: "PENDING_APPROVAL",
				experimentKey: `readiness-${suffix}`,
				variant: "A",
				sequenceId,
				sequenceStep: step,
				scheduledFor: now,
			},
		});
		draftIds.push(draft.id);
	}
	gapProspectId = (
		await db.prospect.create({
			data: {
				dedupeKey: `readiness:gap:${suffix}`,
				region: "Test",
				country: "France",
				countryCode: "FR",
				companyName: "Readiness Gap",
				website: `https://gap-${domain}`,
				enrichmentStatus: "FAILED",
				sourceBatch: `readiness:${suffix}`,
				enrichmentError: "No named person found",
			},
		})
	).id;
	prospectIds.push(gapProspectId);
});

afterAll(async () => {
	restoreEnv("PROVIDER_MUTATIONS_PAUSED", originalProviderPaused);
	restoreEnv("OUTREACH_SENDS_PAUSED", originalOutreachPaused);
	await db.agentTask.deleteMany({ where: { prospectId: { in: prospectIds } } });
	await db.emailDraft.deleteMany({ where: { id: { in: draftIds } } });
	await db.prospectEvidence.deleteMany({
		where: { prospectId: { in: prospectIds } },
	});
	await db.prospectSourceReceipt.deleteMany({
		where: { id: { in: receiptIds } },
	});
	await db.prospect.deleteMany({ where: { id: { in: prospectIds } } });
	await db.contact.deleteMany({ where: { id: { in: contactIds } } });
	await db.company.deleteMany({ where: { id: { in: companyIds } } });
	await db.emailInbox.deleteMany({
		where: { provider: "AGENTMAIL", externalInboxId: inboxId },
	});
	await db.user.deleteMany({ where: { id: userId } });
});

describe("prospect readiness", () => {
	it("reports a fully gated A/B/C prospect as send-eligible when execution is open", async () => {
		const prospect = await prospects.byId(readyProspectId);

		expect(prospect.readiness.sendEligible).toBe(true);
		expect(prospect.readiness.gaps).toEqual([]);
		expect(prospect.readiness.sequence).toMatchObject({
			activeDrafts: 3,
			pendingApproval: 3,
		});
		expect(prospect.readiness.actions.canApproveSequence).toBe(true);
	});

	it("shows concrete prospect gaps without inventing missing evidence", async () => {
		const prospect = await prospects.byId(gapProspectId);

		expect(prospect.readiness.sendEligible).toBe(false);
		expect(prospect.readiness.state).toBe("research_needed");
		expect(prospect.readiness.gaps.map((gap) => gap.key)).toEqual(
			expect.arrayContaining([
				"freshness",
				"currentJobEvidence",
				"namedPerson",
				"verifiedRoute",
				"jurisdictionPolicy",
				"abcDrafts",
			]),
		);
		expect(prospect.readiness.actions.canResearch).toBe(true);
		expect(prospect.readiness.actions.canApproveRoute).toBe(false);
	});

	it("includes readiness in the prospect list rows", async () => {
		const list = await prospects.list({
			q: "Readiness",
			sort: "",
			dir: "asc",
			page: 1,
			pageSize: 25,
			countryCode: "all",
			status: "all",
			routeStatus: "all",
			contact: "all",
		});
		const ready = list.rows.find((row) => row.id === readyProspectId);
		const gap = list.rows.find((row) => row.id === gapProspectId);

		expect(ready?.readiness.sendEligible).toBe(true);
		expect(gap?.readiness.gaps[0]?.key).toBe("freshness");
		expect(ready?.jobPostingCount).toBe(1);
	});
});
