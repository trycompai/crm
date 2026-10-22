import { describe, expect, it } from "bun:test";
import { MCP_AUTH } from "../src/mcp-config";

const MINUTE_MS = 60_000;

describe("MCP authorization configuration", () => {
	it("keeps state valid for one hour during human authorization", () => {
		expect(MCP_AUTH.state.expiresMs).toBeGreaterThanOrEqual(60 * MINUTE_MS);
	});
});
