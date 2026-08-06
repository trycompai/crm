import { describe, expect, it } from "bun:test";
import {
	builderCommandType,
	consumeBuilderCommand,
	consumeBuilderIntent,
	hasCreateAgentCommand,
} from "../lib/agent-builder";

describe("agent builder commands", () => {
	it("enters agent creation for slash commands and direct build requests", () => {
		expect(builderCommandType("/Create agent Flag stalled deals")).toBe(
			"CREATE_AGENT",
		);
		expect(builderCommandType("  /create agent summarize renewals")).toBe(
			"CREATE_AGENT",
		);
		expect(builderCommandType("Tell me about this customer")).toBe("CHAT");
		expect(builderCommandType("/Create agentic workflows")).toBe("CHAT");
		expect(builderCommandType("/create-agent Flag stalled deals")).toBe(
			"CREATE_AGENT",
		);
		expect(
			builderCommandType('Create an agent named "Stalled Deal Brief".'),
		).toBe("CREATE_AGENT");
		expect(builderCommandType("Build and save a new agent for renewals")).toBe(
			"CREATE_AGENT",
		);
		expect(builderCommandType("Build me an agent for stalled deals")).toBe(
			"CREATE_AGENT",
		);
		expect(builderCommandType("Build the agent I described above")).toBe(
			"CREATE_AGENT",
		);
		expect(builderCommandType("Please set up an agent for overdue deals")).toBe(
			"CREATE_AGENT",
		);
		expect(
			builderCommandType("I want you to create an agent for renewals"),
		).toBe("CREATE_AGENT");
		expect(builderCommandType("hey fucker plz create an agent to")).toBe(
			"CREATE_AGENT",
		);
		expect(builderCommandType("How do I create an agent?")).toBe("CHAT");
		expect(builderCommandType("Tell me how to create an agent")).toBe("CHAT");
		expect(builderCommandType("I do not want you to create an agent")).toBe(
			"CHAT",
		);
		expect(builderCommandType("Tell me about our agent workflows")).toBe(
			"CHAT",
		);
		expect(consumeBuilderCommand("/Create agent Flag stalled deals")).toEqual({
			commandType: "CREATE_AGENT",
			body: "Flag stalled deals",
		});
		expect(
			consumeBuilderIntent("Build an agent that flags stalled deals"),
		).toEqual({
			commandType: "CREATE_AGENT",
			body: "that flags stalled deals",
			invocation: "Build an agent",
		});
		expect(consumeBuilderIntent("hey fucker plz create an agent to")).toEqual({
			commandType: "CREATE_AGENT",
			body: "to",
			invocation: "create an agent",
		});
		expect(
			consumeBuilderIntent("Tell me about our agent workflows"),
		).toBeNull();
	});

	it("shows creation surfaces only after a creation command", () => {
		expect(hasCreateAgentCommand([{ commandType: "CHAT" }])).toBe(false);
		expect(
			hasCreateAgentCommand([
				{ commandType: "CHAT" },
				{ commandType: "CREATE_AGENT" },
			]),
		).toBe(true);
	});
});
