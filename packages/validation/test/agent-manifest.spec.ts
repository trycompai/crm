import { describe, expect, it } from "bun:test";
import {
	InvalidAgentManifest,
	parseAgentManifest,
} from "../src/agent-manifest";

const fingerprint = "a".repeat(64);

function baseManifest() {
	return {
		actions: [
			{
				type: "run.summary",
				provider: "crm",
				summary: "Summarize the run",
			},
		],
		triggers: [
			{
				type: "MANUAL",
				name: "Manual",
				summary: "Run manually",
				config: {},
			},
		],
		dataScope: {
			mode: "WORKSPACE",
			summary: "Use the workspace",
			resources: [],
		},
	};
}

function manifestWithMcp(mcp: unknown[]) {
	return { ...baseManifest(), mcp };
}

function grant(platformSlug: string, toolNames: string[]) {
	return {
		platformSlug,
		summary: `Use ${platformSlug}`,
		tools: toolNames.map((name) => ({
			name,
			fingerprint,
			callKind: "read",
			summary: `Use ${name}`,
		})),
	};
}

describe("agent MCP grants", () => {
	it("defaults an older manifest to no MCP grants", () => {
		const parsed = parseAgentManifest(baseManifest());

		expect(parsed.mcp).toEqual([]);
	});

	it("rejects a repeated platform grant", () => {
		expect(() =>
			parseAgentManifest(
				manifestWithMcp([
					grant("linear", ["list_issues"]),
					grant("linear", ["get_issue"]),
				]),
			),
		).toThrow(InvalidAgentManifest);
	});

	it("rejects a repeated tool grant", () => {
		expect(() =>
			parseAgentManifest(
				manifestWithMcp([grant("linear", ["list_issues", "list_issues"])]),
			),
		).toThrow(InvalidAgentManifest);
	});
});
