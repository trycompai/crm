import { describe, expect, it } from "bun:test";
import { DEFAULT_WORKSPACE_NAME } from "@crm/auth";
import { workspaceLabel } from "../lib/workspace-label";

describe("what the header calls this install", () => {
	it("does not say CRM twice before anybody has named the workspace", () => {
		expect(workspaceLabel(DEFAULT_WORKSPACE_NAME)).toBe("CRM");
	});

	it("falls back to CRM while the workspace is still loading", () => {
		expect(workspaceLabel(undefined)).toBe("CRM");
		expect(workspaceLabel("")).toBe("CRM");
		expect(workspaceLabel("   ")).toBe("CRM");
	});

	it("names the company once it has one", () => {
		expect(workspaceLabel("Acme")).toBe("Acme CRM");
		expect(workspaceLabel("  Acme  ")).toBe("Acme CRM");
	});

	it("does not repeat a company that already ends in CRM", () => {
		expect(workspaceLabel("Acme CRM")).toBe("Acme CRM");
		expect(workspaceLabel("Acme crm")).toBe("Acme crm");
	});

	it("still appends to a name that merely contains the letters", () => {
		expect(workspaceLabel("CRMSoft")).toBe("CRMSoft CRM");
	});
});
