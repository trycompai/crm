import { describe, expect, it } from "bun:test";
import { APP_AUTH } from "../agent/lib/app-auth";
import { isAutomated } from "../agent/lib/approval";
import { taskAuth } from "../agent/lib/dispatch";
import { collapsing } from "../agent/lib/pool";
import type { LeasedTask } from "../agent/lib/tasks";

function deferred() {
	let release!: () => void;
	const promise = new Promise<void>((resolve) => {
		release = resolve;
	});
	return { promise, release };
}

describe("collapsing", () => {
	it("a burst of pokes is one drain and one catch-up, not one drain each", async () => {
		const gate = deferred();
		let runs = 0;

		const drain = collapsing(async () => {
			runs += 1;
			await gate.promise;
		});

		const all = [drain(), drain(), drain(), drain()];
		expect(runs).toBe(1);

		gate.release();
		await Promise.all(all);

		expect(runs).toBe(2);
	});

	it("work queued mid-drain gets a trailing run rather than waiting for the cron", async () => {
		const first = deferred();
		const second = deferred();
		const gates = [first, second];
		let runs = 0;

		const drain = collapsing(async () => {
			const gate = gates[runs];
			runs += 1;
			await gate?.promise;
		});

		const initial = drain();
		const during = drain();

		first.release();
		second.release();
		await Promise.all([initial, during]);

		expect(runs).toBe(2);
	});

	it("a failed drain does not wedge the next one", async () => {
		let runs = 0;

		const drain = collapsing(async () => {
			runs += 1;
			throw new Error("lane blew up");
		});

		await expect(drain()).rejects.toThrow("lane blew up");
		await expect(drain()).rejects.toThrow("lane blew up");

		expect(runs).toBe(2);
	});

	it("hands the trailing run the arguments of the poke that asked for it", async () => {
		const gate = deferred();
		const seen: string[] = [];

		const drain = collapsing(async (label: string) => {
			seen.push(label);
			if (seen.length === 1) await gate.promise;
		});

		const first = drain("cron");
		const second = drain("poke");

		gate.release();
		await Promise.all([first, second]);

		expect(seen).toEqual(["cron", "poke"]);
	});
});

function task(overrides: Partial<LeasedTask> = {}): LeasedTask {
	return {
		id: "task_1",
		contactId: "contact_1",
		companyId: null,
		dealId: null,
		kind: "identify",
		reason: "A new contact",
		payload: null,
		budget: 4,
		attempts: 1,
		priority: 100,
		dueAt: new Date(),
		...overrides,
	};
}

describe("taskAuth", () => {
	it("reads as the app principal, so an unattended turn is not asked to approve itself", () => {
		const auth = taskAuth(task());

		expect(isAutomated({ auth: { current: auth } })).toBe(true);
	});

	it("carries the record and the budget the preamble needs", () => {
		const auth = taskAuth(task({ companyId: "company_1" }));

		expect(auth.attributes).toMatchObject({
			taskKind: "identify",
			budget: "4",
			contactId: "contact_1",
			companyId: "company_1",
		});
	});

	it("omits the id of a record the task does not name", () => {
		const auth = taskAuth(task({ contactId: null, companyId: "company_1" }));

		expect(auth.attributes).not.toHaveProperty("contactId");
	});

	it("prefers the principal eve hands the schedule over our own copy", () => {
		const fromEve = { ...APP_AUTH, principalId: "eve:app", issuer: "eve" };
		const auth = taskAuth(task(), fromEve);

		expect(auth).toMatchObject({ issuer: "eve" });
		expect(isAutomated({ auth: { current: auth } })).toBe(true);
	});
});
