import { describe, expect, it } from "bun:test";
import { settledWithin } from "../agent/lib/deadline";
import { DRAIN_TIMEOUT_MS, dispatchHealth } from "../agent/lib/dispatch";
import { collapsing } from "../agent/lib/pool";

describe("dispatch wedging", () => {
	it("swallows every later call while a sweep never settles", async () => {
		const never = collapsing(async () => {
			await new Promise(() => {});
		});
		never().catch(() => {});

		let second = "pending";
		never()
			.then(() => {
				second = "resolved";
			})
			.catch(() => {
				second = "rejected";
			});
		await new Promise((resolve) => setTimeout(resolve, 150));

		expect(second).toBe("pending");
	});

	it("accepts the next sweep once a hung one is abandoned", async () => {
		const timed = collapsing(async () => {
			let timer: ReturnType<typeof setTimeout> | undefined;
			const bail = new Promise((_, reject) => {
				timer = setTimeout(() => reject(new Error("abandoned")), 100);
			});
			try {
				await Promise.race([new Promise(() => {}), bail]);
			} finally {
				clearTimeout(timer);
			}
		});

		await timed().catch(() => {});
		let after = "pending";
		const next = timed().catch(() => {
			after = "recovered";
		});
		await new Promise((resolve) => setTimeout(resolve, 300));
		await next.catch(() => {});

		expect(after).toBe("recovered");
	});

	it("reports health before any sweep has run", () => {
		const health = dispatchHealth();

		expect(health.running).toBe(false);
		expect(health.abandonedSweeps).toBe(0);
		expect(health.unsettledSweeps).toBe(0);
		expect(health.pendingStarts).toBe(0);
		expect(DRAIN_TIMEOUT_MS).toBeGreaterThan(0);
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
});
