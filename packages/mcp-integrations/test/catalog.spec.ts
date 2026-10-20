import { describe, expect, test } from "bun:test";
import { vendorAccess, vendorBySlug } from "../src/catalog";
import { classifyTool, toolFingerprint } from "../src/tool";
import { parseVendor } from "../src/vendor";

describe("MCP catalog", () => {
	test("returns catalog entries by stable slug", () => {
		expect(vendorBySlug("linear")?.name).toBe("Linear");
		expect(vendorBySlug("supabase")?.name).toBe("Supabase");
		expect(vendorBySlug("missing")).toBeUndefined();
	});

	test("selects scopes by access mode", () => {
		const linear = vendorBySlug("linear");
		expect(linear).toBeDefined();
		if (!linear) throw new Error("Linear is missing");

		expect(vendorAccess(linear, "read_only").scopes).toEqual(["read"]);
		expect(vendorAccess(linear, "read_write").scopes).toEqual([
			"read",
			"write",
		]);
	});

	test("uses Supabase read-only transport and narrower scopes", () => {
		const supabase = vendorBySlug("supabase");
		expect(supabase).toBeDefined();
		if (!supabase) throw new Error("Supabase is missing");

		expect(vendorAccess(supabase, "read_only").url).toBe(
			"https://mcp.supabase.com/mcp?read_only=true",
		);
		expect(vendorAccess(supabase, "read_only").scopes).not.toContain(
			"database:write",
		);
		expect(vendorAccess(supabase, "read_write").scopes).toContain(
			"database:write",
		);
		expect(supabase.riskyTools).toContain("execute_sql");
	});

	test("rejects insecure resources", () => {
		expect(() =>
			parseVendor({
				slug: "unsafe",
				name: "Unsafe",
				mcp: {
					resource: "http://example.com/mcp",
					transport: "streamable-http",
				},
				auth: {
					kind: "mcp_oauth",
					authorizationServers: ["https://example.com"],
				},
				access: {
					read_only: { url: "https://example.com/mcp", scopes: ["read"] },
					read_write: { url: "https://example.com/mcp", scopes: ["read"] },
				},
				docsHosts: ["example.com"],
				source: {
					integrationsSh: "https://integrations.sh/example",
					tools: "https://example.com/docs",
					checkedAt: "2026-10-20",
				},
			}),
		).toThrow();
	});
});

describe("MCP tools", () => {
	const vendor = { riskyTools: ["publish_release"] };

	test("builds stable fingerprints", () => {
		const left = {
			name: "get_issue",
			description: "Gets one issue",
			inputSchema: {
				type: "object",
				properties: { team: { type: "string" }, id: { type: "string" } },
			},
			annotations: { readOnlyHint: true, destructiveHint: false },
		};
		const right = {
			annotations: { destructiveHint: false, readOnlyHint: true },
			inputSchema: {
				properties: { id: { type: "string" }, team: { type: "string" } },
				type: "object",
			},
			description: "Gets one issue",
			name: "get_issue",
		};

		expect(toolFingerprint(left)).toBe(toolFingerprint(right));
	});

	test("classifies known reads and changes", () => {
		expect(
			classifyTool(vendor, {
				name: "get_issue",
				inputSchema: {},
				annotations: { readOnlyHint: true },
			}),
		).toBe("read");
		expect(
			classifyTool(vendor, {
				name: "update_issue",
				inputSchema: {},
				annotations: { readOnlyHint: false, destructiveHint: false },
			}),
		).toBe("change");
	});

	test("fails unknown and overridden tools closed", () => {
		expect(classifyTool(vendor, { name: "mystery", inputSchema: {} })).toBe(
			"risky",
		);
		expect(
			classifyTool(vendor, {
				name: "publish_release",
				inputSchema: {},
				annotations: { readOnlyHint: true },
			}),
		).toBe("risky");
	});
});
