import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { ActivityType, DealStage, db } from "@crm/db";
import { PRIORITY } from "@crm/db/agent-tasks";
import { STALLED_DEAL } from "@crm/db/stalled-deals";
import { flagStalledDeal } from "../agent/lib/stalled-deal";
import type { LeasedTask } from "../agent/lib/tasks";

const suffix = process.env.TEST_RUN_ID ?? crypto.randomUUID().slice(0, 8);
const domain = `flag-stalled-${suffix}.test`;
const ownerId = `flag-owner-${suffix}`;
const staleAt = new Date("2026-07-20T12:00:00.000Z");

let companyId = "";
let dealId = "";

function task(over: Partial<LeasedTask> = {}): LeasedTask {
	return {
		id: `task-${suffix}`,
		contactId: null,
		companyId: null,
		dealId,
		kind: STALLED_DEAL.kind,
		reason: "Stale Renewal has had no activity for 23 days.",
		payload: null,
		budget: 1,
		attempts: 1,
		priority: PRIORITY.stalledDeal,
		dueAt: new Date(),
		...over,
	};
}

async function clean() {
	if (dealId) {
		await db.activity.deleteMany({ where: { dealId } });
		await db.deal.deleteMany({ where: { id: dealId } });
	}
	await db.company.deleteMany({ where: { domain } });
	await db.user.deleteMany({ where: { id: ownerId } });
}

beforeAll(async () => {
	await clean();

	await db.user.create({
		data: {
			id: ownerId,
			name: "Flag Owner",
			email: `${ownerId}@example.test`,
			emailVerified: true,
		},
	});

	const company = await db.company.create({
		data: { name: `Flag Co ${suffix}`, domain },
		select: { id: true },
	});
	companyId = company.id;

	const deal = await db.deal.create({
		data: {
			name: `Stale Renewal ${suffix}`,
			companyId,
			ownerId,
			stage: DealStage.CONTRACT_SENT,
			createdAt: staleAt,
			lastActivityAt: staleAt,
		},
		select: { id: true },
	});
	dealId = deal.id;
});

afterAll(clean);

describe("flagStalledDeal", () => {
	it("creates one owner task and leaves lastActivityAt alone", async () => {
		const before = await db.deal.findUniqueOrThrow({
			where: { id: dealId },
			select: { lastActivityAt: true },
		});

		const first = await flagStalledDeal(task());
		expect(first).toBe("Raised an owner task for the stalled deal.");

		const activities = await db.activity.findMany({
			where: {
				dealId,
				type: ActivityType.TASK,
				completedAt: null,
			},
			select: {
				subject: true,
				createdById: true,
				meta: true,
			},
		});

		expect(activities).toHaveLength(1);
		expect(activities[0]?.createdById).toBe(ownerId);
		expect(activities[0]?.subject).toContain("Re-engage:");
		expect(activities[0]?.meta).toMatchObject({
			source: STALLED_DEAL.source,
		});

		const after = await db.deal.findUniqueOrThrow({
			where: { id: dealId },
			select: { lastActivityAt: true },
		});
		expect(after.lastActivityAt?.getTime()).toBe(
			before.lastActivityAt?.getTime(),
		);

		const second = await flagStalledDeal(task());
		expect(second).toBe("Owner already has an open stalled-deal task.");

		const open = await db.activity.count({
			where: {
				dealId,
				type: ActivityType.TASK,
				completedAt: null,
				meta: { path: ["source"], equals: STALLED_DEAL.source },
			},
		});
		expect(open).toBe(1);
	});
});
