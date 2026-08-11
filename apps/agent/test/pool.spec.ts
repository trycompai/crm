import { describe, expect, it } from "bun:test";
import { collapsing, runLimited } from "../agent/lib/pool";

describe("runLimited", () => {
	it("runs every item", async () => {
		const seen: number[] = [];

		await runLimited(3, [1, 2, 3, 4, 5, 6, 7], async (n) => {
			seen.push(n);
		});

		expect(seen.sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5, 6, 7]);
	});

	it("runs an item whose value is undefined", async () => {
		const seen: (number | undefined)[] = [];

		await runLimited(2, [1, undefined, 3], async (n) => {
			seen.push(n);
		});

		expect(seen).toHaveLength(3);
		expect(seen).toContain(3);
	});

	it("never exceeds the width it was given", async () => {
		let running = 0;
		let peak = 0;

		await runLimited(
			3,
			Array.from({ length: 20 }, (_, i) => i),
			async () => {
				running += 1;
				peak = Math.max(peak, running);
				await new Promise((resolve) => setTimeout(resolve, 5));
				running -= 1;
			},
		);

		expect(peak).toBe(3);
	});

	it("does nothing with nothing", async () => {
		let calls = 0;

		await runLimited(4, [], async () => {
			calls += 1;
		});

		expect(calls).toBe(0);
	});

	it("stops handing out items once the signal aborts", async () => {
		const controller = new AbortController();
		const seen: number[] = [];

		await runLimited(
			1,
			[1, 2, 3, 4],
			async (n) => {
				seen.push(n);
				if (n === 2) controller.abort();
			},
			controller.signal,
		);

		expect(seen).toEqual([1, 2]);
	});

	it("does not spawn more workers than items", async () => {
		let peak = 0;
		let running = 0;

		await runLimited(10, [1, 2], async () => {
			running += 1;
			peak = Math.max(peak, running);
			await new Promise((resolve) => setTimeout(resolve, 5));
			running -= 1;
		});

		expect(peak).toBeLessThanOrEqual(2);
	});
});

describe("collapsing", () => {
	it("still runs a poke that arrived during a failed drain", async () => {
		const runs: number[] = [];
		let release = () => {};
		const gate = new Promise<void>((resolve) => {
			release = resolve;
		});

		const drain = collapsing(async (n: number) => {
			runs.push(n);
			if (n === 1) {
				await gate;
				throw new Error("the drain failed");
			}
		});

		const first = drain(1);
		const second = drain(2).catch(() => {});
		release();

		await expect(first).rejects.toThrow("the drain failed");
		await second;

		expect(runs).toEqual([1, 2]);
	});

	it("folds every poke during a drain into one trailing run", async () => {
		const runs: number[] = [];
		let release = () => {};
		const gate = new Promise<void>((resolve) => {
			release = resolve;
		});

		const drain = collapsing(async (n: number) => {
			runs.push(n);
			if (n === 1) await gate;
		});

		const first = drain(1);
		void drain(2);
		void drain(3);
		release();
		await first;

		expect(runs).toEqual([1, 3]);
	});
});
