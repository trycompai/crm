import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { DealStage, db } from "@crm/db";
import { STALLED_DEAL } from "@crm/db/stalled-deals";
import { AgentTriggerService } from "../src/agent/agent-trigger.service";
import { StalledDealsService } from "../src/deals/stalled-deals.service";

const suffix = process.env.TEST_RUN_ID ?? crypto.randomUUID().slice(0, 8);
const domain = `stalled-${suffix}.test`;
const ownerId = `stalled-owner-${suffix}`;
const now = new Date("2026-08-12T12:00:00.000Z");
const staleAt = new Date("2026-07-20T12:00:00.000Z");
const freshAt = new Date("2026-08-10T12:00:00.000Z");

const agent = new AgentTriggerService(db);
const cache = {
	store: new Map<string, unknown>(),
	async get(key: string) {
		return this.store.get(key);
	},
	async set(key: string, value: unknown) {
		this.store.set(key, value);
	},
};
const service = new StalledDealsService(db, agent, cache as never);

let companyId = "";
let stalledDealId = "";
let freshDealId = "";
let closedDealId = "";
let previousBridgeSecret: string | undefined;

async function clean() {
	const deals = [stalledDealId, freshDealId, closedDealId].filter(Boolean);
	if (deals.length > 0) {
		await db.agentTask.deleteMany({ where: { dealId: { in: deals } } });
		await db.activity.deleteMany({ where: { dealId: { in: deals } } });
		await db.deal.deleteMany({ where: { id: { in: deals } } });
	}
	await db.company.deleteMany({ where: { domain } });
	await db.user.deleteMany({ where: { id: ownerId } });
}

beforeAll(async () => {
	previousBridgeSecret = process.env.AGENT_BRIDGE_SECRET;
	delete process.env.AGENT_BRIDGE_SECRET;
	await clean();

	await db.user.create({
		data: {
			id: ownerId,
			name: "Stalled Owner",
			email: `${ownerId}@example.test`,
			emailVerified: true,
		},
	});

	const company = await db.company.create({
		data: { name: `Stalled Co ${suffix}`, domain },
		select: { id: true },
	});
	companyId = company.id;

	const stalled = await db.deal.create({
		data: {
			name: `Stale Renewal ${suffix}`,
			companyId,
			ownerId,
			stage: DealStage.QUALIFIED_TO_BUY,
			createdAt: staleAt,
			lastActivityAt: staleAt,
		},
		select: { id: true },
	});
	stalledDealId = stalled.id;

	const fresh = await db.deal.create({
		data: {
			name: `Fresh Deal ${suffix}`,
			companyId,
			ownerId,
			stage: DealStage.DEMO_BOOKED,
			createdAt: freshAt,
			lastActivityAt: freshAt,
		},
		select: { id: true },
	});
	freshDealId = fresh.id;

	const closed = await db.deal.create({
		data: {
			name: `Closed Old ${suffix}`,
			companyId,
			ownerId,
			stage: DealStage.CLOSED_LOST,
			closedAt: staleAt,
			closedReason: "budget",
			createdAt: staleAt,
			lastActivityAt: staleAt,
		},
		select: { id: true },
	});
	closedDealId = closed.id;
});

afterAll(async () => {
	await clean();
	if (previousBridgeSecret === undefined) {
		delete process.env.AGENT_BRIDGE_SECRET;
	} else {
		process.env.AGENT_BRIDGE_SECRET = previousBridgeSecret;
	}
});

describe("stalled-deal detection", () => {
	it("enqueues one AgentTask for each open stalled deal", async () => {
		const first = await service.sweep(now);

		expect(first.scanned).toBeGreaterThanOrEqual(1);
		expect(first.queued).toBe(1);
		expect(first.alreadyQueued).toBe(0);

		const tasks = await db.agentTask.findMany({
			where: {
				kind: STALLED_DEAL.kind,
				dealId: { in: [stalledDealId, freshDealId, closedDealId] },
				finishedAt: null,
			},
			select: { dealId: true, reason: true, priority: true },
		});

		expect(tasks).toHaveLength(1);
		expect(tasks[0]?.dealId).toBe(stalledDealId);
		expect(tasks[0]?.reason).toContain("Stale Renewal");
		expect(tasks[0]?.reason).toContain("no activity");
	});

	it("does not double-queue while a task is still open", async () => {
		const second = await service.sweep(now);

		expect(second.queued).toBe(0);
		expect(second.alreadyQueued).toBe(1);

		const open = await db.agentTask.count({
			where: {
				kind: STALLED_DEAL.kind,
				dealId: stalledDealId,
				finishedAt: null,
			},
		});
		expect(open).toBe(1);
	});
});
