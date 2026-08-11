import { afterAll, describe, expect, it } from "bun:test";
import { db } from "@crm/db";
import { AgentTriggerService } from "../src/agent/agent-trigger.service";

const suffix = process.env.TEST_RUN_ID ?? "agent-trigger-concurrency-spec";
const prospectId = `prospect-${suffix}`;
const originalBridgeSecret = process.env.AGENT_BRIDGE_SECRET;

const trigger = new AgentTriggerService(db);

afterAll(async () => {
	await db.agentTask.deleteMany({ where: { prospectId } });
	if (originalBridgeSecret === undefined) {
		delete process.env.AGENT_BRIDGE_SECRET;
	} else {
		process.env.AGENT_BRIDGE_SECRET = originalBridgeSecret;
	}
});

describe("agent task enqueue concurrency", () => {
	it("queues one pending outreach compose task for a prospect", async () => {
		delete process.env.AGENT_BRIDGE_SECRET;
		await db.agentTask.deleteMany({ where: { prospectId } });

		await Promise.all(
			Array.from({ length: 8 }, () => trigger.composeOutreach(prospectId)),
		);

		expect(
			await db.agentTask.count({
				where: {
					prospectId,
					kind: "outreach-compose",
					finishedAt: null,
				},
			}),
		).toBe(1);
	});
});
