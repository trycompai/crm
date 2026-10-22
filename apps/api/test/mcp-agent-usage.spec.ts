import { describe, expect, test } from "bun:test";
import { agentsByMcpPlatform } from "../src/mcp/mcp-agent-usage";

const fingerprint = "a".repeat(64);

function manifest(platformSlug: string) {
	return {
		actions: [
			{
				type: "slack.message.post",
				provider: "slack",
				summary: "Post an update",
				destination: {
					kind: "channel",
					resolution: "chosen",
					id: "C123",
					label: "sales",
				},
			},
		],
		triggers: [
			{
				type: "MANUAL",
				name: "Manual run",
				summary: "When a record is created",
				config: {},
			},
		],
		dataScope: { mode: "WORKSPACE", summary: "Workspace data", resources: [] },
		mcp: [
			{
				platformSlug,
				summary: `Use ${platformSlug}`,
				tools: [
					{
						name: "list_records",
						fingerprint,
						callKind: "read",
						summary: "List records",
					},
				],
			},
		],
	};
}

describe("agentsByMcpPlatform", () => {
	test("groups deployed agents by their parsed MCP grant", () => {
		const grouped = agentsByMcpPlatform([
			{
				id: "agent-1",
				name: "Pipeline reporter",
				description: "Reports pipeline changes.",
				status: "LIVE",
				currentVersion: { manifest: manifest("linear") },
			},
			{
				id: "agent-2",
				name: "Database reviewer",
				description: null,
				status: "PAUSED",
				currentVersion: { manifest: manifest("supabase") },
			},
		]);

		expect(grouped.get("linear")).toEqual([
			{
				id: "agent-1",
				name: "Pipeline reporter",
				description: "Reports pipeline changes.",
				status: "LIVE",
			},
		]);
		expect(grouped.get("supabase")?.[0]?.name).toBe("Database reviewer");
	});

	test("rejects an unreadable stored manifest", () => {
		expect(() =>
			agentsByMcpPlatform([
				{
					id: "agent-1",
					name: "Broken agent",
					description: null,
					status: "LIVE",
					currentVersion: { manifest: { mcp: [] } },
				},
			]),
		).toThrow("manifest is unreadable");
	});
});
