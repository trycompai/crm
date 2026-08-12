import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { DealStage, db } from "@crm/db";
import { DEAL_SCORE } from "@crm/db/deal-score";
import { AgentTriggerService } from "../src/agent/agent-trigger.service";
import { DealScoreService } from "../src/deals/deal-score.service";

const suffix = process.env.TEST_RUN_ID ?? crypto.randomUUID().slice(0, 8);
const domain = `deal-score-${suffix}.test`;
const ownerId = `deal-score-owner-${suffix}`;
const now = new Date("2026-08-12T12:00:00.000Z");
const staleScoredAt = new Date("2026-08-10T12:00:00.000Z");
const freshScoredAt = new Date("2026-08-12T08:00:00.000Z");

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
const service = new DealScoreService(db, agent, cache as never);

let companyId = "";
let unscoredDealId = "";
let staleDealId = "";
let freshDealId = "";
let closedDealId = "";
let previousBridgeSecret: string | undefined;

async function clean() {
	const deals = [unscoredDealId, staleDealId, freshDealId, closedDealId].filter(
		Boolean,
	);
	if (deals.length > 0) {
		await db.agentTask.deleteMany({ where: { dealId: { in: deals } } });
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
			name: "Deal Score Owner",
			email: `${ownerId}@example.test`,
			emailVerified: true,
		},
	});

	const company = await db.company.create({
		data: { name: `Score Co ${suffix}`, domain },
		select: { id: true },
	});
	companyId = company.id;

	const unscored = await db.deal.create({
		data: {
			name: `Unscored ${suffix}`,
			companyId,
			ownerId,
			stage: DealStage.DEMO_BOOKED,
		},
		select: { id: true },
	});
	unscoredDealId = unscored.id;

	const stale = await db.deal.create({
		data: {
			name: `Stale score ${suffix}`,
			companyId,
			ownerId,
			stage: DealStage.QUALIFIED_TO_BUY,
			dealScore: 40,
			dealScoreSummary: "Old summary that needs refresh.",
			dealScoredAt: staleScoredAt,
			forecastContext: "Old forecast.",
		},
		select: { id: true },
	});
	staleDealId = stale.id;

	const fresh = await db.deal.create({
		data: {
			name: `Fresh score ${suffix}`,
			companyId,
			ownerId,
			stage: DealStage.CONTRACT_SENT,
			dealScore: 80,
			dealScoreSummary: "Still fresh enough.",
			dealScoredAt: freshScoredAt,
			forecastContext: "Fresh forecast.",
		},
		select: { id: true },
	});
	freshDealId = fresh.id;

	const closed = await db.deal.create({
		data: {
			name: `Closed score ${suffix}`,
			companyId,
			ownerId,
			stage: DealStage.CLOSED_WON,
			closedAt: staleScoredAt,
			dealScoredAt: null,
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

describe("deal-score enqueue", () => {
	it("queues open deals that lack a score or are past the rescore window", async () => {
		const first = await service.sweep(now);

		expect(first.scanned).toBeGreaterThanOrEqual(2);
		expect(first.queued).toBeGreaterThanOrEqual(2);

		const tasks = await db.agentTask.findMany({
			where: {
				kind: DEAL_SCORE.kind,
				dealId: {
					in: [unscoredDealId, staleDealId, freshDealId, closedDealId],
				},
				finishedAt: null,
			},
			select: { dealId: true, priority: true },
		});

		const ids = new Set(tasks.map((task) => task.dealId));
		expect(ids.has(unscoredDealId)).toBe(true);
		expect(ids.has(staleDealId)).toBe(true);
		expect(ids.has(freshDealId)).toBe(false);
		expect(ids.has(closedDealId)).toBe(false);
		expect(tasks.every((task) => task.priority === 80)).toBe(true);
	});

	it("does not double-queue while a deal-score task is open", async () => {
		const second = await service.sweep(now);

		expect(second.queued).toBe(0);
		expect(second.alreadyQueued).toBeGreaterThanOrEqual(2);

		const open = await db.agentTask.count({
			where: {
				kind: DEAL_SCORE.kind,
				dealId: { in: [unscoredDealId, staleDealId] },
				finishedAt: null,
			},
		});
		expect(open).toBe(2);
	});

	it("queues a single deal-score task from the trigger helper", async () => {
		await db.agentTask.deleteMany({
			where: { kind: DEAL_SCORE.kind, dealId: freshDealId },
		});

		const created = await agent.dealScore(freshDealId, "Stage changed");
		const again = await agent.dealScore(freshDealId, "Stage changed again");

		expect(created).toBe(true);
		expect(again).toBe(false);

		const open = await db.agentTask.count({
			where: {
				kind: DEAL_SCORE.kind,
				dealId: freshDealId,
				finishedAt: null,
			},
		});
		expect(open).toBe(1);
	});
});
