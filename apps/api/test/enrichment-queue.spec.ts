import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { db } from "@crm/db";
import { EnrichmentService } from "../src/enrichment/enrichment.service";

const suffix = process.env.TEST_RUN_ID ?? "enrichment-queue-spec";
const email = `queue-${suffix}@example.test`;
const name = `Queue Co ${suffix}`;
const kind = "test-queue-split";

const enrichment = new EnrichmentService(db);

const DAY_MS = 86_400_000;

let contactId: string;
let companyId: string;
let dueId: string;
let scheduledId: string;

async function clean() {
	await db.agentTask.deleteMany({ where: { kind } });
	await db.contact.deleteMany({ where: { email } });
	await db.company.deleteMany({ where: { name } });
}

beforeAll(async () => {
	await clean();

	const contact = await db.contact.create({
		data: { firstName: "Queue", lastName: "Split", email },
		select: { id: true },
	});
	const company = await db.company.create({
		data: { name },
		select: { id: true },
	});

	contactId = contact.id;
	companyId = company.id;

	const due = await db.agentTask.create({
		data: {
			kind,
			reason: "due now",
			dueAt: new Date(Date.now() - 60_000),
			budget: 4,
			companyId,
		},
		select: { id: true },
	});
	const scheduled = await db.agentTask.create({
		data: {
			kind,
			reason: "booked for later",
			dueAt: new Date(Date.now() + 90 * DAY_MS),
			budget: 4,
			contactId,
		},
		select: { id: true },
	});

	dueId = due.id;
	scheduledId = scheduled.id;
});

afterAll(clean);

describe("what the enrichment widget reads", () => {
	it("lists work that is due now", async () => {
		const queue = await enrichment.queue();

		expect(queue.rows.map((row) => row.id)).toContain(dueId);
		expect(queue.total).toBeGreaterThanOrEqual(1);
	});

	it("keeps work booked for a later day out of the count", async () => {
		const queue = await enrichment.queue();

		expect(queue.rows.map((row) => row.id)).not.toContain(scheduledId);
		expect(queue.scheduled.map((row) => row.id)).toContain(scheduledId);
		expect(queue.scheduledTotal).toBeGreaterThanOrEqual(1);
	});

	it("says when a booked record is looked at again", async () => {
		const queue = await enrichment.queue();
		const booked = queue.scheduled.find((row) => row.id === scheduledId);

		expect(booked?.due).toBe("In 3 months");
		expect(booked?.subject.id).toBe(contactId);
		expect(booked?.subject.name).toBe("Queue Split");
	});

	it("names the company a due row is about", async () => {
		const queue = await enrichment.queue();
		const row = queue.rows.find((entry) => entry.id === dueId);

		expect(row?.subject.id).toBe(companyId);
		expect(row?.line).toBe("Waiting");
	});
});
