import { describe, expect, test } from "bun:test";
import { presentMcpConnection } from "../app/(app)/[slug]/settings/connections/mcp-connection-presentation";

const tools = [
	{
		name: "list_records",
		description: "Lists records.",
		fingerprint: "a".repeat(64),
		callKind: "read" as const,
		reviewState: "reviewed" as const,
		lastSeenAt: new Date("2026-10-20T12:00:00.000Z"),
	},
	{
		name: "update_record",
		description: "Updates a record.",
		fingerprint: "b".repeat(64),
		callKind: "change" as const,
		reviewState: "pending" as const,
		lastSeenAt: new Date("2026-10-20T12:00:00.000Z"),
	},
];

describe("presentMcpConnection", () => {
	test("prepares tool groups and filters for the client", () => {
		const presentation = presentMcpConnection({
			platformSlug: "linear",
			connection: null,
			agents: [],
			tools,
		});

		expect(presentation.groups.map((group) => group.label)).toEqual([
			"Read",
			"Change",
		]);
		expect(presentation.filters).toEqual([
			{ value: "all", label: "All", count: 2 },
			{ value: "read", label: "Read", count: 1 },
			{ value: "change", label: "Change", count: 1 },
			{ value: "risky", label: "Sensitive", count: 0 },
		]);
		expect(presentation.pendingReviewCount).toBe(1);
	});

	test("prepares failure, grouped scopes, and agents", () => {
		const presentation = presentMcpConnection({
			platformSlug: "linear",
			connection: {
				status: "error",
				accessMode: "read_write",
				grantedScopes: ["read", "write"],
				connectedAt: new Date("2026-10-20T10:00:00.000Z"),
				lastSuccessfulCallAt: new Date("2026-10-20T11:00:00.000Z"),
				lastErrorCode: "invalid_token",
			},
			agents: [
				{
					id: "agent-1",
					name: "Pipeline reporter",
					description: null,
					status: "LIVE",
				},
			],
			tools,
		});

		expect(presentation.overview).toMatchObject({
			failure: { code: "invalid_token" },
			scopeCount: 2,
			scopeGroups: [{ id: "access", scopes: ["read", "write"] }],
			permissionPanelSize: "content",
			defaultOpenScopeGroups: ["access"],
			agents: [{ id: "agent-1" }],
		});
	});

	test("keeps larger permission sets collapsed and scrollable", () => {
		const presentation = presentMcpConnection({
			platformSlug: "cloudflare",
			connection: {
				status: "connected",
				accessMode: "read_only",
				grantedScopes: ["ai.read", "logs.read", "dns.read"],
				connectedAt: new Date("2026-10-20T10:00:00.000Z"),
				lastSuccessfulCallAt: new Date("2026-10-20T11:00:00.000Z"),
				lastErrorCode: null,
			},
			agents: [],
			tools,
		});

		expect(presentation.overview).toMatchObject({
			permissionPanelSize: "scroll",
			defaultOpenScopeGroups: [],
		});
	});
});
