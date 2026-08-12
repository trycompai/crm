import { describe, expect, it } from "bun:test";
import {
	DIRECT_KINDS,
	isDirectKind,
	PRIORITY,
	TASK_KINDS,
} from "../src/agent-tasks";

describe("brand visual identity lane", () => {
	it("keeps brand on the direct lane at priority 900", () => {
		expect(TASK_KINDS).toContain("brand");
		expect(DIRECT_KINDS).toContain("brand");
		expect(isDirectKind("brand")).toBe(true);
		expect(PRIORITY.brand).toBe(900);
	});

	it("orders brand ahead of research work a rep must open to see", () => {
		expect(PRIORITY.brand).toBeGreaterThan(PRIORITY.portrait);
		expect(PRIORITY.brand).toBeGreaterThan(PRIORITY.workspace);
		expect(PRIORITY.brand).toBeGreaterThan(PRIORITY.requested);
		expect(PRIORITY.brand).toBeGreaterThan(PRIORITY.meeting);
		expect(PRIORITY.brand).toBeGreaterThan(PRIORITY.identify);
		expect(PRIORITY.brand).toBeGreaterThan(PRIORITY.sweep);
		expect(PRIORITY.brand).toBeGreaterThan(PRIORITY.companyProfile);
		expect(PRIORITY.brand).toBeGreaterThan(PRIORITY.recheck);
	});

	it("keeps research kinds off the direct lane", () => {
		expect(isDirectKind("company-profile")).toBe(false);
		expect(isDirectKind("identify")).toBe(false);
		expect(isDirectKind("workspace-profile")).toBe(false);
		expect(isDirectKind("meeting-prep")).toBe(false);
		expect(isDirectKind("recheck")).toBe(false);
	});
});
