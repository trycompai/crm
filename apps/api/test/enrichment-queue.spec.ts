import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { db } from "@crm/db";
import {
	ENRICHMENT_PAGE,
	ENRICHMENT_PAGE_MAX,
	enrichmentQueueInput,
	pageSize,
} from "@crm/validation/enrichment-queue";
import { EnrichmentService } from "../src/enrichment/enrichment.service";

const suffix = process.env.TEST_RUN_ID ?? "enrichment-queue-spec";
const email = `queue-${suffix}@example.test`;
const name = `Queue Co ${suffix}`;
const kind = "test-queue-split";

const enrichment = new EnrichmentService(db);

const DAY_MS = 86_400_000;

const EXTRA_ROWS = 8;

let contactId: string;
let companyId: string;
let dueId: string;
let scheduledId: string;

async function clean() {
	await db.agentTask.deleteMany({ where: { kind } });
	await db.contact.deleteMany({ where: { email } });
	await db.contact.deleteMany({
		where: { email: { endsWith: `-${suffix}@example.test` } },
	});
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

	for (let index = 0; index < EXTRA_ROWS; index++) {
		const extra = await db.contact.create({
			data: {
				firstName: "Queue",
				lastName: `Page ${index}`,
				email: `page-${index}-${suffix}@example.test`,
			},
			select: { id: true },
		});

		await db.agentTask.create({
			data: {
				kind,
				reason: "due now",
				dueAt: new Date(Date.now() - 60_000),
				budget: 4,
				contactId: extra.id,
			},
		});
	}
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

	it("hands back exactly the number of rows asked for", async () => {
		const queue = await enrichment.queue(3);

		expect(queue.rows).toHaveLength(3);
		expect(queue.total).toBeGreaterThan(3);
	});

	it("counts every due task, not only the ones it returned", async () => {
		const page = await enrichment.queue(3);
		const all = await enrichment.queue(EXTRA_ROWS + 10);

		expect(page.total).toBe(all.total);
		expect(all.rows.length).toBeGreaterThan(page.rows.length);
	});

	it("treats a nonsense limit as one row, never as none", async () => {
		expect(await enrichment.queue(0)).toHaveProperty("rows.length", 1);
		expect(await enrichment.queue(-5)).toHaveProperty("rows.length", 1);
	});

	it("reads the whole page when asked for more than exists", async () => {
		const queue = await enrichment.queue(ENRICHMENT_PAGE_MAX);

		expect(queue.rows).toHaveLength(Math.min(queue.total, ENRICHMENT_PAGE_MAX));
	});
});

describe("the page size the queue will accept", () => {
	it("never returns nothing", () => {
		expect(pageSize(0)).toBe(1);
		expect(pageSize(-100)).toBe(1);
	});

	it("never reads past the maximum", () => {
		expect(pageSize(10_000)).toBe(ENRICHMENT_PAGE_MAX);
		expect(pageSize(ENRICHMENT_PAGE_MAX + 1)).toBe(ENRICHMENT_PAGE_MAX);
	});

	it("keeps a sane request as it is", () => {
		expect(pageSize(1)).toBe(1);
		expect(pageSize(20)).toBe(20);
		expect(pageSize(ENRICHMENT_PAGE_MAX)).toBe(ENRICHMENT_PAGE_MAX);
	});

	it("drops part rows and refuses a number that is not one", () => {
		expect(pageSize(7.9)).toBe(7);
		expect(pageSize(Number.NaN)).toBe(ENRICHMENT_PAGE);
		expect(pageSize(Number.POSITIVE_INFINITY)).toBe(ENRICHMENT_PAGE);
	});

	it("refuses a limit past the maximum at the boundary", () => {
		expect(enrichmentQueueInput.safeParse({ limit: 10_000 }).success).toBe(
			false,
		);
		expect(enrichmentQueueInput.safeParse({ limit: 0 }).success).toBe(false);
		expect(enrichmentQueueInput.parse({}).limit).toBe(ENRICHMENT_PAGE);
	});
});
