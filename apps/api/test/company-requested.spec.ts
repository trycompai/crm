import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { db } from "@crm/db";
import { AgentTriggerService } from "../src/agent/agent-trigger.service";

const suffix = process.env.TEST_RUN_ID ?? "company-requested-spec";
const name = `Requested Co ${suffix}`;
const reason = `A rep asked for a fresh look (${suffix})`;

const agent = new AgentTriggerService(db);

let companyId: string;

async function clean() {
	if (companyId) await db.agentTask.deleteMany({ where: { companyId } });
	await db.company.deleteMany({ where: { name } });
}

beforeAll(async () => {
	await db.company.deleteMany({ where: { name } });
	const company = await db.company.create({
		data: { name, domain: `requested-${suffix}.test`.toLowerCase() },
		select: { id: true },
	});
	companyId = company.id;
});

afterAll(clean);

describe("asking for a fresh look", () => {
	it("says what it actually queued", async () => {
		expect(await agent.companyRequested(companyId, reason)).toBe(true);

		expect(await agent.companyRequested(companyId, reason)).toBe(false);

		await db.agentTask.updateMany({
			where: { companyId, reason, finishedAt: null },
			data: { finishedAt: new Date(), outcome: "done" },
		});

		expect(await agent.companyRequested(companyId, reason)).toBe(true);
	});
});
