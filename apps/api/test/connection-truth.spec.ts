import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { WORKSPACE_ID } from "@crm/auth";
import { db, EmailDirection, EmailProvider } from "@crm/db";
import { writeAgentModel } from "@crm/db/settings";
import {
	AgentTriggerService,
	type InboundSyncTaskKind,
} from "../src/agent/agent-trigger.service";
import type { ResearchKeyService } from "../src/agent/research-key.service";
import type { BackfillService } from "../src/backfill/backfill.service";
import { InboundService } from "../src/inbound/inbound.service";
import type { ModelCatalogService } from "../src/settings/model-catalog.service";
import { SettingsService } from "../src/settings/settings.service";

const suffix = crypto.randomUUID();
const ownerId = `connection-owner-${suffix}`;
const memberId = `connection-member-${suffix}`;
const websiteExternalId = `connection-website-${suffix}`;
const agentMailInboxId = `connection-agentmail-${suffix}`;
const threadRoot = `connection-thread-${suffix}`;
const granolaExternalId = `connection-granola-${suffix}`;
const receiptDigest = crypto.randomUUID().replaceAll("-", "").padEnd(64, "0");
const candidateIdentity = crypto
	.randomUUID()
	.replaceAll("-", "")
	.padEnd(64, "1");
const modelTaskReason = `connection-model-task-${suffix}`;
const envKeys = [
	"LODE_WEBSITE_SUPABASE_SERVICE_ROLE_KEY",
	"AGENTMAIL_API_KEY",
	"AGENTMAIL_INBOX_ID",
	"GRANOLA_API_KEY",
	"AI_GATEWAY_API_KEY",
	"VERCEL_OIDC_TOKEN",
	"VERCEL_ENV",
	"NODE_ENV",
	"AI_GATEWAY_SPEND_PAUSED",
] as const;
const originalEnv = new Map(envKeys.map((key) => [key, process.env[key]]));
const queuedKinds: InboundSyncTaskKind[][] = [];
const agent = {
	syncInbound: async (kinds: readonly InboundSyncTaskKind[] = []) => {
		queuedKinds.push([...kinds]);
		return { configured: kinds.length, queued: kinds.length };
	},
} as unknown as AgentTriggerService;
const inbound = new InboundService(db, agent);
const settings = new SettingsService(
	db,
	{} as ModelCatalogService,
	{} as ResearchKeyService,
	{} as BackfillService,
);

let receiptBaseline = 0;
let candidateBaseline = 0;

function restoreEnv() {
	for (const key of envKeys) {
		const value = originalEnv.get(key);
		if (value === undefined) delete process.env[key];
		else process.env[key] = value;
	}
}

function clearConnectionEnv() {
	for (const key of envKeys) delete process.env[key];
}

beforeAll(async () => {
	clearConnectionEnv();
	receiptBaseline = await db.inboundSourceReceipt.count();
	candidateBaseline = await db.contactCandidate.count();
	await db.organization.upsert({
		where: { id: WORKSPACE_ID },
		update: {},
		create: {
			id: WORKSPACE_ID,
			name: "CRM",
			slug: "crm",
			createdAt: new Date(),
		},
	});
	await db.user.createMany({
		data: [
			{ id: ownerId, name: "Connection Owner", email: `${ownerId}@test.dev` },
			{
				id: memberId,
				name: "Connection Member",
				email: `${memberId}@test.dev`,
			},
		],
	});
	await db.member.createMany({
		data: [
			{
				id: `connection-owner-member-${suffix}`,
				organizationId: WORKSPACE_ID,
				userId: ownerId,
				role: "owner",
				createdAt: new Date(),
			},
			{
				id: `connection-member-member-${suffix}`,
				organizationId: WORKSPACE_ID,
				userId: memberId,
				role: "member",
				createdAt: new Date(),
			},
		],
	});
	await db.websiteEnquiry.create({
		data: {
			externalId: websiteExternalId,
			createdAtSource: new Date("2026-08-10T09:00:00.000Z"),
			name: "Connection Lead",
			email: `lead-${suffix}@example.test`,
			company: "Connection Landscapes",
			country: "GB",
			biggestPain: "Knowing what is live",
			source: "request_access",
			utm: {},
		},
	});
	await db.emailInbox.create({
		data: {
			provider: EmailProvider.AGENTMAIL,
			externalInboxId: agentMailInboxId,
			email: `agentmail-${suffix}@example.test`,
			isEnabled: true,
			lastSyncedAt: new Date("2026-08-10T10:00:00.000Z"),
		},
	});
	await db.emailThread.create({
		data: {
			rootMessageId: threadRoot,
			provider: EmailProvider.AGENTMAIL,
			externalThreadId: `connection-thread-provider-${suffix}`,
			firstMessageAt: new Date("2026-08-10T10:00:00.000Z"),
			lastMessageAt: new Date("2026-08-10T10:00:00.000Z"),
			messageCount: 1,
			messages: {
				create: {
					rfcMessageId: `${threadRoot}@example.test`,
					provider: EmailProvider.AGENTMAIL,
					externalInboxId: agentMailInboxId,
					externalMessageId: `connection-message-${suffix}`,
					direction: EmailDirection.INBOUND,
					fromEmail: `sender-${suffix}@example.test`,
					recipients: [`agentmail-${suffix}@example.test`],
					sentAt: new Date("2026-08-10T10:00:00.000Z"),
				},
			},
		},
	});
	await db.granolaNote.create({
		data: {
			externalId: granolaExternalId,
			title: "Connection Truth Call",
			attendees: [],
			folders: [],
			sourceCreatedAt: new Date("2026-08-10T11:00:00.000Z"),
			sourceUpdatedAt: new Date("2026-08-10T11:30:00.000Z"),
		},
	});
	await db.inboundSourceReceipt.create({
		data: {
			connector: "website",
			provider: "lode-website",
			accountId: "marketing",
			sourceObjectType: "lead",
			sourceObjectId: `connection-source-${suffix}`,
			sourceDigest: receiptDigest,
			sourceCreatedAt: new Date("2026-08-10T09:00:00.000Z"),
			sourceUpdatedAt: new Date("2026-08-10T09:00:00.000Z"),
			redactedMetadata: {},
		},
	});
	await db.contactCandidate.create({
		data: {
			identityKey: candidateIdentity,
			canonicalIdentityKey: `${candidateIdentity}:canonical`,
			rawEmail: `candidate-${suffix}@example.test`,
			canonicalEmail: `candidate-${suffix}@example.test`,
			status: "PENDING",
			permissionState: "REVIEW_REQUIRED",
		},
	});
});

afterAll(async () => {
	restoreEnv();
	await writeAgentModel(db, null);
	await db.agentTask.deleteMany({
		where: {
			OR: [
				{ reason: modelTaskReason },
				{ kind: "inbound-candidate-replay", reason: { contains: suffix } },
			],
		},
	});
	await db.contactCandidateObservation.deleteMany({
		where: { candidate: { identityKey: candidateIdentity } },
	});
	await db.contactCandidate.deleteMany({
		where: { identityKey: candidateIdentity },
	});
	await db.granolaNote.deleteMany({ where: { externalId: granolaExternalId } });
	await db.emailThread.deleteMany({ where: { rootMessageId: threadRoot } });
	await db.emailInbox.deleteMany({
		where: {
			provider: EmailProvider.AGENTMAIL,
			externalInboxId: agentMailInboxId,
		},
	});
	await db.websiteEnquiry.deleteMany({
		where: { externalId: websiteExternalId },
	});
	await db.member.deleteMany({
		where: { userId: { in: [ownerId, memberId] } },
	});
	await db.user.deleteMany({ where: { id: { in: [ownerId, memberId] } } });
});

describe("connection truth", () => {
	it("does not turn preserved historical rows into live configured connectors", async () => {
		clearConnectionEnv();

		const status = await inbound.status(ownerId);

		expect(status.website.configured).toBe(false);
		expect(status.website.canCheck).toBe(false);
		expect(status.website.hasHistoricalData).toBe(true);
		expect(status.agentMail.configured).toBe(false);
		expect(status.agentMail.canCheck).toBe(false);
		expect(status.agentMail.hasHistoricalData).toBe(true);
		expect(status.granola.configured).toBe(false);
		expect(status.granola.canCheck).toBe(false);
		expect(status.granola.hasHistoricalData).toBe(true);
		expect(status.replay.mode).toBe("proposal_only");
		expect(status.replay.receipts).toBeGreaterThanOrEqual(receiptBaseline + 1);
		expect(status.replay.candidates).toBeGreaterThanOrEqual(
			candidateBaseline + 1,
		);
	});

	it("queues only configured inbound source checks", async () => {
		clearConnectionEnv();
		process.env.LODE_WEBSITE_SUPABASE_SERVICE_ROLE_KEY = "configured";
		process.env.AGENTMAIL_API_KEY = "configured";
		process.env.AGENTMAIL_INBOX_ID = agentMailInboxId;
		queuedKinds.length = 0;

		const result = await inbound.syncNow(ownerId, "all");
		const missing = await inbound.syncNow(ownerId, "granola");

		expect(queuedKinds[0]).toEqual(["website-intake-sync", "agentmail-sync"]);
		expect(result.configured).toBe(2);
		expect(result.status.website.configured).toBe(true);
		expect(result.status.agentMail.configured).toBe(true);
		expect(result.status.granola.configured).toBe(false);
		expect(queuedKinds[1]).toEqual([]);
		expect(missing.configured).toBe(0);
	});

	it("reports AI Gateway configuration without fetching the live catalog", async () => {
		clearConnectionEnv();
		process.env.AI_GATEWAY_API_KEY = "configured";
		await writeAgentModel(db, {
			id: "test/model",
			contextWindowTokens: 200_000,
		});
		await db.agentTask.create({
			data: {
				kind: "company-profile",
				reason: modelTaskReason,
				priority: 1,
				budget: 1,
				dueAt: new Date("2026-08-10T12:00:00.000Z"),
				state: "FAILED",
				modelId: "test/model",
				outcome: "Gateway rejected the model request",
				finishedAt: new Date("2026-08-10T12:05:00.000Z"),
			},
		});

		const status = await settings.aiGatewayStatus();

		expect(status).toMatchObject({
			configured: true,
			paused: true,
			canTest: true,
			credentialSource: "ai_gateway_key",
			selectedId: "test/model",
			effectiveId: "test/model",
			lastError: "Gateway rejected the model request",
		});

		process.env.AI_GATEWAY_SPEND_PAUSED = "false";
		expect((await settings.aiGatewayStatus()).paused).toBe(false);

		process.env.AI_GATEWAY_SPEND_PAUSED = "FALSE";
		expect((await settings.aiGatewayStatus()).paused).toBe(true);

		process.env.AI_GATEWAY_SPEND_PAUSED = "false";
		delete process.env.AI_GATEWAY_API_KEY;
		process.env.VERCEL_OIDC_TOKEN = "provider-injected";
		expect(await settings.aiGatewayStatus()).toMatchObject({
			configured: false,
			paused: true,
			canTest: false,
			credentialSource: "vercel_oidc",
		});

		process.env.VERCEL_ENV = "production";
		expect(await settings.aiGatewayStatus()).toMatchObject({
			configured: false,
			paused: true,
			canTest: false,
			credentialSource: "vercel_oidc",
		});

		delete process.env.VERCEL_ENV;
		process.env.NODE_ENV = "production";
		expect(await settings.aiGatewayStatus()).toMatchObject({
			configured: false,
			paused: true,
			canTest: false,
			credentialSource: "vercel_oidc",
		});

		process.env.AI_GATEWAY_API_KEY = "configured";
		expect(await settings.aiGatewayStatus()).toMatchObject({
			configured: true,
			paused: false,
			canTest: true,
			credentialSource: "ai_gateway_key",
		});
	});
});
