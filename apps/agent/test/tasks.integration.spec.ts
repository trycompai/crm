import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { db } from "@crm/db";
import { DIRECT_KINDS } from "@crm/db/agent-tasks";
import {
	claimDue,
	completeTask,
	MAX_ATTEMPTS,
	noteSession,
	releaseTaskForRetry,
	retireExhausted,
	scheduleTask,
} from "../agent/lib/tasks";

const kind = "test-lease";

const RESEARCH = { except: DIRECT_KINDS } as const;

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
		expect(row?.state).toBe("LEASED");
	});

	it("does not claim work waiting for approval", async () => {
		const task = await queue();
		await db.agentTask.update({
			where: { id: task.id },
			data: { state: "WAITING_FOR_APPROVAL" },
		});

		expect(await claimDue(10, RESEARCH)).toHaveLength(0);
	});

	it("does not claim cancelled or unknown work", async () => {
		const cancelled = await queue();
		const unknown = await queue();
		await db.$transaction([
			db.agentTask.update({
				where: { id: cancelled.id },
				data: {
					state: "CANCELLED",
					finishedAt: new Date(),
					outcome: "Cancelled",
				},
			}),
			db.agentTask.update({
				where: { id: unknown.id },
				data: { state: "UNKNOWN" },
			}),
		]);

		expect(await claimDue(10, RESEARCH)).toHaveLength(0);
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
		const claimed = await claimDue(10, RESEARCH);
		await completeTask(task.id, claimed[0]?.attempts ?? 0, "ran");

		expect(await claimDue(10, RESEARCH)).toHaveLength(0);
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

		const retired = await retireExhausted();
		expect(retired.map((t) => t.id)).toContain(task.id);
		expect(retired.find((t) => t.id === task.id)?.contactId).toBe(contact.id);

		const row = await db.agentTask.findUnique({ where: { id: task.id } });
		expect(row?.finishedAt).not.toBeNull();
		expect(row?.outcome).toContain("Gave up");
		expect(row?.state).toBe("FAILED");
	});

	it("leaves a row that is still leased on its last attempt alone", async () => {
		const task = await queue();

		for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
			await claimDue(10, RESEARCH);
			if (attempt < MAX_ATTEMPTS - 1) await expire(task.id);
		}

		expect(await retireExhausted()).toHaveLength(0);
	});

	it("leaves work that still has attempts left", async () => {
		await queue();
		await claimDue(10, RESEARCH);

		expect(await retireExhausted()).toHaveLength(0);
	});

	it("does not retire a channel that is paused", async () => {
		const task = await queue();

		for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
			await claimDue(10, RESEARCH);
			await expire(task.id);
		}

		expect(await retireExhausted([kind])).toHaveLength(0);
		expect(
			await db.agentTask.findUnique({
				where: { id: task.id },
				select: { finishedAt: true, outcome: true },
			}),
		).toEqual({ finishedAt: null, outcome: null });
	});

	it("does not retire work waiting for approval", async () => {
		const task = await queue();
		await db.agentTask.update({
			where: { id: task.id },
			data: {
				attempts: MAX_ATTEMPTS,
				state: "WAITING_FOR_APPROVAL",
			},
		});

		expect(await retireExhausted()).toHaveLength(0);
		expect(
			await db.agentTask.findUnique({
				where: { id: task.id },
				select: { state: true, finishedAt: true },
			}),
		).toEqual({ state: "WAITING_FOR_APPROVAL", finishedAt: null });
	});

	it("does not retire cancelled or unknown work", async () => {
		const cancelled = await queue();
		const unknown = await queue();
		await db.$transaction([
			db.agentTask.update({
				where: { id: cancelled.id },
				data: {
					state: "CANCELLED",
					attempts: MAX_ATTEMPTS,
					finishedAt: new Date(),
					outcome: "Cancelled",
				},
			}),
			db.agentTask.update({
				where: { id: unknown.id },
				data: { state: "UNKNOWN", attempts: MAX_ATTEMPTS },
			}),
		]);

		expect(await retireExhausted()).toHaveLength(0);
		const rows = await db.agentTask.findMany({
			where: { id: { in: [cancelled.id, unknown.id] } },
			select: { state: true },
		});
		expect(rows.map((row) => row.state).sort()).toEqual([
			"CANCELLED",
			"UNKNOWN",
		]);
	});
});

describe("completeTask", () => {
	it("retires a row once, and reports who it was about", async () => {
		const contact = await someone();
		const task = await queue({ contactId: contact.id });
		const claimed = await claimDue(10, RESEARCH);
		const attempt = claimed[0]?.attempts ?? 0;

		const subject = await completeTask(task.id, attempt, "ran");
		expect(subject?.contactId).toBe(contact.id);

		expect(await completeTask(task.id, attempt, "ran again")).toBeNull();
		const row = await db.agentTask.findUnique({ where: { id: task.id } });
		expect(row?.outcome).toBe("ran");
		expect(row?.leasedUntil).toBeNull();
		expect(row?.state).toBe("SUCCEEDED");
	});

	it("does not let a stale worker complete work awaiting approval", async () => {
		const task = await queue();
		const claimed = await claimDue(10, RESEARCH);
		const attempt = claimed[0]?.attempts ?? 0;
		await db.agentTask.update({
			where: { id: task.id },
			data: { state: "WAITING_FOR_APPROVAL", leasedUntil: null },
		});

		expect(await completeTask(task.id, attempt, "stale")).toBeNull();
		expect(
			await db.agentTask.findUnique({
				where: { id: task.id },
				select: { state: true, finishedAt: true, outcome: true },
			}),
		).toEqual({
			state: "WAITING_FOR_APPROVAL",
			finishedAt: null,
			outcome: null,
		});
	});

	it("does not let a stale worker complete cancelled work", async () => {
		const task = await queue();
		const claimed = await claimDue(10, RESEARCH);
		const attempt = claimed[0]?.attempts ?? 0;
		const cancelledAt = new Date();
		await db.agentTask.update({
			where: { id: task.id },
			data: {
				state: "CANCELLED",
				leasedUntil: null,
				finishedAt: cancelledAt,
				outcome: "Cancelled",
			},
		});

		expect(await completeTask(task.id, attempt, "stale")).toBeNull();
		expect(
			await db.agentTask.findUnique({
				where: { id: task.id },
				select: { state: true, finishedAt: true, outcome: true },
			}),
		).toEqual({
			state: "CANCELLED",
			finishedAt: cancelledAt,
			outcome: "Cancelled",
		});
	});

	it("does not let an expired worker complete a later lease", async () => {
		const task = await queue();
		const first = (await claimDue(10, RESEARCH))[0];
		await expire(task.id);
		const second = (await claimDue(10, RESEARCH))[0];

		expect(
			await completeTask(task.id, first?.attempts ?? 0, "stale"),
		).toBeNull();
		expect(
			await completeTask(task.id, second?.attempts ?? 0, "current"),
		).not.toBeNull();
		expect(
			await db.agentTask.findUnique({
				where: { id: task.id },
				select: { attempts: true, outcome: true },
			}),
		).toEqual({ attempts: 2, outcome: "current" });
	});

	it("does not complete an expired lease before it is reclaimed", async () => {
		const task = await queue();
		const leased = (await claimDue(10, RESEARCH))[0];
		await expire(task.id);

		expect(
			await completeTask(task.id, leased?.attempts ?? 0, "expired"),
		).toBeNull();
		expect(
			await db.agentTask.findUnique({
				where: { id: task.id },
				select: { state: true, finishedAt: true, outcome: true },
			}),
		).toEqual({ state: "LEASED", finishedAt: null, outcome: null });
	});
});

describe("releaseTaskForRetry", () => {
	it("drops the lease and makes a finished turn retryable shortly", async () => {
		const task = await queue();
		const claimed = await claimDue(10, RESEARCH);
		await releaseTaskForRetry(task.id, claimed[0]?.attempts ?? 0, 250);

		const row = await db.agentTask.findUnique({ where: { id: task.id } });
		expect(row?.leasedUntil).toBeNull();
		expect(row?.finishedAt).toBeNull();
		expect(row?.state).toBe("QUEUED");
		expect(row?.dueAt.getTime()).toBeGreaterThan(Date.now());
		expect(row?.dueAt.getTime()).toBeLessThanOrEqual(Date.now() + 500);
	});

	it("does not let a stale worker retry work awaiting approval", async () => {
		const task = await queue();
		const claimed = await claimDue(10, RESEARCH);
		const attempt = claimed[0]?.attempts ?? 0;
		await db.agentTask.update({
			where: { id: task.id },
			data: { state: "WAITING_FOR_APPROVAL", leasedUntil: null },
		});

		expect(await releaseTaskForRetry(task.id, attempt, 250)).toBeNull();
		expect(
			await db.agentTask.findUnique({
				where: { id: task.id },
				select: { state: true, leasedUntil: true },
			}),
		).toEqual({ state: "WAITING_FOR_APPROVAL", leasedUntil: null });
	});

	it("does not let an expired worker retry a later lease", async () => {
		const task = await queue();
		const first = (await claimDue(10, RESEARCH))[0];
		await expire(task.id);
		const second = (await claimDue(10, RESEARCH))[0];

		expect(
			await releaseTaskForRetry(task.id, first?.attempts ?? 0, 250),
		).toBeNull();
		expect(
			await db.agentTask.findUnique({
				where: { id: task.id },
				select: { state: true, attempts: true },
			}),
		).toEqual({ state: "LEASED", attempts: 2 });
		expect(
			await releaseTaskForRetry(task.id, second?.attempts ?? 0, 250),
		).not.toBeNull();
	});

	it("does not retry an expired lease before it is reclaimed", async () => {
		const task = await queue();
		const leased = (await claimDue(10, RESEARCH))[0];
		await expire(task.id);

		expect(
			await releaseTaskForRetry(task.id, leased?.attempts ?? 0, 250),
		).toBeNull();
		expect(
			await db.agentTask.findUnique({
				where: { id: task.id },
				select: { state: true, leasedUntil: true },
			}),
		).toEqual({ state: "LEASED", leasedUntil: expect.any(Date) });
	});
});

describe("noteSession", () => {
	it("does not attach a session after work moves to approval", async () => {
		const task = await queue();
		const leased = (await claimDue(10, RESEARCH))[0];
		await db.agentTask.update({
			where: { id: task.id },
			data: { state: "WAITING_FOR_APPROVAL", leasedUntil: null },
		});

		expect(
			await noteSession(task.id, leased?.attempts ?? 0, "stale-session"),
		).toBe(false);
		expect(
			await db.agentTask.findUnique({
				where: { id: task.id },
				select: { sessionId: true },
			}),
		).toEqual({ sessionId: null });
	});

	it("does not attach an expired worker session to a later lease", async () => {
		const task = await queue();
		const first = (await claimDue(10, RESEARCH))[0];
		await expire(task.id);
		const second = (await claimDue(10, RESEARCH))[0];

		expect(
			await noteSession(task.id, first?.attempts ?? 0, "stale-session"),
		).toBe(false);
		expect(
			await noteSession(task.id, second?.attempts ?? 0, "current-session"),
		).toBe(true);
		expect(
			await db.agentTask.findUnique({
				where: { id: task.id },
				select: { attempts: true, sessionId: true },
			}),
		).toEqual({ attempts: 2, sessionId: "current-session" });
	});

	it("does not attach a session to an expired lease", async () => {
		const task = await queue();
		const leased = (await claimDue(10, RESEARCH))[0];
		await expire(task.id);

		expect(
			await noteSession(task.id, leased?.attempts ?? 0, "expired-session"),
		).toBe(false);
		expect(
			await db.agentTask.findUnique({
				where: { id: task.id },
				select: { sessionId: true },
			}),
		).toEqual({ sessionId: null });
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
