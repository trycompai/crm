import { afterAll, describe, expect, it } from "bun:test";
import { db } from "@crm/db";
import { AgentTriggerService } from "../src/agent/agent-trigger.service";
import { OperatingKernelCleanupService } from "../src/operating-kernel/operating-kernel-cleanup.service";
import { OutreachService } from "../src/outreach/outreach.service";

const suffix = crypto.randomUUID();
const readyDomain = `supply-ready-${suffix}.example.test`;
const blockedDomain = `supply-blocked-${suffix}.example.test`;
const readyEmail = `buyer@${readyDomain}`;
const blockedEmail = `buyer@${blockedDomain}`;
const inboxId = `supply-status-${suffix}`;
const companyIds: string[] = [];
const contactIds: string[] = [];
const prospectIds: string[] = [];
const agent = {} as unknown as AgentTriggerService;
const outreach = new OutreachService(
	db,
	agent,
	new OperatingKernelCleanupService(),
);
const originalProviderPaused = process.env.PROVIDER_MUTATIONS_PAUSED;
const originalOutreachPaused = process.env.OUTREACH_SENDS_PAUSED;

function restoreEnv(key: string, value: string | undefined) {
	if (value === undefined) {
		delete process.env[key];
		return;
	}
	process.env[key] = value;
}

async function createPromotedProspect(input: {
	domain: string;
	email: string;
	name: string;
}) {
	const company = await db.company.create({
		data: { name: input.name, domain: input.domain },
	});
	companyIds.push(company.id);
	const contact = await db.contact.create({
		data: {
			firstName: "Buyer",
			email: input.email,
			companyId: company.id,
		},
	});
	contactIds.push(contact.id);
	const prospect = await db.prospect.create({
		data: {
			dedupeKey: `supply:${input.domain}`,
			region: "Test",
			country: "Test",
			countryCode: "GB",
			companyName: input.name,
			website: `https://${input.domain}`,
			status: "PROMOTED",
			routeStatus: "SEND_READY_REVIEW",
			routeEmail: input.email,
			emailAllowed: true,
			companyId: company.id,
			contactId: contact.id,
			sourceBatch: `supply:${suffix}`,
		},
	});
	prospectIds.push(prospect.id);
}

afterAll(async () => {
	restoreEnv("PROVIDER_MUTATIONS_PAUSED", originalProviderPaused);
	restoreEnv("OUTREACH_SENDS_PAUSED", originalOutreachPaused);
	await db.emailDraft.deleteMany({
		where: { prospectId: { in: prospectIds } },
	});
	await db.agentTask.deleteMany({ where: { prospectId: { in: prospectIds } } });
	await db.prospect.deleteMany({ where: { id: { in: prospectIds } } });
	await db.contact.deleteMany({ where: { id: { in: contactIds } } });
	await db.company.deleteMany({ where: { id: { in: companyIds } } });
	await db.emailInbox.deleteMany({
		where: { provider: "AGENTMAIL", externalInboxId: inboxId },
	});
	await db.suppressedDomain.deleteMany({
		where: { domain: blockedDomain },
	});
});

describe("outreach supply status", () => {
	it("separates promoted accounts from currently send-enabled routes", async () => {
		process.env.PROVIDER_MUTATIONS_PAUSED = "false";
		process.env.OUTREACH_SENDS_PAUSED = "false";
		const baseline = await outreach.supplyStatus();

		await db.emailInbox.create({
			data: {
				provider: "AGENTMAIL",
				externalInboxId: inboxId,
				email: `outreach@${readyDomain}`,
				isEnabled: true,
			},
		});
		await createPromotedProspect({
			domain: readyDomain,
			email: readyEmail,
			name: "Supply Ready",
		});
		await createPromotedProspect({
			domain: blockedDomain,
			email: blockedEmail,
			name: "Supply Blocked",
		});
		await db.suppressedDomain.create({
			data: { domain: blockedDomain, reason: "test suppression" },
		});

		const unpaused = await outreach.supplyStatus();

		expect(unpaused.approvedRoutes - baseline.approvedRoutes).toBe(2);
		expect(unpaused.blockedRoutes - baseline.blockedRoutes).toBe(1);
		expect(unpaused.sendEligible - baseline.sendEligible).toBe(1);

		process.env.PROVIDER_MUTATIONS_PAUSED = "true";

		const paused = await outreach.supplyStatus();

		expect(paused.sendingPaused).toBe(true);
		expect(paused.approvedRoutes).toBe(unpaused.approvedRoutes);
		expect(paused.sendEligible).toBe(0);
	});
});
