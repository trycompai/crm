import { describe, expect, it } from "bun:test";
import { capabilities, readLifecycleRole } from "../src/agents";

describe("lifecycleRole validation", () => {
	it("reads a valid role from a raw manifest", () => {
		expect(readLifecycleRole({ lifecycleRole: "qualify" })).toBe("qualify");
		expect(readLifecycleRole({ lifecycleRole: "engage" })).toBe("engage");
		expect(readLifecycleRole({ lifecycleRole: "nope" })).toBeNull();
		expect(readLifecycleRole({})).toBeNull();
	});

	it("accepts capabilities with an optional lifecycleRole", () => {
		const base = {
			actions: [{ type: "run.summary", provider: "crm", summary: "done" }],
			dataScope: { mode: "WORKSPACE" as const, summary: "all", resources: [] },
		};
		expect(capabilities.parse(base).lifecycleRole).toBeUndefined();
		expect(
			capabilities.parse({ ...base, lifecycleRole: "qualify" }).lifecycleRole,
		).toBe("qualify");
		expect(
			capabilities.parse({ ...base, lifecycleRole: "engage" }).lifecycleRole,
		).toBe("engage");
		expect(
			capabilities.safeParse({ ...base, lifecycleRole: "send" }).success,
		).toBe(false);
	});
});
