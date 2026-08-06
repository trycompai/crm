import { describe, expect, it } from "bun:test";
import {
	canReadAgent,
	isPrivateAgentDraft,
	TEAM_AGENT_STATUSES,
} from "../src/agent/agent-visibility";

describe("agent visibility", () => {
	it("keeps drafts private to their creator", () => {
		expect(canReadAgent("DRAFT", "creator", "creator")).toBe(true);
		expect(canReadAgent("DRAFT", "creator", "teammate")).toBe(false);
		expect(canReadAgent("DEPLOYING", "creator", "teammate")).toBe(false);
	});

	it("makes deployed lifecycle states visible to the team", () => {
		for (const status of TEAM_AGENT_STATUSES) {
			expect(canReadAgent(status, "creator", "teammate")).toBe(true);
		}
	});

	it("treats deployment as the ownership boundary", () => {
		expect(isPrivateAgentDraft("DRAFT")).toBe(true);
		expect(isPrivateAgentDraft("DEPLOYING")).toBe(true);
		expect(isPrivateAgentDraft("LIVE")).toBe(false);
	});
});
