import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { db } from "@crm/db";
import { AgentQueueService } from "../src/agent/agent-queue.service";

const suffix = process.env.TEST_RUN_ID ?? "agent-queue-spec";
const email = `badge-${suffix}@example.test`;
const name = `Badge Co ${suffix}`;
const kind = "test-queue-badge";

const queue = new AgentQueueService(db);

const DAY_MS = 86_400_000;

let contactId: string;
let companyId: string;

async function clean() {
	await db.agentTask.deleteMany({ where: { kind } });
	await db.contact.deleteMany({ where: { email } });
	await db.company.deleteMany({ where: { name } });
}

beforeAll(async () => {
	await clean();

	const contact = await db.contact.create({
		data: { firstName: "Badge", lastName: "Later", email },
		select: { id: true },
	});
	const company = await db.company.create({
		data: { name },
		select: { id: true },
	});

	contactId = contact.id;
	companyId = company.id;

	await db.agentTask.create({
		data: {
			kind,
			reason: "recheck in three months",
			dueAt: new Date(Date.now() + 90 * DAY_MS),
			budget: 4,
			contactId,
		},
	});

	await db.agentTask.create({
		data: {
			kind,
			reason: "due now",
			dueAt: new Date(Date.now() - 60_000),
			budget: 4,
			companyId,
		},
	});
});

afterAll(clean);

describe("the queued badge", () => {
	it("ignores a recheck booked for a later date", async () => {
		expect(await queue.queuedContacts([contactId])).not.toContain(contactId);
		expect(await queue.isQueued({ contactId })).toBe(false);
	});

	it("marks work that is due now", async () => {
		expect(await queue.queuedCompanies([companyId])).toContain(companyId);
		expect(await queue.isQueued({ companyId })).toBe(true);
	});

	it("asks for nothing when given no records", async () => {
		expect((await queue.queuedContacts([])).size).toBe(0);
		expect((await queue.queuedCompanies([])).size).toBe(0);
	});
});
