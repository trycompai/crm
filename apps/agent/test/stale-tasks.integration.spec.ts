import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { db, EnrichmentStatus } from "@crm/db";
import { MAX_ATTEMPTS, RETIRED_OUTCOME } from "@crm/db/agent-tasks";
import { reconcileStaleTasks } from "../agent/lib/stale-tasks";

const kind = "recheck";

const REASON = "stale-spec";

const MINUTE_MS = 60_000;

async function clear() {
	await db.agentTask.deleteMany({ where: { reason: REASON } });
	await db.contact.deleteMany({ where: { email: { startsWith: "stale-" } } });
	await db.company.deleteMany({ where: { name: { startsWith: "Stale Co " } } });
}

beforeEach(clear);
afterEach(clear);

async function someone(status: EnrichmentStatus, enrichedAt?: Date) {
	return db.contact.create({
		data: {
			firstName: "Stale",
			email: `stale-${crypto.randomUUID()}@example.test`,
			enrichmentStatus: status,
			enrichedAt: enrichedAt ?? null,
		},
		select: { id: true },
	});
}

async function anAccount(status: EnrichmentStatus, enrichedAt?: Date) {
	return db.company.create({
		data: {
			name: `Stale Co ${crypto.randomUUID()}`,
			enrichmentStatus: status,
			enrichedAt: enrichedAt ?? null,
		},
		select: { id: true },
	});
}

async function queue(overrides: {
	kind?: string;
	contactId?: string;
	companyId?: string;
	attempts?: number;
	dueAt?: Date;
	startedAt?: Date | null;
	leasedUntil?: Date | null;
}) {
	return db.agentTask.create({
		data: {
			kind: overrides.kind ?? kind,
			reason: REASON,
			dueAt: overrides.dueAt ?? new Date(Date.now() - MINUTE_MS),
			priority: 0,
			budget: 4,
			contactId: overrides.contactId ?? null,
			companyId: overrides.companyId ?? null,
			attempts: overrides.attempts ?? 0,
			startedAt: overrides.startedAt ?? null,
			leasedUntil: overrides.leasedUntil ?? null,
		},
		select: { id: true },
	});
}

async function row(id: string) {
	return db.agentTask.findUnique({
		where: { id },
		select: { finishedAt: true, outcome: true, leasedUntil: true },
	});
}

describe("a task whose lease ran out", () => {
	it("gives up once the attempts are gone, and says so on the record", async () => {
		const contact = await someone(EnrichmentStatus.RUNNING);
		const task = await queue({
			contactId: contact.id,
			attempts: MAX_ATTEMPTS,
			startedAt: new Date(Date.now() - 30 * MINUTE_MS),
			leasedUntil: new Date(Date.now() - MINUTE_MS),
		});

		await reconcileStaleTasks();

		const closed = await row(task.id);
		expect(closed?.finishedAt).not.toBeNull();
		expect(closed?.outcome).toBe(RETIRED_OUTCOME);

		const settled = await db.contact.findUnique({
			where: { id: contact.id },
			select: { enrichmentStatus: true },
		});
		expect(settled?.enrichmentStatus).toBe(EnrichmentStatus.FAILED);
	});

	it("waits again when it still has attempts left", async () => {
		const contact = await someone(EnrichmentStatus.RUNNING);
		const task = await queue({
			contactId: contact.id,
			attempts: 1,
			startedAt: new Date(Date.now() - 30 * MINUTE_MS),
			leasedUntil: new Date(Date.now() - MINUTE_MS),
		});

		const sweep = await reconcileStaleTasks();
		expect(sweep.released).toBeGreaterThanOrEqual(1);

		const waiting = await row(task.id);
		expect(waiting?.finishedAt).toBeNull();
		expect(waiting?.leasedUntil).toBeNull();
	});
});

describe("a task that is still being worked on", () => {
	it("leaves a live lease alone", async () => {
		const contact = await someone(EnrichmentStatus.RUNNING);
		const task = await queue({
			contactId: contact.id,
			attempts: MAX_ATTEMPTS,
			startedAt: new Date(Date.now() - MINUTE_MS),
			leasedUntil: new Date(Date.now() + 10 * MINUTE_MS),
		});

		await reconcileStaleTasks();

		const held = await row(task.id);
		expect(held?.finishedAt).toBeNull();
		expect(held?.leasedUntil).not.toBeNull();
	});

	it("leaves a live lease alone even once the record reads complete", async () => {
		const account = await anAccount(EnrichmentStatus.COMPLETE, new Date());
		const task = await queue({
			companyId: account.id,
			attempts: 1,
			startedAt: new Date(Date.now() - MINUTE_MS),
			leasedUntil: new Date(Date.now() + 10 * MINUTE_MS),
		});

		await reconcileStaleTasks();
		expect((await row(task.id))?.finishedAt).toBeNull();
	});
});

describe("a task whose record is already done", () => {
	it("closes the row the work never closed", async () => {
		const startedAt = new Date(Date.now() - 30 * MINUTE_MS);
		const account = await anAccount(
			EnrichmentStatus.COMPLETE,
			new Date(Date.now() - 29 * MINUTE_MS),
		);
		const task = await queue({
			companyId: account.id,
			attempts: 1,
			startedAt,
			leasedUntil: new Date(Date.now() - MINUTE_MS),
		});

		const sweep = await reconcileStaleTasks();
		expect(sweep.closed).toBeGreaterThanOrEqual(1);

		const closed = await row(task.id);
		expect(closed?.finishedAt).not.toBeNull();
		expect(closed?.outcome).toContain("already up to date");
	});

	it("keeps event work that names a record the agent just enriched", async () => {
		const account = await anAccount(
			EnrichmentStatus.COMPLETE,
			new Date(Date.now() - 29 * MINUTE_MS),
		);
		const task = await queue({
			kind: "agent-event",
			companyId: account.id,
			attempts: 1,
			startedAt: new Date(Date.now() - 30 * MINUTE_MS),
			leasedUntil: new Date(Date.now() - MINUTE_MS),
		});

		await reconcileStaleTasks();

		expect((await row(task.id))?.finishedAt).toBeNull();
	});

	it("never closes a row another sweep is holding", async () => {
		const account = await anAccount(
			EnrichmentStatus.COMPLETE,
			new Date(Date.now() - 29 * MINUTE_MS),
		);
		const task = await queue({
			companyId: account.id,
			attempts: 1,
			startedAt: new Date(Date.now() - 30 * MINUTE_MS),
			leasedUntil: new Date(Date.now() - MINUTE_MS),
		});

		const findMany = db.agentTask.findMany;
		db.agentTask.findMany = async (...args) => {
			const rows = await findMany.apply(db.agentTask, args);
			await db.agentTask.update({
				where: { id: task.id },
				data: { leasedUntil: new Date(Date.now() + 10 * MINUTE_MS) },
			});

			return rows;
		};

		try {
			await reconcileStaleTasks();
		} finally {
			db.agentTask.findMany = findMany;
		}

		expect((await row(task.id))?.finishedAt).toBeNull();
	});

	it("keeps a record that finished before this work started", async () => {
		const account = await anAccount(
			EnrichmentStatus.COMPLETE,
			new Date(Date.now() - 60 * MINUTE_MS),
		);
		const task = await queue({
			companyId: account.id,
			attempts: 1,
			startedAt: new Date(Date.now() - 30 * MINUTE_MS),
			leasedUntil: new Date(Date.now() - MINUTE_MS),
		});

		await reconcileStaleTasks();
		expect((await row(task.id))?.finishedAt).toBeNull();
	});

	it("keeps work that is booked for a later day", async () => {
		const contact = await someone(EnrichmentStatus.COMPLETE, new Date());
		const task = await queue({
			contactId: contact.id,
			attempts: 0,
			dueAt: new Date(Date.now() + 90 * 24 * 60 * MINUTE_MS),
		});

		await reconcileStaleTasks();
		expect((await row(task.id))?.finishedAt).toBeNull();
	});

	it("keeps work nothing has picked up yet", async () => {
		const contact = await someone(EnrichmentStatus.COMPLETE, new Date());
		const task = await queue({ contactId: contact.id, attempts: 0 });

		await reconcileStaleTasks();
		expect((await row(task.id))?.finishedAt).toBeNull();
	});
});

describe("running it twice", () => {
	it("changes nothing the second time", async () => {
		const startedAt = new Date(Date.now() - 30 * MINUTE_MS);
		const account = await anAccount(
			EnrichmentStatus.COMPLETE,
			new Date(Date.now() - 29 * MINUTE_MS),
		);

		await queue({
			companyId: account.id,
			attempts: 1,
			startedAt,
			leasedUntil: new Date(Date.now() - MINUTE_MS),
		});
		await queue({
			contactId: (await someone(EnrichmentStatus.RUNNING)).id,
			attempts: 1,
			startedAt,
			leasedUntil: new Date(Date.now() - MINUTE_MS),
		});
		await queue({
			contactId: (await someone(EnrichmentStatus.RUNNING)).id,
			attempts: MAX_ATTEMPTS,
			startedAt,
			leasedUntil: new Date(Date.now() - MINUTE_MS),
		});

		const first = await reconcileStaleTasks();
		expect(first.closed).toBeGreaterThanOrEqual(1);
		expect(first.released).toBeGreaterThanOrEqual(1);
		expect(first.retired).toBeGreaterThanOrEqual(1);

		const second = await reconcileStaleTasks();
		expect(second.closed).toBe(0);
		expect(second.released).toBe(0);
		expect(second.retired).toBe(0);
	});

	it("reports a database failure instead of throwing", async () => {
		const findMany = db.agentTask.findMany;
		db.agentTask.findMany = () => {
			throw new Error("the database is unreachable");
		};

		try {
			const sweep = await reconcileStaleTasks();
			expect(sweep.error).toBe("the database is unreachable");
			expect(sweep.scanned).toBe(0);
		} finally {
			db.agentTask.findMany = findMany;
		}

		expect((await reconcileStaleTasks()).error).toBeNull();
	});

	it("keeps the counters a failed sweep already reached", async () => {
		await queue({
			contactId: (await someone(EnrichmentStatus.RUNNING)).id,
			attempts: 1,
			startedAt: new Date(Date.now() - 30 * MINUTE_MS),
			leasedUntil: new Date(Date.now() - MINUTE_MS),
		});

		const updateMany = db.agentTask.updateMany;
		db.agentTask.updateMany = () => {
			throw new Error("the write failed");
		};

		let sweep: Awaited<ReturnType<typeof reconcileStaleTasks>>;
		try {
			sweep = await reconcileStaleTasks();
		} finally {
			db.agentTask.updateMany = updateMany;
		}

		expect(sweep.error).toBe("the write failed");
		expect(sweep.scanned).toBeGreaterThanOrEqual(1);
	});
});
