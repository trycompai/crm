import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { db } from "@crm/db";
import {
	claimDue,
	completeTask,
	MAX_ATTEMPTS,
	retireExhausted,
	scheduleTask,
} from "../agent/lib/tasks";

const suffix = process.env.TEST_RUN_ID ?? "tasks-integration-spec";
const kind = `test-lease-${suffix}`;

const RESEARCH = { only: [kind] } as const;

function retire(limit?: number) {
	return retireExhausted(limit, RESEARCH);
}

async function clear() {
	await db.agentTask.deleteMany({ where: { kind } });
	await db.contact.deleteMany({ where: { email: { startsWith: "lease-" } } });
}

beforeEach(clear);
afterEach(clear);

async function queue(
	overrides: { priority?: number; dueAt?: Date; contactId?: string } = {},
) {
	return db.agentTask.create({
		data: {
			kind,
			reason: "test",
			dueAt: overrides.dueAt ?? new Date(Date.now() - 1000),
			priority: overrides.priority ?? 0,
			budget: 4,
			contactId: overrides.contactId ?? null,
		},
		select: { id: true },
	});
}

async function expire(taskId: string) {
	await db.agentTask.update({
		where: { id: taskId },
		data: { leasedUntil: new Date(Date.now() - 1000) },
	});
}

async function exhaust() {
	for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
		const claimed = await claimDue(10, RESEARCH);
		for (const task of claimed) await expire(task.id);
	}
}

async function someone() {
	return db.contact.create({
		data: {
			firstName: "Lease",
			email: `lease-${crypto.randomUUID()}@example.test`,
		},
		select: { id: true },
	});
}

describe("claimDue", () => {
	it("claims due work and leases it", async () => {
		const task = await queue();

		const claimed = await claimDue(10, RESEARCH);
		expect(claimed.map((t) => t.id)).toContain(task.id);

		const row = await db.agentTask.findUnique({ where: { id: task.id } });
		expect(row?.leasedUntil).not.toBeNull();
		expect(row?.startedAt).not.toBeNull();
	});

	it("does not hand the same row to two dispatchers", async () => {
		await Promise.all([queue(), queue(), queue()]);

		const [first, second] = await Promise.all([
			claimDue(3, RESEARCH),
			claimDue(3, RESEARCH),
		]);
		const ids = [...first, ...second].map((t) => t.id);

		expect(new Set(ids).size).toBe(ids.length);
		expect(ids).toHaveLength(3);
	});

	it("leaves work that is not due yet", async () => {
		await queue({ dueAt: new Date(Date.now() + 60_000) });
		const claimed = await claimDue(10, RESEARCH);
		expect(claimed).toHaveLength(0);
	});

	it("takes the most urgent first", async () => {
		const low = await queue({ priority: 0 });
		const high = await queue({ priority: 100 });

		const claimed = await claimDue(1, RESEARCH);
		expect(claimed[0]?.id).toBe(high.id);
		expect(claimed[0]?.id).not.toBe(low.id);
	});

	it("does not re-claim a leased row, and does re-claim an expired one", async () => {
		const task = await queue();
		await claimDue(10, RESEARCH);

		expect(await claimDue(10, RESEARCH)).toHaveLength(0);

		await db.agentTask.update({
			where: { id: task.id },
			data: { leasedUntil: new Date(Date.now() - 1000) },
		});

		expect((await claimDue(10, RESEARCH)).map((t) => t.id)).toContain(task.id);
	});

	it("stops handing out a row that has spent its attempts", async () => {
		const task = await queue();

		for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
			expect((await claimDue(10, RESEARCH)).map((t) => t.id)).toContain(
				task.id,
			);
			await expire(task.id);
		}

		expect(await claimDue(10, RESEARCH)).toHaveLength(0);
	});

	it("counts the attempts it has handed out", async () => {
		const task = await queue();

		expect((await claimDue(10, RESEARCH))[0]?.attempts).toBe(1);
		await expire(task.id);
		expect((await claimDue(10, RESEARCH))[0]?.attempts).toBe(2);
	});

	it("stops claiming once the work is finished", async () => {
		const task = await queue();
		await claimDue(10, RESEARCH);
		await completeTask(task.id, "ran");

		await db.agentTask.update({
			where: { id: task.id },
			data: { leasedUntil: null },
		});

		expect(await claimDue(10, RESEARCH)).toHaveLength(0);
	});

	it("gives each due row to one caller and no caller more than its limit", async () => {
		const mine: string[] = [];
		for (let row = 0; row < 8; row++) mine.push((await queue()).id);

		const results = await Promise.all(
			Array.from({ length: 4 }, () => claimDue(2, RESEARCH)),
		);
		for (const claimed of results) {
			expect(claimed.length).toBeLessThanOrEqual(2);
		}

		const ids = results.flatMap((claimed) => claimed.map((task) => task.id));
		expect(new Set(ids).size).toBe(ids.length);
		for (const id of ids) expect(mine).toContain(id);

		const leased = await db.agentTask.count({
			where: { id: { in: mine }, attempts: 1, leasedUntil: { not: null } },
		});
		expect(leased).toBe(ids.length);
	});
});

describe("retireExhausted", () => {
	it("gives up on a row that never reported back, and says who it was about", async () => {
		const contact = await someone();
		const task = await queue({ contactId: contact.id });

		for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
			await claimDue(10, RESEARCH);
			await expire(task.id);
		}

		const retired = await retire();
		expect(retired.map((t) => t.id)).toContain(task.id);
		expect(retired.find((t) => t.id === task.id)?.contactId).toBe(contact.id);

		const row = await db.agentTask.findUnique({ where: { id: task.id } });
		expect(row?.finishedAt).not.toBeNull();
		expect(row?.outcome).toContain("Gave up");
	});

	it("leaves a row that is still leased on its last attempt alone", async () => {
		const task = await queue();

		for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
			await claimDue(10, RESEARCH);
			if (attempt < MAX_ATTEMPTS - 1) await expire(task.id);
		}

		expect(await retire()).toHaveLength(0);
	});

	it("leaves work that still has attempts left", async () => {
		await queue();
		await claimDue(10, RESEARCH);

		expect(await retire()).toHaveLength(0);
	});

	it("retires no more rows than the limit allows", async () => {
		const mine: string[] = [];
		for (let row = 0; row < 3; row++) mine.push((await queue()).id);

		for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
			const claimed = await claimDue(10, RESEARCH);
			for (const task of claimed) await expire(task.id);
		}

		for (let pass = 0; pass < 3; pass++) {
			expect((await retire(2)).length).toBeLessThanOrEqual(2);
		}

		const open = await db.agentTask.count({
			where: { id: { in: mine }, finishedAt: null },
		});
		expect(open).toBe(0);
	});

	it("gives each exhausted row to one caller and no caller more than its limit", async () => {
		const mine: string[] = [];
		for (let row = 0; row < 8; row++) mine.push((await queue()).id);

		await exhaust();

		const results = await Promise.all(
			Array.from({ length: 4 }, () => retire(2)),
		);
		for (const retired of results) {
			expect(retired.length).toBeLessThanOrEqual(2);
		}

		const ids = results.flatMap((retired) => retired.map((task) => task.id));
		expect(new Set(ids).size).toBe(ids.length);
		for (const id of ids) expect(mine).toContain(id);

		const open = await db.agentTask.count({
			where: { id: { in: mine }, finishedAt: null },
		});
		expect(open).toBe(mine.length - ids.length);
	});
});

describe("completeTask", () => {
	it("retires a row once, and reports who it was about", async () => {
		const contact = await someone();
		const task = await queue({ contactId: contact.id });
		await claimDue(10, RESEARCH);

		const subject = await completeTask(task.id, "ran");
		expect(subject?.contactId).toBe(contact.id);

		expect(await completeTask(task.id, "ran again")).toBeNull();
		const row = await db.agentTask.findUnique({ where: { id: task.id } });
		expect(row?.outcome).toBe("ran");
	});
});

describe("scheduleTask", () => {
	it("books work with the agent's own reason", async () => {
		const dueAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);
		const { id } = await scheduleTask({
			kind,
			reason: "a job change here would move the Acme deal",
			dueAt,
		});

		const row = await db.agentTask.findUnique({ where: { id } });
		expect(row?.reason).toContain("Acme");
	});

	it("moves the existing booking rather than queueing a second one", async () => {
		const soon = new Date(Date.now() + 1000);
		const later = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000);

		const first = await scheduleTask({ kind, reason: "first", dueAt: soon });
		const second = await scheduleTask({ kind, reason: "second", dueAt: later });

		expect(second.id).toBe(first.id);
		expect(await db.agentTask.count({ where: { kind } })).toBe(1);
	});
});
