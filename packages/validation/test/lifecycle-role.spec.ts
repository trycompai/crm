import { describe, expect, it } from "bun:test";
import { capabilities, readLifecycleRole } from "../src/agents";

describe("lifecycleRole validation", () => {
	it("reads a valid role from a raw manifest", () => {
		expect(readLifecycleRole({ lifecycleRole: "qualify" })).toBe("qualify");
		expect(readLifecycleRole({ lifecycleRole: "engage" })).toBe("engage");
		expect(readLifecycleRole({ lifecycleRole: "advance" })).toBe("advance");
		expect(readLifecycleRole({ lifecycleRole: "close" })).toBe("close");
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
			capabilities.parse({ ...base, lifecycleRole: "advance" }).lifecycleRole,
		).toBe("advance");
		expect(
			capabilities.parse({ ...base, lifecycleRole: "close" }).lifecycleRole,
		).toBe("close");
		expect(
			capabilities.safeParse({ ...base, lifecycleRole: "send" }).success,
		).toBe(false);
	});
});
