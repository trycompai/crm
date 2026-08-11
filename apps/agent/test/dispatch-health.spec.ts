import { describe, expect, it } from "bun:test";
import { settledWithin } from "../agent/lib/deadline";
import {
	DRAIN_TIMEOUT_MS,
	dispatchHealth,
	linkSession,
	runDirect,
} from "../agent/lib/dispatch";
import { collapsing } from "../agent/lib/pool";
import type { LeasedTask } from "../agent/lib/tasks";

describe("dispatch wedging", () => {
	it("swallows every later call while a sweep never settles", async () => {
		const gate = deferred();
		let runs = 0;

		const never = collapsing(async () => {
			runs += 1;
			await gate.promise;
		});

		const first = never();
		let second = "pending";
		const later = never().then(() => {
			second = "resolved";
		});

		expect(runs).toBe(1);
		expect(second).toBe("pending");

		gate.release();
		await Promise.all([first, later]);

		expect(second).toBe("resolved");
		expect(runs).toBe(2);
	});

	it("accepts the next sweep once a hung one is abandoned", async () => {
		const abandon = deferred();
		const finish = deferred();
		const gates = [abandon, finish];
		let runs = 0;

		const timed = collapsing(async () => {
			const gate = gates[runs];
			runs += 1;
			await gate?.promise;
			if (runs === 1) throw new Error("abandoned");
		});

		const hung = timed();
		abandon.release();
		await expect(hung).rejects.toThrow("abandoned");

		let after = "pending";
		const next = timed().then(() => {
			after = "recovered";
		});
		finish.release();
		await next;

		expect(after).toBe("recovered");
		expect(runs).toBe(2);
	});

	it("reports health before any sweep has run", () => {
		const health = dispatchHealth();

		expect(health.running).toBe(false);
		expect(health.abandonedSweeps).toBe(0);
		expect(health.unsettledSweeps).toBe(0);
		expect(health.pendingStarts).toBe(0);
		expect(health.pendingItems).toBe(0);
		expect(DRAIN_TIMEOUT_MS).toBeGreaterThan(0);
	});
});

function deferred() {
	let release!: () => void;
	const promise = new Promise<void>((resolve) => {
		release = resolve;
	});
	return { promise, release };
}

async function flush(): Promise<void> {
	await new Promise((resolve) => setTimeout(resolve, 5));
}

function directTask(overrides: Partial<LeasedTask> = {}): LeasedTask {
	return {
		id: "task_direct",
		contactId: null,
		companyId: null,
		dealId: null,
		kind: "brand",
		reason: "A new company",
		payload: null,
		budget: 0,
		attempts: 1,
		priority: 900,
		dueAt: new Date(),
		...overrides,
	};
}

describe("a direct task that outruns its item deadline", () => {
	it("keeps the work in flight and lets the late result settle it once", async () => {
		const gate = deferred();
		const outcomes: string[] = [];

		await runDirect(
			directTask(),
			async (task) => {
				await gate.promise;
				outcomes.push(task.id);
			},
			10,
		);

		expect(outcomes).toEqual([]);
		expect(dispatchHealth().pendingItems).toBe(1);

		gate.release();
		await flush();

		expect(outcomes).toEqual(["task_direct"]);
		expect(dispatchHealth().pendingItems).toBe(0);
	});

	it("counts nothing in flight when the work lands inside the deadline", async () => {
		let handled = 0;

		await runDirect(
			directTask(),
			async () => {
				handled += 1;
			},
			1_000,
		);

		expect(handled).toBe(1);
		expect(dispatchHealth().pendingItems).toBe(0);
	});

	it("holds a late failure in flight until it lands, then reconciles it", async () => {
		const gate = deferred();
		let raised = false;

		await runDirect(
			directTask(),
			async () => {
				await gate.promise;
				raised = true;
				throw new Error("the vendor refused");
			},
			10,
		);

		expect(raised).toBe(false);
		expect(dispatchHealth().pendingItems).toBe(1);

		gate.release();
		await flush();

		expect(raised).toBe(true);
		expect(dispatchHealth().pendingItems).toBe(0);
	});

	it("settles a failure inside the deadline without leaving it in flight", async () => {
		await runDirect(
			directTask(),
			async () => {
				throw new Error("the vendor refused");
			},
			1_000,
		);

		expect(dispatchHealth().pendingItems).toBe(0);
	});
});

describe("recording the session a research task accepted", () => {
	const link = { attempts: 3, retryMs: 1 };

	it("keeps trying until the write lands, so the task holds its session", async () => {
		const seen: string[] = [];
		let failures = 2;

		const linked = await linkSession(
			directTask({ id: "task_research", kind: "identify" }),
			"ses_1",
			async (taskId, sessionId) => {
				seen.push(`${taskId}:${sessionId}`);
				if (failures > 0) {
					failures -= 1;
					throw new Error("the database refused");
				}
			},
			link,
		);

		expect(linked).toBe(true);
		expect(seen).toHaveLength(3);
	});

	it("counts a session it could never record rather than losing it", async () => {
		const before = dispatchHealth().unlinkedSessions;

		const linked = await linkSession(
			directTask({ id: "task_research", kind: "identify" }),
			"ses_2",
			async () => {
				throw new Error("the database refused");
			},
			link,
		);

		expect(linked).toBe(false);
		expect(dispatchHealth().unlinkedSessions).toBe(before + 1);
	});
});

describe("settledWithin", () => {
	it("hands back the value of work that finished inside the deadline", async () => {
		const outcome = await settledWithin(Promise.resolve("session"), 50);

		expect(outcome).toEqual({ settled: true, value: "session" });
	});

	it("reports unsettled work without failing it, so a late send still lands", async () => {
		let accept: (value: string) => void = () => {};
		const send = new Promise<string>((resolve) => {
			accept = resolve;
		});

		const outcome = await settledWithin(send, 20);
		expect(outcome.settled).toBe(false);

		accept("session");
		await expect(send).resolves.toBe("session");
	});

	it("observes a rejection that lands after the deadline, so none escapes", async () => {
		let fail: (error: Error) => void = () => {};
		const send = new Promise<string>((_, reject) => {
			fail = reject;
		});

		const outcome = await settledWithin(send, 10);
		expect(outcome.settled).toBe(false);

		fail(new Error("the send failed late"));
		await flush();

		await expect(send).rejects.toThrow("the send failed late");
	});
});
