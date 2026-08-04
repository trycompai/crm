import { afterAll, beforeEach, describe, expect, it } from "bun:test";
import { db } from "@crm/db";
import { PRIORITY } from "@crm/db/agent-tasks";
import { AgentTriggerService } from "../src/agent/agent-trigger.service";

const suffix = process.env.TEST_RUN_ID ?? "agent-trigger-spec";
const reasonPrefix = `agent-trigger-spec (${suffix})`;

const service = new AgentTriggerService(db);

const cleanup = () =>
	db.agentTask.deleteMany({
		where: {
			OR: [
				{ reason: { contains: reasonPrefix } },
				{ contactId: { startsWith: `contact-${suffix}-` } },
				{ companyId: { startsWith: `company-${suffix}-` } },
			],
		},
	});

beforeEach(async () => {
	await cleanup();
});

afterAll(async () => {
	await cleanup();
});

describe("AgentTriggerService", () => {
	it("queues a profile task when a contact is updated", async () => {
		const contactId = `contact-${suffix}-1`;

		await service.contactUpdated(
			contactId,
			`${reasonPrefix}: contact-updated`,
		);

		const task = await db.agentTask.findFirst({
			where: {
				contactId,
				kind: "profile",
			},
			orderBy: { createdAt: "desc" },
		});

		expect(task).not.toBeNull();
		expect(task?.priority).toBe(PRIORITY.requested);
		expect(task?.budget).toBe(6);
	});

	it("does not queue duplicate profile tasks while one is pending", async () => {
		const contactId = `contact-${suffix}-2`;

		await service.contactUpdated(
			contactId,
			`${reasonPrefix}: contact-updated-duplicate`,
		);
		await service.contactUpdated(
			contactId,
			`${reasonPrefix}: contact-updated-duplicate`,
		);

		const count = await db.agentTask.count({
			where: {
				contactId,
				kind: "profile",
				finishedAt: null,
			},
		});

		expect(count).toBe(1);
	});

	it("queues one company profile task for deal events while pending", async () => {
		const companyId = `company-${suffix}-1`;

		await service.dealCreated(companyId, `${reasonPrefix}: deal-created`);
		await service.dealStageChanged(
			companyId,
			"DEMO_BOOKED",
			`${reasonPrefix}: deal-stage-changed`,
		);

		const tasks = await db.agentTask.findMany({
			where: {
				companyId,
				kind: "company-profile",
				finishedAt: null,
			},
		});

		expect(tasks).toHaveLength(1);
		expect(tasks[0]?.priority).toBe(PRIORITY.requested);
	});
});
