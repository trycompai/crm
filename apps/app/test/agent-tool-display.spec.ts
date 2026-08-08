import { describe, expect, it } from "bun:test";
import { toolLabel } from "../lib/agent-tool-display";

const base = { label: "Ran a tool", pending: false };

describe("toolLabel", () => {
	it("names the artifact a builder file write produced", () => {
		expect(
			toolLabel({
				...base,
				tool: "write_agent_file",
				input: { path: "agent/instructions.md" },
				pending: true,
			}),
		).toBe("Writing instructions");
	});

	it("switches to the past tense once the write finished", () => {
		expect(
			toolLabel({
				...base,
				tool: "write_agent_file",
				input: { path: "agent/manifest.json" },
			}),
		).toBe("Wrote the manifest");
	});

	it("falls back to the raw path for an unmapped artifact", () => {
		expect(
			toolLabel({
				...base,
				tool: "write_agent_file",
				input: { path: "agent/other.md" },
			}),
		).toBe("Wrote agent/other.md");
	});

	it("labels the draft save under the tool the builder actually calls", () => {
		expect(
			toolLabel({
				...base,
				tool: "save_agent_draft",
				input: { name: "Collections nudge" },
			}),
		).toBe("Saved draft · Collections nudge");
	});

	it("keeps the generic label when the tool has no mapping", () => {
		expect(
			toolLabel({ ...base, tool: "web_search", input: { query: "acme" } }),
		).toBe("Ran a tool");
	});

	it("keeps the generic label when the input is missing", () => {
		expect(toolLabel({ ...base, tool: "write_agent_file", input: null })).toBe(
			"Ran a tool",
		);
	});
});
