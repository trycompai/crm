import { describe, expect, it } from "bun:test";
import { nextTaskFocusId } from "@/app/(app)/[slug]/tasks/task-focus";

describe("task completion focus", () => {
	it("keeps focus on a task that remains visible", () => {
		expect(nextTaskFocusId(["first", "second"], "first", true)).toBe("first");
	});

	it("moves focus to the next task when the current task leaves", () => {
		expect(nextTaskFocusId(["first", "second", "third"], "second", false)).toBe(
			"third",
		);
	});

	it("moves focus to the previous task after the final task leaves", () => {
		expect(nextTaskFocusId(["first", "second"], "second", false)).toBe("first");
	});

	it("returns no task when the list becomes empty", () => {
		expect(nextTaskFocusId(["only"], "only", false)).toBeNull();
	});
});
