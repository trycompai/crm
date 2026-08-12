import { describe, expect, it } from "bun:test";
import { brief } from "../agent/lib/dispatch";
import type { LeasedTask } from "../agent/lib/tasks";
import { PRIORITY } from "@crm/db/agent-tasks";

function task(kind: string, attempts = 1): LeasedTask {
	return {
		id: "task_test",
		kind,
		reason: "Meeting on Thu",
		priority: PRIORITY.meeting,
		budget: 10,
		attempts,
		contactId: "contact_test",
		companyId: null,
		dealId: null,
		payload: null,
		dueAt: new Date(),
	};
}

describe("meeting-prep dispatch brief", () => {
	it("tells the session to identify before writing", () => {
		const text = brief(task("meeting-prep"));
		expect(text).toMatch(/identity/i);
		expect(text).toMatch(/write_brief|brief/i);
		expect(text).toMatch(/meeting-prep/);
	});

	it("keeps meeting priority at 200", () => {
		expect(PRIORITY.meeting).toBe(200);
	});
});
