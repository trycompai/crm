import { describe, expect, test } from "bun:test";
import { vendorAccess, vendorBySlug, vendors } from "../src/catalog";
import { groupGrantedScopes } from "../src/scopes";
import { classifyTool, toolFingerprint } from "../src/tool";
import { parseVendor } from "../src/vendor";

describe("MCP catalog", () => {
	test("returns catalog entries by stable slug", () => {
		expect(vendors.map((vendor) => vendor.slug)).toEqual([
			"clerk",
			"cloudflare",
			"linear",
			"neon",
			"notion",
			"planetscale",
			"prisma",
			"supabase",
			"vercel",
		]);
		expect(vendorBySlug("missing")).toBeUndefined();
	});

	test("registers Notion through its hosted OAuth server", () => {
		const notion = vendorBySlug("notion");
		expect(notion).toBeDefined();
		if (!notion) throw new Error("Notion is missing");

		expect(notion.mcp.resource).toBe("https://mcp.notion.com/mcp");
		expect(notion.auth.authorizationServers).toEqual([
			"https://mcp.notion.com",
		]);
		expect(vendorAccess(notion, "read_only").scopes).toEqual(["default"]);
	});

	test("keeps every provider on an HTTPS hosted server", () => {
		for (const vendor of vendors) {
			expect(new URL(vendor.mcp.resource).protocol).toBe("https:");
			expect(vendor.access.read_only.scopes.length).toBeGreaterThan(0);
			expect(vendor.access.read_write.scopes.length).toBeGreaterThan(0);
		}
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

	test("uses Cloudflare code mode for a bounded tool catalog", () => {
		const cloudflare = vendorBySlug("cloudflare");
		expect(cloudflare).toBeDefined();
		if (!cloudflare) throw new Error("Cloudflare is missing");

		expect(vendorAccess(cloudflare, "read_only").url).toBe(
			"https://mcp.cloudflare.com/mcp",
		);
		expect(vendorAccess(cloudflare, "read_write").url).toBe(
			"https://mcp.cloudflare.com/mcp",
		);
	});

	test("groups every Cloudflare scope into a concise product area", () => {
		const cloudflare = vendorBySlug("cloudflare");
		expect(cloudflare).toBeDefined();
		if (!cloudflare) throw new Error("Cloudflare is missing");

		const groups = groupGrantedScopes(
			cloudflare.slug,
			cloudflare.access.read_write.scopes,
		);
		expect(groups).toHaveLength(13);
		expect(groups.some((group) => group.id === "other")).toBe(false);
		expect(groups.flatMap((group) => group.scopes)).toHaveLength(
			cloudflare.access.read_write.scopes.length,
		);
	});

	test("groups newer Cloudflare grants without an unclassified section", () => {
		const groups = groupGrantedScopes("cloudflare", [
			"cfspeed.read",
			"k2.consume",
		]);

		expect(groups.map((group) => group.id)).toEqual(["storage", "delivery"]);
	});

	test("rejects insecure resources", () => {
		expect(() =>
			parseVendor({
				slug: "unsafe",
				name: "Unsafe",
				presentation: {
					description: "Unsafe provider",
					bringsIn: "Unsafe data",
					sendsReadOnly: "Nothing",
					sendsReadWrite: "Unsafe changes",
				},
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
					providerDocs: "https://example.com/docs",
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
