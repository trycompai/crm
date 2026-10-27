import { describe, expect, it } from "bun:test";
import {
	closeRecordNavigation,
	getRecordNavigation,
	moveRecordNavigation,
	openRecordNavigation,
} from "@/components/crm/record-sheet/record-navigation";
import type { RecordRef } from "@/components/crm/record-sheet/record-stack";

const company: RecordRef = { kind: "company", id: "company" };
const first: RecordRef = { kind: "deal", id: "first" };
const second: RecordRef = { kind: "deal", id: "second" };
const third: RecordRef = { kind: "deal", id: "third" };
const contact: RecordRef = { kind: "contact", id: "contact" };

describe("record list navigation", () => {
	it("does not invent a queue for empty lists, direct links, or search opens", () => {
		expect(getRecordNavigation([], [])).toBeNull();
		expect(getRecordNavigation([first], [])).toBeNull();
		for (const refs of [undefined, [], [second]]) {
			const opened = openRecordNavigation([], [], first, refs);
			expect(getRecordNavigation(opened.stack, opened.queues)).toBeNull();
			expect(moveRecordNavigation(opened.stack, opened.queues, 1)).toBeNull();
		}
	});

	it("captures only the visible page order and preserves its filtered order", () => {
		const page = [third, first, second];
		const opened = openRecordNavigation([], [], first, page);
		page.reverse();
		expect(getRecordNavigation(opened.stack, opened.queues)).toEqual({
			index: 1,
			total: 3,
		});
		expect(
			moveRecordNavigation(opened.stack, opened.queues, -1)?.stack,
		).toEqual([third]);
		expect(moveRecordNavigation(opened.stack, opened.queues, 1)?.stack).toEqual(
			[second],
		);
	});

	it("stops at both bounds and keeps a single-record page truthful", () => {
		const opened = openRecordNavigation([], [], first, [first, second]);
		expect(moveRecordNavigation(opened.stack, opened.queues, -1)).toBeNull();
		const next = moveRecordNavigation(opened.stack, opened.queues, 1);
		expect(next).not.toBeNull();
		if (!next) throw new Error("Next record is missing.");
		expect(getRecordNavigation(next.stack, next.queues)).toEqual({
			index: 1,
			total: 2,
		});
		expect(moveRecordNavigation(next.stack, next.queues, 1)).toBeNull();
		const single = openRecordNavigation([], [], first, [first]);
		expect(getRecordNavigation(single.stack, single.queues)).toEqual({
			index: 0,
			total: 1,
		});
		expect(moveRecordNavigation(single.stack, single.queues, -1)).toBeNull();
		expect(moveRecordNavigation(single.stack, single.queues, 1)).toBeNull();
	});

	it("replaces only the top entry and keeps nested Back distinct from queue moves", () => {
		const parent = openRecordNavigation([], [], company, [company]);
		const opened = openRecordNavigation(parent.stack, parent.queues, first, [
			first,
			second,
		]);
		const moved = moveRecordNavigation(opened.stack, opened.queues, 1);
		if (!moved) throw new Error("Next record is missing.");
		expect(moved.stack).toEqual([company, second]);
		expect(moved.history).toBe("replace");
		const nested = openRecordNavigation(moved.stack, moved.queues, contact);
		expect(getRecordNavigation(nested.stack, nested.queues)).toBeNull();
		const back = closeRecordNavigation(nested.stack, nested.queues);
		expect(back.stack).toEqual([company, second]);
		expect(getRecordNavigation(back.stack, back.queues)).toEqual({
			index: 1,
			total: 2,
		});
		const parentBack = closeRecordNavigation(back.stack, back.queues);
		expect(parentBack.stack).toEqual([company]);
		expect(getRecordNavigation(parentBack.stack, parentBack.queues)).toEqual({
			index: 0,
			total: 1,
		});
	});

	it("pushes only the initial open and clears the queue on close", () => {
		const opened = openRecordNavigation([], [], first, [first, second]);
		expect(opened.history).toBe("push");
		const nested = openRecordNavigation(opened.stack, opened.queues, company);
		expect(nested.history).toBe("replace");
		const closed = closeRecordNavigation(nested.stack, nested.queues, true);
		expect(closed).toEqual({ stack: [], queues: [], history: "replace" });
		const reopened = openRecordNavigation(closed.stack, closed.queues, first);
		expect(getRecordNavigation(reopened.stack, reopened.queues)).toBeNull();
	});

	it("does not apply a queue to a different URL stack or record kind", () => {
		const opened = openRecordNavigation([], [], first, [first, second]);
		expect(getRecordNavigation([], opened.queues)).toBeNull();
		expect(getRecordNavigation([company, first], opened.queues)).toBeNull();
		expect(
			getRecordNavigation([{ kind: "contact", id: first.id }], opened.queues),
		).toBeNull();
		const searched = openRecordNavigation(opened.stack, opened.queues, first);
		expect(getRecordNavigation(searched.stack, searched.queues)).toBeNull();
	});

	it("keeps browser Back outside the queue and restores the same queue on Forward", () => {
		const opened = openRecordNavigation([], [], first, [first, second]);
		const moved = moveRecordNavigation(opened.stack, opened.queues, 1);
		if (!moved) throw new Error("Next record is missing.");
		const history: [RecordRef[], RecordRef[]] = [[], opened.stack];
		if (moved.history === "replace") history[1] = moved.stack;
		expect(history).toEqual([[], [second]]);
		expect(getRecordNavigation(history[0], moved.queues)).toBeNull();
		expect(getRecordNavigation(history[1], moved.queues)).toEqual({
			index: 1,
			total: 2,
		});
	});
});
